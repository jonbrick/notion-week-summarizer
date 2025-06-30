// src/utils/event-processor.js
// Main event processing pipeline for calendar events

const { extractEventDuration } = require("./time-utils");

/**
 * Extract core data from a raw Google Calendar event
 * @param {object} rawEvent - Raw Google Calendar event object
 * @returns {object} - Processed event object
 */
function extractEventData(rawEvent) {
  const duration = extractEventDuration(rawEvent);

  return {
    id: rawEvent.id,
    title: rawEvent.summary || "Untitled event",
    description: rawEvent.description || "",
    duration: duration,
    start: rawEvent.start,
    end: rawEvent.end,
    attendees: rawEvent.attendees || [],
    creator: rawEvent.creator,
    organizer: rawEvent.organizer,
    eventType: rawEvent.eventType || "default",
    status: rawEvent.status,
    responseStatus: getMyResponseStatus(rawEvent.attendees),
    rawEvent: rawEvent, // Keep reference for debugging
  };
}

/**
 * Get the user's RSVP status for an event
 * @param {array} attendees - Array of attendee objects
 * @returns {string} - Response status or null
 */
function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

/**
 * Determine if an event should be included in the summary
 * @param {object} event - Processed event object
 * @returns {boolean} - True if event should be included
 */
function shouldIncludeEvent(event) {
  // Filter out declined events
  if (event.responseStatus === "declined") {
    return false;
  }

  // Filter out all-day events (working location, etc.)
  if (event.duration && event.duration.isAllDay) {
    return false;
  }

  // Filter out events without valid duration
  if (
    !event.duration ||
    event.duration.minutes === null ||
    event.duration.minutes <= 0
  ) {
    return false;
  }

  // Filter out very short events (less than 15 minutes)
  if (event.duration.minutes < 15) {
    return false;
  }

  // Filter out specific event types
  if (
    event.eventType === "workingLocation" ||
    event.eventType === "outOfOffice"
  ) {
    return false;
  }

  // Filter out lunch and other noise by title
  const title = event.title.toLowerCase();
  const noiseKeywords = [
    "lunch",
    "can be moved",
    "home",
    "office",
    "remote",
    "wfh",
    "work from home",
    "out of office",
    "ooo",
    "vacation",
    "sick",
    "personal day",
  ];

  const isNoise = noiseKeywords.some((keyword) => title.includes(keyword));
  if (isNoise) {
    return false;
  }

  return true;
}

/**
 * Enhance event with meeting context and classification
 * @param {object} event - Processed event object
 * @returns {object} - Enhanced event object
 */
function enhanceEventContext(event) {
  const attendees = event.attendees || [];
  const attendeeCount = attendees.length;
  const isOrganizer = event.creator && event.creator.self === true;

  // Determine if this is a meeting or solo work
  const isMeeting =
    attendeeCount > 1 || (attendeeCount === 1 && !attendees[0].self);
  const isSoloWork = !isMeeting;

  // Extract clean attendee names (excluding self)
  const attendeeNames = attendees
    .filter((attendee) => !attendee.self)
    .map((attendee) => {
      // Extract first name from email or display name
      if (attendee.displayName && !attendee.displayName.includes("@")) {
        return attendee.displayName;
      }
      if (attendee.email) {
        // Extract name from email: "john.doe@company.com" -> "John"
        const namePart = attendee.email.split("@")[0];
        const firstName = namePart.split(".")[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1);
      }
      return "Unknown";
    })
    .filter((name) => name !== "Unknown");

  // Classify meeting type from title
  const title = event.title.toLowerCase();
  let meetingType = "meeting";

  if (title.includes("standup")) meetingType = "standup";
  else if (title.includes("planning")) meetingType = "planning";
  else if (title.includes("sync")) meetingType = "sync";
  else if (title.includes("demo")) meetingType = "demo";
  else if (title.includes("review")) meetingType = "review";
  else if (title.includes("1:1") || title.includes("one on one"))
    meetingType = "1:1";

  return {
    ...event,
    isMeeting,
    isSoloWork,
    isOrganizer,
    attendeeCount,
    attendeeNames,
    meetingType,
    category: "work", // Default to work for now, could be enhanced later
  };
}

/**
 * Group similar events and combine their durations
 * @param {array} events - Array of enhanced event objects
 * @returns {array} - Array with grouped events
 */
function groupSimilarEvents(events) {
  const grouped = {};

  events.forEach((event) => {
    // Create a key for grouping (normalize title)
    const groupKey = event.title.toLowerCase().trim();

    if (grouped[groupKey]) {
      // Add to existing group
      grouped[groupKey].duration.minutes += event.duration.minutes;
      grouped[groupKey].duration.hours += event.duration.hours;
      grouped[groupKey].occurrences = (grouped[groupKey].occurrences || 1) + 1;
      grouped[groupKey].events.push(event);
    } else {
      // Create new group
      grouped[groupKey] = {
        ...event,
        occurrences: 1,
        events: [event],
      };
    }
  });

  // Convert back to array and update formatted duration
  return Object.values(grouped).map((group) => {
    if (group.occurrences > 1) {
      // Recalculate formatted duration for grouped events
      const { formatDuration } = require("./time-utils");
      group.duration.formatted = formatDuration(group.duration.minutes);
    }
    return group;
  });
}

/**
 * Format event for AI consumption
 * @param {object} event - Enhanced and possibly grouped event
 * @returns {string} - Formatted string for AI
 */
function formatEventForAI(event) {
  let formatted = "";

  if (event.isSoloWork) {
    // Solo work: "Dashboard building ux (8.5 hours)"
    formatted = `${event.title} (${event.duration.formatted})`;
  } else {
    // Meeting: "meeting with Chelsea and Madison (30 minutes)"
    let meetingDesc = "";

    if (event.meetingType === "sync" && event.attendeeNames.length > 0) {
      meetingDesc = `sync with ${event.attendeeNames.join(" and ")}`;
    } else if (event.attendeeNames.length > 0) {
      meetingDesc = `${event.meetingType} with ${event.attendeeNames.join(
        " and "
      )}`;
    } else {
      // Fallback to event title if no attendees found
      meetingDesc = event.title;
    }

    formatted = `${meetingDesc} (${event.duration.formatted})`;
  }

  // Add occurrence count if grouped
  if (event.occurrences && event.occurrences > 1) {
    formatted = formatted.replace(
      `(${event.duration.formatted})`,
      `(${event.occurrences} sessions, ${event.duration.formatted} total)`
    );
  }

  return formatted;
}

/**
 * Main processing pipeline - converts raw calendar events to AI-ready strings
 * @param {array} rawEvents - Array of raw Google Calendar events
 * @returns {array} - Array of formatted strings ready for AI
 */
function processCalendarEvents(rawEvents) {
  console.log(`📥 Processing ${rawEvents.length} raw events...`);

  const processed = rawEvents
    .map(extractEventData)
    .filter(shouldIncludeEvent)
    .map(enhanceEventContext);

  console.log(`🔍 After filtering: ${processed.length} events remain`);

  const grouped = groupSimilarEvents(processed);
  console.log(`📦 After grouping: ${grouped.length} unique events`);

  const formatted = grouped.map(formatEventForAI);

  console.log(`✅ Formatted for AI:`);
  formatted.forEach((item, index) => {
    console.log(`   ${index + 1}. ${item}`);
  });

  return formatted;
}

module.exports = {
  extractEventData,
  shouldIncludeEvent,
  enhanceEventContext,
  groupSimilarEvents,
  formatEventForAI,
  processCalendarEvents,
};
