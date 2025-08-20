const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("../../src/utils/auth-utils");
const { extractEventDuration } = require("../../src/utils/time-utils");
const { getWeekDateRange } = require("./pull-personal-tasks");
require("dotenv").config();

// Initialize personal auth instance
let personalAuth = null;

/**
 * Fetch calendar events with enhanced error handling
 * Copied from archive script
 */
async function fetchCalendarEvents(
  calendarId,
  startDate,
  endDate,
  includeAllDay = false
) {
  try {
    if (!personalAuth) {
      if (!validateAuthConfig("personal")) {
        console.error(
          "❌ Personal calendar authentication not configured properly"
        );
        return [];
      }
      personalAuth = createPersonalAuth();
    }

    const allEvents = await fetchCalendarEventsWithAuth(
      personalAuth,
      calendarId,
      startDate,
      endDate
    );

    // Filter to only include events that START within the week range
    // AND exclude all-day events (unless includeAllDay is true)
    const filteredEvents = allEvents.filter((event) => {
      // Check if it's an all-day event
      if (!includeAllDay && event.start?.date && !event.start?.dateTime) {
        return false; // Skip all-day events unless we want them
      }

      let eventStartDate;
      if (event.start?.date) {
        eventStartDate = event.start.date;
      } else if (event.start?.dateTime) {
        eventStartDate = event.start.dateTime.split("T")[0];
      } else {
        return false; // No valid start time
      }

      return eventStartDate >= startDate && eventStartDate <= endDate;
    });

    return filteredEvents;
  } catch (error) {
    console.error(`❌ Error fetching calendar events:`, error.message);
    return [];
  }
}

/**
 * Format events for a column (simple list with hours)
 * Copied exactly from archive script
 */
function formatEventsColumn(
  events,
  columnName,
  eventType = "events",
  includeDayOfWeek = false
) {
  if (!events || events.length === 0) {
    return `${columnName} (0 ${eventType}, 0 hours, 0 days):\nNo ${columnName.toLowerCase()} this week`;
  }

  // Calculate total hours and days
  let totalMinutes = 0;
  const formattedEvents = [];
  const uniqueDates = new Set();

  events.forEach((event) => {
    // Count unique days
    const eventDate = getEventStartDate(event);
    if (eventDate) uniqueDates.add(eventDate);

    const duration = extractEventDuration(event);
    const minutes = duration?.minutes || 0;
    totalMinutes += minutes;

    const hours = (minutes / 60).toFixed(1);
    const summary = (event.summary || "Untitled").trim();
    const dayLabel = includeDayOfWeek ? getEventDayOfWeek(event) : null;
    const daySuffix = dayLabel ? ` on ${dayLabel}` : "";
    formattedEvents.push(`• ${summary}${daySuffix} (${hours}h)`);
  });

  const totalHours = (totalMinutes / 60).toFixed(1);

  const dayCount = uniqueDates.size;

  let output = `${columnName} (${events.length} event`;
  if (events.length !== 1) output += "s";
  output += `, ${totalHours} hour`;
  if (totalHours !== "1.0") output += "s";
  output += `, ${dayCount} day`;
  if (dayCount !== 1) output += "s";
  output += "):\n";

  output += formattedEvents.join("\n");

  return output;
}

/**
 * Extract event start date for day counting
 */
function getEventStartDate(event) {
  if (event.start?.date) {
    return event.start.date; // All-day event (YYYY-MM-DD)
  } else if (event.start?.dateTime) {
    return event.start.dateTime.split("T")[0]; // Timed event (extract date part)
  }
  return null;
}

/**
 * Get day of week for an event (Sun, Mon, etc.)
 */
function getEventDayOfWeek(event) {
  try {
    let dateStr = null;
    if (event.start?.dateTime) {
      dateStr = event.start.dateTime;
    } else if (event.start?.date) {
      dateStr = event.start.date;
    }
    if (!dateStr) return null;

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return days[date.getDay()];
  } catch (e) {
    return null;
  }
}

/**
 * Pull Art Calendar events for a given week
 * @param {number} weekNumber - Week number (1-52)
 * @returns {Object} - Object with "Art Events" key containing formatted string
 */
async function pullPersonalArtCalendar(weekNumber) {
  try {
    console.log(`📥 Fetching Art Calendar events for Week ${weekNumber}...`);

    const { startDate, endDate } = await getWeekDateRange(weekNumber);

    if (!process.env.ART_CALENDAR_ID) {
      console.log("   ⚠️  ART_CALENDAR_ID not configured");
      return {
        "Art Events":
          "Art Events (0 events, 0 hours):\nNo art events this week",
      };
    }

    const codingEvents = await fetchCalendarEvents(
      process.env.ART_CALENDAR_ID,
      startDate,
      endDate
    );

    console.log(`   Art: ${codingEvents.length} events`);

    const formattedCoding = formatEventsColumn(
      codingEvents,
      "Art Events",
      "events",
      true
    );

    return {
      "Art Events": formattedCoding,
    };
  } catch (error) {
    console.error(
      `❌ Error pulling art calendar for Week ${weekNumber}:`,
      error.message
    );
    return {
      "Art Events":
        "Art Events (0 events, 0 hours):\nError fetching art events this week",
    };
  }
}

module.exports = {
  pullPersonalArtCalendar,
};
