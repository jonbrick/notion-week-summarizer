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
function formatEventsColumn(events, columnName, eventType = "events") {
  if (!events || events.length === 0) {
    return `${columnName} (0 ${eventType}, 0 hours):\nNo ${columnName.toLowerCase()} this week`;
  }

  // Calculate total hours
  let totalMinutes = 0;
  const formattedEvents = [];

  events.forEach((event) => {
    const duration = extractEventDuration(event);
    const minutes = duration?.minutes || 0;
    totalMinutes += minutes;

    const hours = (minutes / 60).toFixed(1);
    const summary = event.summary || "Untitled";

    formattedEvents.push(`• ${summary} (${hours}h)`);
  });

  const totalHours = (totalMinutes / 60).toFixed(1);

  let output = `${columnName} (${events.length} event`;
  if (events.length !== 1) output += "s";
  output += `, ${totalHours} hour`;
  if (totalHours !== "1.0") output += "s";
  output += "):\n";

  output += formattedEvents.join("\n");

  return output;
}

/**
 * Pull Personal Coding Calendar events for a given week
 * @param {number} weekNumber - Week number (1-52)
 * @returns {Object} - Object with "Personal Coding Events" key containing formatted string
 */
async function pullPersonalCodingCalendar(weekNumber) {
  try {
    console.log(
      `📥 Fetching Personal Coding Calendar events for Week ${weekNumber}...`
    );

    const { startDate, endDate } = await getWeekDateRange(weekNumber);

    if (!process.env.CODING_CALENDAR_ID) {
      console.log("   ⚠️  CODING_CALENDAR_ID not configured");
      return {
        "Personal Coding Events":
          "Personal Coding Events (0 events, 0 hours):\nNo personal coding events this week",
      };
    }

    const codingEvents = await fetchCalendarEvents(
      process.env.CODING_CALENDAR_ID,
      startDate,
      endDate
    );

    console.log(`   Personal Coding: ${codingEvents.length} events`);

    const formattedCoding = formatEventsColumn(
      codingEvents,
      "Personal Coding Events"
    );

    return {
      "Personal Coding Events": formattedCoding,
    };
  } catch (error) {
    console.error(
      `❌ Error pulling personal coding calendar for Week ${weekNumber}:`,
      error.message
    );
    return {
      "Personal Coding Events":
        "Personal Coding Events (0 events, 0 hours):\nError fetching personal coding events this week",
    };
  }
}

module.exports = {
  pullPersonalCodingCalendar,
};
