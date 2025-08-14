const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("../../src/utils/auth-utils");
const { getWeekDateRange } = require("./pull-personal-tasks");
const {
  processPersonalProjectEvents,
} = require("../../src/utils/personal-pr-processor");
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
 * Format personal PR events (with commit details like work PRs)
 * Copied exactly from archive script
 */
async function formatPREvents(prEvents) {
  if (!prEvents || prEvents.length === 0) {
    return "Personal PR Events (0 apps, 0 commits):\nNo personal PR events this week";
  }

  // Use the existing personal PR processor to get the full formatted output
  const prSummary = await processPersonalProjectEvents(prEvents);

  // Extract counts from the header
  const headerMatch = prSummary.match(
    /PERSONAL PRs \((\d+) apps?, (\d+) commits?\)/
  );
  if (!headerMatch) {
    return "Personal PR Events (0 apps, 0 commits):\nNo personal PR events this week";
  }

  const appCount = parseInt(headerMatch[1]);
  const commitCount = parseInt(headerMatch[2]);

  // Extract the content after the divider
  const contentParts = prSummary.split("------\n");
  if (contentParts.length < 2) {
    return `Personal PR Events (${appCount} apps, ${commitCount} commits):\nNo personal PR events this week`;
  }

  // Format output with full commit details
  let output = `Personal PR Events (${appCount} app${
    appCount !== 1 ? "s" : ""
  }, ${commitCount} commit${commitCount !== 1 ? "s" : ""}):\n`;

  // Parse the content and format it properly
  const projectContent = contentParts[1].trim();
  const projectSections = projectContent.split("\n\n");

  projectSections.forEach((projectSection, index) => {
    if (index > 0) {
      output += "---\n"; // Add separator between projects
    }

    const lines = projectSection.split("\n");
    if (lines.length > 0) {
      // First line is the project header
      const projectHeader = lines[0];
      const match = projectHeader.match(/(.+?)\s*\((\d+) commits?\):/);
      if (match) {
        // Project name with commit count
        output += `${match[1]} [${match[2]} commits]\n`;

        // Add commit messages (lines after the header)
        const commitLines = lines.slice(1);
        if (commitLines.length > 0) {
          // Join commit messages, but limit to first 5-6 commits
          const commits = commitLines
            .filter((line) => line.startsWith("• "))
            .map((line) => line.replace("• ", "").trim())
            .slice(0, 5); // Limit to first 5 commits

          if (commits.length > 0) {
            output += commits.join(", ");

            // Add truncation notice if there are more commits
            if (
              commitLines.filter((line) => line.startsWith("• ")).length > 5
            ) {
              output += ", ... (additional commits truncated)";
            }
            output += "\n";
          }
        }
      }
    }
  });

  return output.trim();
}

/**
 * Pull Personal PR Events for a given week
 * @param {number} weekNumber - Week number (1-52)
 * @returns {Object} - Object with "Personal PR Events" key containing formatted string
 */
async function pullPersonalPREvents(weekNumber) {
  try {
    console.log(`📥 Fetching Personal PR events for Week ${weekNumber}...`);

    const { startDate, endDate } = await getWeekDateRange(weekNumber);

    if (!process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID) {
      console.log("   ⚠️  PERSONAL_GITHUB_DATA_CALENDAR_ID not configured");
      return {
        "Personal PR Events":
          "Personal PR Events (0 apps, 0 commits):\nNo personal PR events this week",
      };
    }

    const prEvents = await fetchCalendarEvents(
      process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID,
      startDate,
      endDate,
      true // Include all-day events for PRs
    );

    console.log(`   PRs: ${prEvents.length} events`);

    // Note: formatPREvents is async, so we need to await it
    const formattedPREvents = await formatPREvents(prEvents);

    return {
      "Personal PR Events": formattedPREvents,
    };
  } catch (error) {
    console.error(
      `❌ Error pulling personal PR events for Week ${weekNumber}:`,
      error.message
    );
    return {
      "Personal PR Events":
        "Personal PR Events (0 apps, 0 commits):\nError fetching PR events this week",
    };
  }
}

module.exports = {
  pullPersonalPREvents,
};
