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

console.log("🗓️ Personal Calendar Summary Generator");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Initialize personal auth instance
let personalAuth = null;

// Fetch calendar events with enhanced error handling and start-date filtering
async function fetchCalendarEvents(calendarId, startDate, endDate) {
  try {
    // Initialize auth if not already done
    if (!personalAuth) {
      // Validate configuration first
      if (!validateAuthConfig("personal")) {
        console.error(
          "❌ Personal calendar authentication not configured properly"
        );
        return [];
      }

      personalAuth = createPersonalAuth();
    }

    // Use the existing fetchCalendarEventsWithAuth function which handles timezone properly
    const allEvents = await fetchCalendarEventsWithAuth(
      personalAuth,
      calendarId,
      startDate,
      endDate
    );

    // Filter to only include events that START within the week range
    const filteredEvents = allEvents.filter((event) => {
      let eventStartDate;

      // Get the start date from the event
      if (event.start.date) {
        // All-day event
        eventStartDate = event.start.date;
      } else if (event.start.dateTime) {
        // Timed event - extract just the date part
        eventStartDate = event.start.dateTime.split("T")[0];
      } else {
        return false; // No valid start date
      }

      // Check if event starts within our week range (inclusive)
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

// Format events with standardized header format
function formatEventsForCategory(events, categoryName) {
  // Filter out all-day events and very short events
  const validEvents = events.filter(
    (event) => !event.isAllDay && event.duration && event.duration.minutes >= 15
  );

  const totalMinutes = validEvents.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );
  const totalHours = (totalMinutes / 60).toFixed(1);

  let output = `${categoryName.toUpperCase()} (${
    validEvents.length
  } events, ${totalHours} hours):\n`;

  if (validEvents.length === 0) {
    output += `No ${categoryName.toLowerCase()} events this week.`;
    return output;
  }

  // Group events by title and track first occurrence for chronological sorting
  const eventGroups = {};
  validEvents.forEach((event, index) => {
    const cleanTitle = event.summary.trim();
    if (!eventGroups[cleanTitle]) {
      eventGroups[cleanTitle] = {
        title: cleanTitle,
        totalMinutes: 0,
        count: 0,
        firstOccurrenceIndex: index, // Track order for chronological sorting
      };
    }
    eventGroups[cleanTitle].totalMinutes += event.duration.minutes || 0;
    eventGroups[cleanTitle].count += 1;
  });

  // Sort by first occurrence (chronological order: earliest -> latest)
  const groupedEvents = Object.values(eventGroups).sort(
    (a, b) => a.firstOccurrenceIndex - b.firstOccurrenceIndex
  );

  groupedEvents.forEach((group) => {
    const { formatDuration } = require("../../src/utils/time-utils");
    const duration = formatDuration(group.totalMinutes);
    const countText = group.count > 1 ? ` (${group.count}x)` : "";
    output += `• ${group.title}${countText} (${duration})\n`;
  });

  return output.trim();
}

// Process dedicated calendar and format with standard headers
async function processCalendar(
  calendarIdEnvVar,
  categoryName,
  startDate,
  endDate
) {
  const calendarId = process.env[calendarIdEnvVar];

  if (!calendarId) {
    return `${categoryName.toUpperCase()} (0 events, 0 hours):\nNo ${categoryName.toLowerCase()} events this week.`;
  }

  console.log(`   📥 Fetching ${categoryName.toLowerCase()} events...`);
  const rawEvents = await fetchCalendarEvents(calendarId, startDate, endDate);

  // Convert to standard event format
  const processedEvents = rawEvents.map((event) => ({
    summary: event.summary || `${categoryName} session`,
    duration: extractEventDuration(event),
    isAllDay: event.start?.date && !event.start?.dateTime,
  }));

  return formatEventsForCategory(processedEvents, categoryName);
}

// Generate simplified evaluation
function generatePersonalCalEvaluation(categoryStats, prSummary) {
  const evaluations = [];

  // Interpersonal events
  if (categoryStats.interpersonal.events > 0) {
    evaluations.push(
      `✅ INTERPERSONAL EVENTS: ${categoryStats.interpersonal.events} events`
    );
  } else {
    evaluations.push(`❌ NO INTERPERSONAL EVENTS: 0 events`);
  }

  // Workouts
  if (categoryStats.workout.events > 0) {
    evaluations.push(
      `✅ WORKOUTS: ${
        categoryStats.workout.events
      } sessions, ${categoryStats.workout.hours.toFixed(1)} hours`
    );
  } else {
    evaluations.push(`❌ NO WORKOUTS: 0 sessions`);
  }

  // Video games (none is good, played is bad)
  if (categoryStats.videoGame.events > 0) {
    evaluations.push(
      `❌ VIDEO GAMES: ${
        categoryStats.videoGame.events
      } sessions, ${categoryStats.videoGame.hours.toFixed(1)} hours`
    );
  } else {
    evaluations.push(`✅ NO VIDEO GAMES: 0 hours`);
  }

  // Reading (read is good, none is bad)
  if (categoryStats.reading.events > 0) {
    evaluations.push(
      `✅ READING: ${
        categoryStats.reading.events
      } sessions, ${categoryStats.reading.hours.toFixed(1)} hours`
    );
  } else {
    evaluations.push(`❌ NO READING: 0 sessions`);
  }

  // Personal PRs
  if (prSummary && !prSummary.includes("No personal project commits")) {
    const prMatch = prSummary.match(
      /Personal Projects \((\d+) apps?, (\d+) commits?\)/
    );
    if (prMatch) {
      const appCount = parseInt(prMatch[1]);
      const commitCount = parseInt(prMatch[2]);
      evaluations.push(
        `✅ PERSONAL PROJECTS: ${appCount} apps, ${commitCount} commits`
      );
    }
  }

  return evaluations;
}

// Extract stats from formatted summary
function extractStatsFromSummary(summary, categoryKey) {
  const match = summary.match(/\((\d+) events, ([\d.]+) hours\)/);
  if (match) {
    return {
      events: parseInt(match[1]),
      hours: parseFloat(match[2]),
      minutes: parseFloat(match[2]) * 60,
    };
  }
  return { events: 0, hours: 0, minutes: 0 };
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

    // Initialize notionUpdates object
    const notionUpdates = {};

    // Process main personal calendar events (color-categorized)
    const rawEvents = await fetchCalendarEvents(
      process.env.PERSONAL_CALENDAR_ID,
      startDate,
      endDate
    );

    console.log(`📥 Processing ${rawEvents.length} main calendar events...\n`);

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

    // Process all color-categorized calendars
    console.log("🔄 Processing color-categorized events...");
    notionUpdates["Personal Cal"] = formatEventsForCategory(
      categories.personal,
      "Personal"
    );
    notionUpdates["Interpersonal Cal"] = formatEventsForCategory(
      categories.interpersonal,
      "Interpersonal"
    );
    notionUpdates["Home Cal"] = formatEventsForCategory(
      categories.home,
      "Home"
    );
    notionUpdates["Mental Health Cal"] = formatEventsForCategory(
      categories.mentalHealth,
      "Mental Health"
    );
    notionUpdates["Physical Health Cal"] = formatEventsForCategory(
      categories.physicalHealth,
      "Physical Health"
    );

    // Process dedicated calendars
    console.log("\n🎮 Processing dedicated calendars...");
    notionUpdates["Video Game Cal"] = await processCalendar(
      "VIDEO_GAMES_CALENDAR_ID",
      "Video Game",
      startDate,
      endDate
    );
    notionUpdates["Reading Cal"] = await processCalendar(
      "READ_CALENDAR_ID",
      "Reading",
      startDate,
      endDate
    );
    notionUpdates["Workout Cal"] = await processCalendar(
      "WORKOUT_CALENDAR_ID",
      "Workout",
      startDate,
      endDate
    );

    // Calculate stats for evaluation and main summary
    const categoryStats = {};
    let totalMinutes = 0;
    let totalEvents = 0;

    const categories2 = [
      "personal",
      "interpersonal",
      "home",
      "mentalHealth",
      "physicalHealth",
    ];
    const dedicatedCategories = ["videoGame", "reading", "workout"];

    // Stats from color-categorized events
    categories2.forEach((categoryKey) => {
      const events = categories[categoryKey];
      const validEvents = events.filter(
        (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
      );
      const categoryMinutes = validEvents.reduce(
        (sum, e) => sum + (e.duration.minutes || 0),
        0
      );

      categoryStats[categoryKey] = {
        events: validEvents.length,
        hours: categoryMinutes / 60,
        minutes: categoryMinutes,
      };

      totalMinutes += categoryMinutes;
      totalEvents += validEvents.length;
    });

    // Stats from dedicated calendars
    categoryStats.videoGame = extractStatsFromSummary(
      notionUpdates["Video Game Cal"],
      "videoGame"
    );
    categoryStats.reading = extractStatsFromSummary(
      notionUpdates["Reading Cal"],
      "reading"
    );
    categoryStats.workout = extractStatsFromSummary(
      notionUpdates["Workout Cal"],
      "workout"
    );

    totalMinutes +=
      categoryStats.videoGame.minutes +
      categoryStats.reading.minutes +
      categoryStats.workout.minutes;
    totalEvents +=
      categoryStats.videoGame.events +
      categoryStats.reading.events +
      categoryStats.workout.events;

    // Fetch Personal PRs
    let prSummary = "No personal project commits this week.";
    if (process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID) {
      console.log("\n📥 Fetching Personal PR events...");
      const prEvents = await fetchCalendarEvents(
        process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID,
        startDate,
        endDate
      );

      if (prEvents.length > 0) {
        prSummary = await processPersonalProjectEvents(prEvents);

        // Check if summary exceeds Notion's 2000 character limit
        if (prSummary.length > 2000) {
          console.log(
            `⚠️  PR summary too long (${prSummary.length} chars), truncating...`
          );
          const maxLength = 1950;
          let truncateAt = prSummary.lastIndexOf("\n", maxLength);
          if (truncateAt === -1 || truncateAt < maxLength - 200) {
            truncateAt = maxLength;
          }
          prSummary =
            prSummary.substring(0, truncateAt) +
            "\n\n... (truncated due to length)";
        }
      }
    }

    notionUpdates["Personal PR Summary"] = prSummary;

    // Create main Personal Cal Summary
    const totalHours = totalMinutes / 60;
    let personalCalSummary = `PERSONAL CAL SUMMARY:\n`;
    personalCalSummary += `Total: ${totalHours.toFixed(
      1
    )} hours (${totalEvents} events)\n`;

    // Add breakdown by category
    const allCategoryStats = {
      Personal: categoryStats.personal,
      Interpersonal: categoryStats.interpersonal,
      Home: categoryStats.home,
      "Mental Health": categoryStats.mentalHealth,
      "Physical Health": categoryStats.physicalHealth,
      "Video Games": categoryStats.videoGame,
      Reading: categoryStats.reading,
      Workouts: categoryStats.workout,
    };

    Object.entries(allCategoryStats).forEach(([categoryName, stats]) => {
      const percent =
        totalHours > 0 ? Math.round((stats.hours / totalHours) * 100) : 0;
      personalCalSummary += `- ${categoryName}: ${stats.hours.toFixed(
        1
      )} hours (${percent}%)\n`;
    });

    // Generate evaluation and add to main summary
    const evaluations = generatePersonalCalEvaluation(categoryStats, prSummary);
    if (evaluations.length > 0) {
      personalCalSummary +=
        "\n===== EVALUATION =====\n" + evaluations.join("\n");
    }

    notionUpdates["Personal Cal Summary"] = personalCalSummary;

    // Log what we're updating
    Object.keys(notionUpdates).forEach((field) => {
      const summary = notionUpdates[field];
      const match = summary.match(/\((\d+) events, ([\d.]+) hours\)/);
      if (match) {
        console.log(`🔄 ${field}: ${match[1]} events, ${match[2]} hours`);
      } else {
        console.log(`🔄 ${field}: Updated`);
      }
    });

    // Update Notion
    console.log("\n📝 Updating Notion...");
    await updateAllSummaries(notion, pageId, notionUpdates);
    console.log(`✅ Successfully updated Week ${paddedWeek} recap!`);
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
  let targetWeeks = [TARGET_WEEKS[0]]; // default
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
  const result = await checkInteractiveMode(
    args,
    [], // No categories for this script
    DEFAULT_TARGET_WEEKS,
    [] // No active categories
  );

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
