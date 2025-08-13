const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("../src/utils/auth-utils");
const { extractEventDuration } = require("../src/utils/time-utils");
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
 * Categorize event by color
 * Copied exactly from archive script
 */
function categorizeEventByColor(event) {
  const colorId = event.colorId || "default";

  // Personal Calendar Color Mappings
  const colorMapping = {
    2: "personal", // Sage/Green
    3: "interpersonal", // Purple
    5: "home", // Yellow
    8: "physicalHealth", // Gray
    11: "mentalHealth", // Red
  };

  return colorMapping[colorId] || "personal"; // Default to personal
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
 * Pull Personal Calendar events for a given week
 * @param {number} weekNumber - Week number (1-52)
 * @returns {Object} - Object with categorized event columns
 */
async function pullPersonalCalendar(weekNumber) {
  try {
    console.log(
      `📥 Fetching Personal Calendar events for Week ${weekNumber}...`
    );

    const { startDate, endDate } = await getWeekDateRange(weekNumber);

    if (!process.env.PERSONAL_CALENDAR_ID) {
      console.log("   ⚠️  PERSONAL_CALENDAR_ID not configured");
      return {
        "Personal Events":
          "PERSONAL EVENTS (0 events, 0 hours):\nNo personal events this week",
        "Interpersonal Events":
          "INTERPERSONAL EVENTS (0 events, 0 hours):\nNo interpersonal events this week",
        "Home Events":
          "HOME EVENTS (0 events, 0 hours):\nNo home events this week",
        "Mental Health Events":
          "MENTAL HEALTH EVENTS (0 events, 0 hours):\nNo mental health events this week",
        "Physical Health Events":
          "PHYSICAL HEALTH EVENTS (0 events, 0 hours):\nNo physical health events this week",
      };
    }

    const personalCalEvents = await fetchCalendarEvents(
      process.env.PERSONAL_CALENDAR_ID,
      startDate,
      endDate
    );

    // Categorize by color
    const categorizedEvents = {
      personal: [],
      interpersonal: [],
      home: [],
      mentalHealth: [],
      physicalHealth: [],
    };

    personalCalEvents.forEach((event) => {
      const category = categorizeEventByColor(event);
      if (categorizedEvents[category]) {
        categorizedEvents[category].push(event);
      }
    });

    console.log(`   Personal: ${categorizedEvents.personal.length} events`);
    console.log(
      `   Interpersonal: ${categorizedEvents.interpersonal.length} events`
    );
    console.log(`   Home: ${categorizedEvents.home.length} events`);
    console.log(
      `   Mental Health: ${categorizedEvents.mentalHealth.length} events`
    );
    console.log(
      `   Physical Health: ${categorizedEvents.physicalHealth.length} events`
    );

    // Format each category
    return {
      "Personal Events": formatEventsColumn(
        categorizedEvents.personal,
        "Personal Events"
      ),
      "Interpersonal Events": formatEventsColumn(
        categorizedEvents.interpersonal,
        "Interpersonal Events"
      ),
      "Home Events": formatEventsColumn(categorizedEvents.home, "Home Events"),
      "Mental Health Events": formatEventsColumn(
        categorizedEvents.mentalHealth,
        "Mental Health Events"
      ),
      "Physical Health Events": formatEventsColumn(
        categorizedEvents.physicalHealth,
        "Physical Health Events"
      ),
    };
  } catch (error) {
    console.error(
      `❌ Error pulling personal calendar for Week ${weekNumber}:`,
      error.message
    );
    return {
      "Personal Events":
        "PERSONAL EVENTS (0 events, 0 hours):\nError fetching personal events this week",
      "Interpersonal Events":
        "INTERPERSONAL EVENTS (0 events, 0 hours):\nError fetching interpersonal events this week",
      "Home Events":
        "HOME EVENTS (0 events, 0 hours):\nError fetching home events this week",
      "Mental Health Events":
        "MENTAL HEALTH EVENTS (0 events, 0 hours):\nError fetching mental health events this week",
      "Physical Health Events":
        "PHYSICAL HEALTH EVENTS (0 events, 0 hours):\nError fetching physical health events this week",
    };
  }
}

module.exports = {
  pullPersonalCalendar,
};
