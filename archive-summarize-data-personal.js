const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("./src/utils/notion-utils");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default configuration
const DEFAULT_TARGET_WEEKS = [1];
let TARGET_WEEKS = DEFAULT_TARGET_WEEKS;
let SELECTED_DATA_SOURCES = "both"; // both, task-summary, cal-summary

console.log("📊 Personal Data Summarizer");

/**
 * Interactive mode for user input
 */
async function checkInteractiveMode() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Non-interactive mode - could add argument parsing here later
    return { isInteractive: false, targetWeeks: DEFAULT_TARGET_WEEKS };
  }

  return { isInteractive: true };
}

/**
 * Process a single week
 */
async function processWeek(weekNumber) {
  try {
    console.log(`\n📊 === PROCESSING WEEK ${weekNumber} ===`);

    // Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      console.log(`❌ Could not find Week ${weekNumber} Recap`);
      return;
    }

    const paddedWeek = weekNumber.toString().padStart(2, "0");
    console.log(`✅ Found Week ${paddedWeek} Recap!`);

    // Read existing data populated by @pull-data-personal
    const existingData = {
      personalTasks:
        targetWeekPage.properties["Personal Tasks"]?.rich_text?.[0]
          ?.plain_text || "",
      personalEvents:
        targetWeekPage.properties["Personal Events"]?.rich_text?.[0]
          ?.plain_text || "",
      interpersonalEvents:
        targetWeekPage.properties["Interpersonal Events"]?.rich_text?.[0]
          ?.plain_text || "",
      homeEvents:
        targetWeekPage.properties["Home Events"]?.rich_text?.[0]?.plain_text ||
        "",
      physicalHealthEvents:
        targetWeekPage.properties["Physical Health Events"]?.rich_text?.[0]
          ?.plain_text || "",
      mentalHealthEvents:
        targetWeekPage.properties["Mental Health Events"]?.rich_text?.[0]
          ?.plain_text || "",
      workoutEvents:
        targetWeekPage.properties["Workout Events"]?.rich_text?.[0]
          ?.plain_text || "",
      readingEvents:
        targetWeekPage.properties["Reading Events"]?.rich_text?.[0]
          ?.plain_text || "",
      videoGameEvents:
        targetWeekPage.properties["Video Game Events"]?.rich_text?.[0]
          ?.plain_text || "",
      personalPREvents:
        targetWeekPage.properties["Personal PR Events"]?.rich_text?.[0]
          ?.plain_text || "",
      habitsDetails:
        targetWeekPage.properties["Habits Details"]?.rich_text?.[0]
          ?.plain_text || "",
      tripDetails:
        targetWeekPage.properties["Trip Details"]?.rich_text?.[0]?.plain_text ||
        "",
      eventDetails:
        targetWeekPage.properties["Event Details"]?.rich_text?.[0]
          ?.plain_text || "",
      rockDetails:
        targetWeekPage.properties["Rock Details"]?.rich_text?.[0]?.plain_text ||
        "",
      // Habit number columns
      earlyWakeup: targetWeekPage.properties["Early Wakeup"]?.number || 0,
      sleepIn: targetWeekPage.properties["Sleep In"]?.number || 0,
      workout: targetWeekPage.properties["Workout"]?.number || 0,
      soberDays: targetWeekPage.properties["Sober Days"]?.number || 0,
      drinkingDays: targetWeekPage.properties["Drinking Days"]?.number || 0,
      bodyWeight: targetWeekPage.properties["Body Weight"]?.number || null,
    };

    // Object to store generated summaries
    const summaries = {};

    // Generate Personal Task Summary
    if (
      SELECTED_DATA_SOURCES === "both" ||
      SELECTED_DATA_SOURCES === "task-summary"
    ) {
      console.log("📝 Generating Personal Task Summary...");
      summaries["Personal Task Summary"] =
        generatePersonalTaskSummary(existingData);
    }

    // Generate Personal Cal Summary
    if (
      SELECTED_DATA_SOURCES === "both" ||
      SELECTED_DATA_SOURCES === "cal-summary"
    ) {
      console.log("📅 Generating Personal Cal Summary...");
      summaries["Personal Cal Summary"] =
        generatePersonalCalSummary(existingData);
    }

    // Update Notion with generated summaries
    console.log("\n📝 Updating Notion with summaries...");
    const properties = {};

    for (const [fieldName, content] of Object.entries(summaries)) {
      properties[fieldName] = {
        rich_text: [
          {
            text: {
              content: content.substring(0, 2000), // Notion limit
            },
          },
        ],
      };
    }

    await notion.pages.update({
      page_id: targetWeekPage.id,
      properties: properties,
    });

    console.log(
      `✅ Successfully updated Week ${paddedWeek} with personal summaries!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
}

/**
 * Generate Personal Task Summary
 */
function generatePersonalTaskSummary(data) {
  let summary = "";

  // ===== TRIPS =====
  summary += "===== TRIPS =====\n";
  if (data.tripDetails) {
    summary += formatTrips(data.tripDetails) + "\n";
  } else {
    summary += "No trips this week\n";
  }

  // ===== EVENTS =====
  summary += "\n===== EVENTS =====\n";
  if (data.eventDetails) {
    summary += formatEvents(data.eventDetails) + "\n";
  } else {
    summary += "No events this week\n";
  }

  // ===== HABITS =====
  summary += "\n===== HABITS =====\n";
  summary += formatHabits(data) + "\n";

  // ===== ROCKS =====
  summary += "\n===== ROCKS =====\n";
  if (data.rockDetails) {
    summary += formatRocks(data.rockDetails) + "\n";
  } else {
    summary += "No rocks this week\n";
  }

  // ===== SUMMARY =====
  summary += "\n===== SUMMARY =====\n";
  if (data.personalTasks) {
    summary += formatPersonalTasksSummary(data.personalTasks);
  } else {
    summary += "No personal tasks this week";
  }

  return summary;
}

/**
 * Generate Personal Cal Summary
 */
function generatePersonalCalSummary(data) {
  let summary = "===== SUMMARY =====\n";

  // Extract hours and format each event type
  const eventSummaries = [];

  // Personal Events (extract hours only, don't include in summary per rules)
  const personalHours = extractHours(data.personalEvents);
  eventSummaries.push(
    `PERSONAL EVENTS (${extractEventCount(
      data.personalEvents
    )} events, ${personalHours} hours):`
  );

  // Home Events (extract hours only, don't include details per rules)
  const homeHours = extractHours(data.homeEvents);
  eventSummaries.push(
    `HOME EVENTS (${extractEventCount(
      data.homeEvents
    )} events, ${homeHours} hours):`
  );

  // Interpersonal Events (include details)
  if (
    data.interpersonalEvents &&
    !data.interpersonalEvents.includes("No interpersonal events")
  ) {
    eventSummaries.push(
      formatCalendarEvents(data.interpersonalEvents, "INTERPERSONAL EVENTS")
    );
  } else {
    eventSummaries.push(
      `INTERPERSONAL EVENTS (0 events, 0 hours):\nNo interpersonal events this week`
    );
  }

  // Mental Health Events
  if (
    data.mentalHealthEvents &&
    !data.mentalHealthEvents.includes("No mental health events")
  ) {
    eventSummaries.push(
      formatCalendarEvents(data.mentalHealthEvents, "MENTAL HEALTH EVENTS")
    );
  } else {
    eventSummaries.push(
      `MENTAL HEALTH EVENTS (0 events, 0 hours):\nNo mental health events this week`
    );
  }

  // Physical Health Events
  if (
    data.physicalHealthEvents &&
    !data.physicalHealthEvents.includes("No physical health events")
  ) {
    eventSummaries.push(
      formatCalendarEvents(data.physicalHealthEvents, "PHYSICAL HEALTH EVENTS")
    );
  } else {
    eventSummaries.push(
      `PHYSICAL HEALTH EVENTS (0 events, 0 hours):\nNo physical health events this week`
    );
  }

  // Workout Events
  if (data.workoutEvents && !data.workoutEvents.includes("No workout events")) {
    eventSummaries.push(
      formatCalendarEvents(data.workoutEvents, "WORKOUT EVENTS")
    );
  } else {
    eventSummaries.push(
      `WORKOUT EVENTS (0 events, 0 hours):\nNo workout events this week`
    );
  }

  // Reading Events
  if (data.readingEvents && !data.readingEvents.includes("No reading events")) {
    eventSummaries.push(
      formatCalendarEvents(data.readingEvents, "READING EVENTS")
    );
  } else {
    eventSummaries.push(
      `ARCHIVE (0 events, 0 hours):\nNo reading events this week`
    );
  }

  // Video Game Events
  if (
    data.videoGameEvents &&
    !data.videoGameEvents.includes("No video game events")
  ) {
    eventSummaries.push(
      formatCalendarEvents(data.videoGameEvents, "VIDEO GAME EVENTS")
    );
  } else {
    eventSummaries.push(
      `VIDEO GAME EVENTS (0 events, 0 hours):\nNo video game events this week`
    );
  }

  // Personal PR Events
  if (
    data.personalPREvents &&
    !data.personalPREvents.includes("No personal PR events")
  ) {
    eventSummaries.push(
      formatCalendarEvents(data.personalPREvents, "PERSONAL PR EVENTS")
    );
  } else {
    eventSummaries.push(
      `PERSONAL PR EVENTS (0 apps, 0 commits):\nNo personal PR events this week`
    );
  }

  summary += eventSummaries.join("\n\n");

  return summary;
}

/**
 * Helper functions for formatting (placeholder implementations)
 */
function formatTrips(tripDetails) {
  // TODO: Implement trip formatting logic
  return tripDetails;
}

function formatEvents(eventDetails) {
  // TODO: Implement event formatting logic with date ordering
  return eventDetails;
}

function formatHabits(data) {
  let habits = "";
  habits += `🌅 ${data.earlyWakeup} early wake ups\n`;
  habits += `🛏️ ${data.sleepIn} days sleeping in\n`;
  habits += `🏋️ ${data.workout} workouts\n`;
  // TODO: Add reading and gaming days from habit details
  habits += `💧 ${data.soberDays} days sober\n`;
  habits += `🍷 ${data.drinkingDays} days drinking\n`;
  if (data.bodyWeight) {
    habits += `⚖️ ${data.bodyWeight} avg body weight`;
  }
  return habits;
}

function formatRocks(rockDetails) {
  // TODO: Implement rock formatting with status ordering (✅ → 👾 → 🚧 → 🥊 → N/A)
  return rockDetails;
}

function formatPersonalTasksSummary(personalTasks) {
  // TODO: Implement task filtering to exclude Interpersonal tasks
  return personalTasks;
}

function formatCalendarEvents(eventData, eventType) {
  // TODO: Implement calendar event formatting
  return eventData;
}

function extractHours(eventData) {
  // TODO: Extract hours from event data
  const hoursMatch = eventData?.match(/(\d+\.?\d*)\s*hours?/);
  return hoursMatch ? hoursMatch[1] : "0";
}

function extractEventCount(eventData) {
  // TODO: Extract event count from event data
  const countMatch = eventData?.match(/(\d+)\s*events?/);
  return countMatch ? countMatch[1] : "0";
}

/**
 * Process all selected weeks
 */
async function processAllWeeks() {
  console.log(`\n🚀 Processing ${TARGET_WEEKS.length} week(s)...`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log(
    `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
  );
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Check if running in interactive mode
  const result = await checkInteractiveMode(args);

  if (result.isInteractive) {
    // First, choose data sources
    console.log("📊 What data would you like to summarize?\n");
    console.log("1. Both (Personal Task Summary + Personal Cal Summary)");
    console.log("2. Personal Task Summary only");
    console.log("3. Personal Cal Summary only");

    const dataSourceInput = await askQuestion("\n? Choose option (1-3): ");

    switch (dataSourceInput.trim()) {
      case "1":
        SELECTED_DATA_SOURCES = "both";
        console.log("✅ Selected: Both summaries");
        break;
      case "2":
        SELECTED_DATA_SOURCES = "task-summary";
        console.log("✅ Selected: Personal Task Summary only");
        break;
      case "3":
        SELECTED_DATA_SOURCES = "cal-summary";
        console.log("✅ Selected: Personal Cal Summary only");
        break;
      default:
        SELECTED_DATA_SOURCES = "both";
        console.log("✅ Selected: Both summaries (default)");
        break;
    }

    // Then choose weeks
    console.log(`\n📌 Default: Week ${DEFAULT_TARGET_WEEKS.join(",")}\n`);

    const weeksInput = await askQuestion(
      "? Which weeks to process? (comma-separated, e.g., 1,2,3): "
    );

    if (weeksInput.trim()) {
      TARGET_WEEKS = weeksInput
        .split(",")
        .map((w) => parseInt(w.trim()))
        .filter((w) => !isNaN(w));
    }

    console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
    console.log(`📊 Data sources: ${SELECTED_DATA_SOURCES}`);
    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }

    console.log("");
  } else {
    TARGET_WEEKS = result.targetWeeks;
    SELECTED_DATA_SOURCES = "both";
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
