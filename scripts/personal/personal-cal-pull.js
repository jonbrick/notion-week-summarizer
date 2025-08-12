const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("../../src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("../../src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("../../src/config/task-config");
const { extractEventDuration } = require("../../src/utils/time-utils");
const {
  processPersonalProjectEvents,
} = require("../../src/utils/personal-pr-processor");
const { categorizeEventByColor } = require("../../src/utils/color-mappings");
const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("../../src/utils/auth-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("🗓️ Personal Calendar Summary Generator (Simplified)");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Initialize personal auth instance
let personalAuth = null;

// Fetch calendar events with enhanced error handling and start-date filtering
async function fetchCalendarEvents(calendarId, startDate, endDate) {
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
    const filteredEvents = allEvents.filter((event) => {
      let eventStartDate;
      if (event.start.date) {
        eventStartDate = event.start.date;
      } else if (event.start.dateTime) {
        eventStartDate = event.start.dateTime.split("T")[0];
      } else {
        return false;
      }
      return eventStartDate >= startDate && eventStartDate <= endDate;
    });

    return filteredEvents;
  } catch (error) {
    console.error(`❌ Error fetching calendar events:`, error.message);
    return [];
  }
}

// Get week date range from Notion
async function getWeekDateRange(weekNumber) {
  const recapPages = await notion.databases.query({
    database_id: RECAP_DATABASE_ID,
  });

  const paddedWeek = weekNumber.toString().padStart(2, "0");

  for (const page of recapPages.results) {
    const titleProperty = page.properties["Week Recap"];
    if (titleProperty && titleProperty.title) {
      const title = titleProperty.title.map((t) => t.plain_text).join("");

      if (
        title === `Week ${weekNumber} Recap` ||
        title === `Week ${paddedWeek} Recap`
      ) {
        const weekRelation = page.properties["⌛ Weeks"].relation;
        if (weekRelation && weekRelation.length > 0) {
          const weekPage = await notion.pages.retrieve({
            page_id: weekRelation[0].id,
          });
          const dateRange = weekPage.properties["Date Range (SET)"].date;

          if (dateRange) {
            return {
              startDate: dateRange.start,
              endDate: dateRange.end,
              pageId: page.id,
            };
          }
        }
      }
    }
  }

  throw new Error(`Could not find date range for Week ${weekNumber}`);
}

// Calculate total hours and events from a calendar
function calculateCalendarStats(events) {
  const validEvents = events.filter(
    (event) => !event.isAllDay && event.duration && event.duration.minutes >= 15
  );

  const totalMinutes = validEvents.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );

  return {
    hours: totalMinutes / 60,
    events: validEvents.length,
  };
}

// Format interpersonal events (like meetings in work cal)
function formatInterpersonalEvents(events) {
  const validEvents = events.filter(
    (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
  );

  if (validEvents.length === 0) {
    return "0 events, 0 hours\n";
  }

  // Sort all events chronologically first
  const sortedEvents = [...validEvents].sort((a, b) => {
    const dateA = new Date(a.start);
    const dateB = new Date(b.start);
    return dateA - dateB;
  });

  // Keyword arrays for Family and Calls for categorization
  const callKeywords = ["call", "facetime", "ft"];
  const familyKeywords = ["mom", "dad", "vicki", "evan"];
  const relationshipKeywords = ["jen", "jen rothman"];

  // Separate events by category while maintaining chronological order
  const calls = [];
  const family = [];
  const relationship = [];
  const otherEvents = [];

  sortedEvents.forEach((event) => {
    const summary = event.summary || "";
    const summaryLower = summary.toLowerCase();

    // Check if it's a call first (calls trump family and relationship)
    const isCall = callKeywords.some((keyword) =>
      summaryLower.includes(keyword.toLowerCase())
    );

    // Check if it's family (family trumps relationship and general interpersonal)
    const isFamily = familyKeywords.some((keyword) =>
      summaryLower.includes(keyword.toLowerCase())
    );

    // Check if it's relationship (relationship trumps general interpersonal)
    const isRelationship = relationshipKeywords.some((keyword) =>
      summaryLower.includes(keyword.toLowerCase())
    );

    if (isCall) {
      calls.push(event);
    } else if (isFamily) {
      family.push(event);
    } else if (isRelationship) {
      relationship.push(event);
    } else {
      otherEvents.push(event);
    }
  });

  // Calculate stats for each category
  const callsMinutes = calls.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );
  const familyMinutes = family.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );
  const relationshipMinutes = relationship.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );
  const otherMinutes = otherEvents.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );

  const callsHours = (callsMinutes / 60).toFixed(1);
  const familyHours = (familyMinutes / 60).toFixed(1);
  const relationshipHours = (relationshipMinutes / 60).toFixed(1);
  const otherHours = (otherMinutes / 60).toFixed(1);

  let output = `${otherEvents.length} events, ${otherHours} hours\n`;

  // Format other interpersonal events (non-calls, non-family, non-relationship) - already sorted
  if (otherEvents.length > 0) {
    // Format each event in chronological order
    otherEvents.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      output += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  // Add relationship section if there are any relationship events - already sorted
  if (relationship.length > 0) {
    output += `\n===== RELATIONSHIP =====\n${relationship.length} event${
      relationship.length > 1 ? "s" : ""
    }, ${relationshipHours} hours\n`;

    // Format each relationship event in chronological order
    relationship.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      output += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  // Add family section if there are any family events - already sorted
  if (family.length > 0) {
    output += `\n===== FAMILY =====\n${family.length} event${
      family.length > 1 ? "s" : ""
    }, ${familyHours} hours\n`;

    // Format each family event in chronological order
    family.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      output += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  // Add calls section if there are any calls - already sorted
  if (calls.length > 0) {
    output += `\n===== CALLS =====\n${calls.length} event${
      calls.length > 1 ? "s" : ""
    }, ${callsHours} hours\n`;

    // Format each call in chronological order
    calls.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      output += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  return output;
}

// Format PRs section
async function formatPersonalPRs(prEvents) {
  if (!prEvents || prEvents.length === 0) {
    return "0 apps, 0 commits\n";
  }

  const prSummary = await processPersonalProjectEvents(prEvents);

  // Extract counts from the header
  const headerMatch = prSummary.match(
    /PERSONAL PRs \((\d+) apps?, (\d+) commits?\)/
  );
  if (!headerMatch) {
    return "0 apps, 0 commits\n";
  }

  const appCount = parseInt(headerMatch[1]);
  const commitCount = parseInt(headerMatch[2]);

  // Extract the content after the divider
  const contentParts = prSummary.split("------\n");
  if (contentParts.length < 2) {
    return `${appCount} apps, ${commitCount} commits\n`;
  }

  // Format output like work PRs
  let output = `${appCount} apps, ${commitCount} commits\n`;

  // Parse projects and their commits
  const projectContent = contentParts[1].trim();
  const projectLines = projectContent.split("\n\n");

  projectLines.forEach((projectSection) => {
    const lines = projectSection.split("\n");
    if (lines.length > 0) {
      // First line is the project header
      const projectHeader = lines[0];
      // Extract just the project name and commit count
      const match = projectHeader.match(/(.+?)\s*\((\d+) commits?\)/);
      if (match) {
        output += `• ${match[1]} [${match[2]} commits]\n`;
      }
    }
  });

  return output;
}

// Generate simplified Personal Cal Summary
async function generatePersonalCalSummary(
  categorizedEvents,
  dedicatedCalendarEvents,
  prEvents,
  startDate,
  endDate
) {
  // Calculate stats for each calendar type
  const stats = {
    personal: calculateCalendarStats(categorizedEvents.personal || []),
    interpersonal: calculateCalendarStats(
      categorizedEvents.interpersonal || []
    ),
    home: calculateCalendarStats(categorizedEvents.home || []),
    mentalHealth: calculateCalendarStats(categorizedEvents.mentalHealth || []),
    physicalHealth: calculateCalendarStats(
      categorizedEvents.physicalHealth || []
    ),
    reading: calculateCalendarStats(dedicatedCalendarEvents.reading || []),
    videoGame: calculateCalendarStats(dedicatedCalendarEvents.videoGame || []),
    workout: calculateCalendarStats(dedicatedCalendarEvents.workout || []),
  };

  // Calculate total
  const totalHours = Object.values(stats).reduce(
    (sum, stat) => sum + stat.hours,
    0
  );
  const totalEvents = Object.values(stats).reduce(
    (sum, stat) => sum + stat.events,
    0
  );

  let summary = "";

  // SUMMARY section
  summary += "===== SUMMARY =====\n";
  summary += `Total: ${totalHours.toFixed(1)} hours (${totalEvents} events)\n`;

  // Calendar categories with specific emoji rules
  const categories = [
    { key: "personal", name: "Personal Cal", useRedX: false },
    { key: "reading", name: "Reading Cal", useRedX: true },
    {
      key: "videoGame",
      name: "Video Game Cal",
      useRedX: true,
      invertLogic: true,
    },
    { key: "interpersonal", name: "Interpersonal Cal", useRedX: false },
    { key: "home", name: "Home Cal", useRedX: false },
    { key: "physicalHealth", name: "Physical Health Cal", useRedX: false },
    { key: "workout", name: "Workout Cal", useRedX: true },
    { key: "mentalHealth", name: "Mental Health Cal", useRedX: false },
  ];

  categories.forEach(({ key, name, useRedX, invertLogic }) => {
    const hours = stats[key].hours.toFixed(1);
    const percent =
      totalHours > 0 ? Math.round((stats[key].hours / totalHours) * 100) : 0;

    let emoji;
    if (invertLogic) {
      // Inverted logic for Video Game Cal: ✅ when 0 hours, ❌ when > 0 hours
      if (stats[key].hours > 0) {
        emoji = "❌";
      } else {
        emoji = "✅";
      }
    } else if (name === "Personal Cal" || name === "Home Cal") {
      emoji = "☑️"; // Always silver for Personal Cal and Home Cal
    } else if (stats[key].hours > 0) {
      emoji = "✅";
    } else if (useRedX) {
      emoji = "❌"; // Red X for Reading and Workout when 0
    } else {
      emoji = "☑️"; // Gray check for others when 0
    }

    summary += `${emoji} ${name}: ${hours} hours (${percent}%)\n`;
  });

  // INTERPERSONAL section (like MEETINGS in work cal)
  summary += "\n===== INTERPERSONAL =====\n";
  summary += formatInterpersonalEvents(categorizedEvents.interpersonal || []);

  // Always show WORKOUTS section
  if (
    dedicatedCalendarEvents.workout &&
    dedicatedCalendarEvents.workout.length > 0
  ) {
    summary += "\n===== WORKOUTS =====\n";
    const workoutStats = calculateCalendarStats(
      dedicatedCalendarEvents.workout
    );
    summary += `${dedicatedCalendarEvents.workout.length} event${
      dedicatedCalendarEvents.workout.length > 1 ? "s" : ""
    }, ${workoutStats.hours.toFixed(1)} hours\n`;

    dedicatedCalendarEvents.workout.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      summary += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  // Always show READING section
  if (
    dedicatedCalendarEvents.reading &&
    dedicatedCalendarEvents.reading.length > 0
  ) {
    summary += "\n===== READING =====\n";
    const readingStats = calculateCalendarStats(
      dedicatedCalendarEvents.reading
    );
    summary += `${dedicatedCalendarEvents.reading.length} event${
      dedicatedCalendarEvents.reading.length > 1 ? "s" : ""
    }, ${readingStats.hours.toFixed(1)} hours\n`;

    dedicatedCalendarEvents.reading.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      summary += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  // Always show MENTAL HEALTH section
  if (
    categorizedEvents.mentalHealth &&
    categorizedEvents.mentalHealth.length > 0
  ) {
    summary += "\n===== MENTAL HEALTH =====\n";
    const mentalHealthStats = calculateCalendarStats(
      categorizedEvents.mentalHealth
    );
    summary += `${categorizedEvents.mentalHealth.length} event${
      categorizedEvents.mentalHealth.length > 1 ? "s" : ""
    }, ${mentalHealthStats.hours.toFixed(1)} hours\n`;

    categorizedEvents.mentalHealth.forEach((event) => {
      const eventHours = ((event.duration.minutes || 0) / 60).toFixed(1);
      summary += `• ${event.summary} (${eventHours}h)\n`;
    });
  }

  // PRs section - only show if there are PRs
  const prSummary = await formatPersonalPRs(prEvents);
  if (prSummary && prSummary.trim() !== "0 apps, 0 commits\n") {
    summary += "\n===== PRs =====\n";
    summary += prSummary;
  }

  return summary.trim();
}

// Process single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

    // Get week date range and page ID
    const { startDate, endDate, pageId } = await getWeekDateRange(weekNumber);
    const paddedWeek = weekNumber.toString().padStart(2, "0");

    console.log(`✅ Found Week ${paddedWeek} Recap!`);
    console.log(`📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}`);

    // Process main personal calendar events (color-categorized)
    const rawEvents = await fetchCalendarEvents(
      process.env.PERSONAL_CALENDAR_ID,
      startDate,
      endDate
    );

    console.log(`📥 Processing ${rawEvents.length} main calendar events...`);

    // Categorize events by color
    const categorizedEvents = rawEvents.map((event) =>
      categorizeEventByColor(event, "personal")
    );

    // Group by category
    const categories = {
      personal: [],
      interpersonal: [],
      home: [],
      mentalHealth: [],
      physicalHealth: [],
    };

    categorizedEvents.forEach((event) => {
      if (categories[event.category]) {
        categories[event.category].push(event);
      }
    });

    // Fetch dedicated calendar events
    console.log("🎮 Processing dedicated calendars...");
    const dedicatedCalendarEvents = {
      videoGame: [],
      reading: [],
      workout: [],
    };

    // Fetch Video Games calendar
    if (process.env.VIDEO_GAMES_CALENDAR_ID) {
      const videoGameEvents = await fetchCalendarEvents(
        process.env.VIDEO_GAMES_CALENDAR_ID,
        startDate,
        endDate
      );
      dedicatedCalendarEvents.videoGame = videoGameEvents.map((event) => ({
        summary: event.summary || "Video Game session",
        duration: extractEventDuration(event),
        isAllDay: event.start?.date && !event.start?.dateTime,
        start: event.start?.dateTime || event.start?.date,
      }));
    }

    // Fetch Reading calendar
    if (process.env.READ_CALENDAR_ID) {
      const readingEvents = await fetchCalendarEvents(
        process.env.READ_CALENDAR_ID,
        startDate,
        endDate
      );
      dedicatedCalendarEvents.reading = readingEvents.map((event) => ({
        summary: event.summary || "Reading session",
        duration: extractEventDuration(event),
        isAllDay: event.start?.date && !event.start?.dateTime,
        start: event.start?.dateTime || event.start?.date,
      }));
    }

    // Fetch Workout calendar
    if (process.env.WORKOUT_CALENDAR_ID) {
      const workoutEvents = await fetchCalendarEvents(
        process.env.WORKOUT_CALENDAR_ID,
        startDate,
        endDate
      );
      dedicatedCalendarEvents.workout = workoutEvents.map((event) => ({
        summary: event.summary || "Workout",
        duration: extractEventDuration(event),
        isAllDay: event.start?.date && !event.start?.dateTime,
        start: event.start?.dateTime || event.start?.date,
      }));
    }

    // Fetch Personal PRs
    let prEvents = [];
    if (process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID) {
      console.log("📥 Fetching Personal PR events...");
      prEvents = await fetchCalendarEvents(
        process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID,
        startDate,
        endDate
      );
    }

    // Generate simplified Personal Cal Summary
    console.log("📊 Generating Personal Cal Summary...");
    const personalCalSummary = await generatePersonalCalSummary(
      categories,
      dedicatedCalendarEvents,
      prEvents,
      startDate,
      endDate
    );

    // Update Notion
    console.log("📝 Updating Notion...");
    await updateAllSummaries(notion, pageId, {
      "Personal Cal Summary": personalCalSummary,
    });

    console.log(
      `✅ Successfully updated Week ${paddedWeek} Personal Cal Summary!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error);
  }
}

// Process all selected weeks
async function processAllWeeks() {
  console.log(
    `🚀 Starting personal calendar summary for weeks: ${TARGET_WEEKS.join(
      ", "
    )}`
  );
  console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...\n`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log(
    `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
  );
}

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n🗓️ Personal Calendar Summary Generator");

  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );
  let targetWeeks = [TARGET_WEEKS[0]];
  if (weekInput.trim()) {
    targetWeeks = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(
    `\n📊 Generating personal calendar summary for Week${
      targetWeeks.length > 1 ? "s" : ""
    }: ${targetWeeks.join(", ")}`
  );
  const confirm = await askQuestion("Continue? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  return targetWeeks;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Check if running in interactive mode
  const result = await checkInteractiveMode(args, [], DEFAULT_TARGET_WEEKS, []);

  if (result.isInteractive) {
    TARGET_WEEKS = await runInteractiveMode();
  } else {
    TARGET_WEEKS = result.targetWeeks;
  }

  await processAllWeeks();
}

// Run the script
main()
  .then(() => {
    rl.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    rl.close();
    process.exit(1);
  });
