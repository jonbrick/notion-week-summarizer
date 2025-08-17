const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const { findWeekRecapPage } = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
const {
  pullPersonalTasks,
} = require("./scripts/data-pulls/pull-personal-tasks");
const {
  pullPersonalPREvents,
} = require("./scripts/data-pulls/pull-personal-pr-events");
const {
  pullPersonalCalendar,
} = require("./scripts/data-pulls/pull-personal-calendar");
const {
  pullWorkoutCalendar,
} = require("./scripts/data-pulls/pull-personal-workout-calendar");
const {
  pullReadingCalendar,
} = require("./scripts/data-pulls/pull-personal-reading-calendar");
const {
  pullVideoGamesCalendar,
} = require("./scripts/data-pulls/pull-personal-video-games-calendar");
const {
  pullPersonalCodingCalendar,
} = require("./scripts/data-pulls/pull-personal-coding");
const {
  pullPersonalArtCalendar,
} = require("./scripts/data-pulls/pull-personal-art");
const {
  pullPersonalHabits,
} = require("./scripts/data-pulls/pull-personal-habit-calendars");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

console.log("📥 Personal Data Fetcher - Modular Version");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let SELECTED_DATA_SOURCES = "all"; // Default to all

/**
 * Google Calendar authentication helper
 */
function getGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.PERSONAL_GOOGLE_CLIENT_ID,
    process.env.PERSONAL_GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.PERSONAL_GOOGLE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

/**
 * Perform pre-flight checks before processing weeks
 */
async function performPreflightChecks() {
  console.log("\n🔍 Running pre-flight checks...");

  let checksPass = true;
  const failedChecks = [];

  // 1. Check for required environment variables
  const requiredEnvVars = [
    "PERSONAL_GOOGLE_CLIENT_ID",
    "PERSONAL_GOOGLE_CLIENT_SECRET",
    "PERSONAL_GOOGLE_REFRESH_TOKEN",
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingEnvVars.length > 0) {
    console.error("❌ Missing required environment variables:");
    missingEnvVars.forEach((varName) => console.error(`   - ${varName}`));
    checksPass = false;
    failedChecks.push("env_vars");
  } else {
    console.log("✅ All required environment variables found");
  }

  // 2. Check which calendars are needed based on selected data sources
  const calendarChecks = [];

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "pr-events"
  ) {
    if (process.env.PERSONAL_PR_CALENDAR_ID) {
      calendarChecks.push({
        name: "PR Events Calendar",
        id: process.env.PERSONAL_PR_CALENDAR_ID,
      });
    }
  }

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "personal-calendar"
  ) {
    if (process.env.PERSONAL_CALENDAR_ID) {
      calendarChecks.push({
        name: "Personal Calendar",
        id: process.env.PERSONAL_CALENDAR_ID,
      });
    }
  }

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "workout-calendar"
  ) {
    if (process.env.WORKOUT_CALENDAR_ID) {
      calendarChecks.push({
        name: "Workout Calendar",
        id: process.env.WORKOUT_CALENDAR_ID,
      });
    }
  }

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "reading-calendar"
  ) {
    if (process.env.READING_CALENDAR_ID) {
      calendarChecks.push({
        name: "Reading Calendar",
        id: process.env.READING_CALENDAR_ID,
      });
    }
  }

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "video-games-calendar"
  ) {
    if (process.env.VIDEO_GAMES_CALENDAR_ID) {
      calendarChecks.push({
        name: "Video Games Calendar",
        id: process.env.VIDEO_GAMES_CALENDAR_ID,
      });
    }
  }

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "personal-coding-calendar"
  ) {
    if (process.env.CODING_CALENDAR_ID) {
      calendarChecks.push({
        name: "Personal Coding Calendar",
        id: process.env.CODING_CALENDAR_ID,
      });
    }
  }

  if (
    SELECTED_DATA_SOURCES === "all" ||
    SELECTED_DATA_SOURCES === "personal-art-calendar"
  ) {
    if (process.env.ART_CALENDAR_ID) {
      calendarChecks.push({
        name: "Art Calendar",
        id: process.env.ART_CALENDAR_ID,
      });
    }
  }

  // 3. Test Google Calendar access if calendars are configured
  if (calendarChecks.length > 0) {
    console.log(
      `\n🔍 Testing access to ${calendarChecks.length} calendar(s)...`
    );

    try {
      const auth = getGoogleAuth();
      const calendar = google.calendar({ version: "v3", auth });

      // Just test with a simple API call
      await calendar.calendarList.list({ maxResults: 1 });
      console.log("✅ Google Calendar API access successful");
    } catch (error) {
      console.error("❌ Failed to access Google Calendar API");
      console.error(`   Error: ${error.message}`);
      checksPass = false;
      failedChecks.push("google_calendar_api");
    }
  }

  // 4. Check Notion access
  try {
    await notion.databases.retrieve({ database_id: RECAP_DATABASE_ID });
    console.log("✅ Notion API access successful");
  } catch (error) {
    console.error("❌ Failed to access Notion API");
    console.error(`   Error: ${error.message}`);
    checksPass = false;
    failedChecks.push("notion_api");
  }

  // Report results
  console.log("\n🔍 Pre-flight check results:");
  console.log("=".repeat(50));

  if (checksPass) {
    console.log("✅ All checks passed!");
    console.log("=".repeat(50));
    return true;
  } else {
    console.log("❌ Pre-flight checks failed!");
    console.log("Failed checks:", failedChecks.join(", "));
    console.log("=".repeat(50));
    console.log("\n⚠️  You can still proceed, but some data sources may fail.");

    const proceed = await askQuestion(
      "\nDo you want to continue anyway? (y/n): "
    );
    return proceed.toLowerCase() === "y";
  }
}

/**
 * Process a single week - fetch data and update Notion
 */
async function processWeek(weekNumber) {
  try {
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

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

    // Object to store all column updates
    const columnUpdates = {};
    const habitUpdates = {};

    // Pull data based on selected sources
    if (SELECTED_DATA_SOURCES === "all" || SELECTED_DATA_SOURCES === "tasks") {
      const tasksData = await pullPersonalTasks(weekNumber);
      Object.assign(columnUpdates, tasksData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "pr-events"
    ) {
      const prEventsData = await pullPersonalPREvents(weekNumber);
      Object.assign(columnUpdates, prEventsData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "personal-calendar"
    ) {
      const personalCalData = await pullPersonalCalendar(weekNumber);
      Object.assign(columnUpdates, personalCalData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "workout-calendar"
    ) {
      const workoutData = await pullWorkoutCalendar(weekNumber);
      Object.assign(columnUpdates, workoutData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "reading-calendar"
    ) {
      const readingData = await pullReadingCalendar(weekNumber);
      Object.assign(columnUpdates, readingData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "video-games-calendar"
    ) {
      const videoGamesData = await pullVideoGamesCalendar(weekNumber);
      Object.assign(columnUpdates, videoGamesData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "personal-coding-calendar"
    ) {
      const codingData = await pullPersonalCodingCalendar(weekNumber);
      Object.assign(columnUpdates, codingData);
    }

    if (
      SELECTED_DATA_SOURCES === "all" ||
      SELECTED_DATA_SOURCES === "personal-art-calendar"
    ) {
      const artData = await pullPersonalArtCalendar(weekNumber);
      Object.assign(columnUpdates, artData);
    }

    if (SELECTED_DATA_SOURCES === "all" || SELECTED_DATA_SOURCES === "habits") {
      const habitsData = await pullPersonalHabits(weekNumber);
      Object.assign(habitUpdates, habitsData);
    }

    // Update Notion with all columns
    console.log("\n📝 Updating Notion columns...");
    const properties = {};

    // Handle rich text columns (existing data)
    for (const [fieldName, content] of Object.entries(columnUpdates)) {
      // Ensure content is a string
      const contentStr =
        typeof content === "string" ? content : String(content);

      properties[fieldName] = {
        rich_text: [
          {
            text: {
              content: contentStr.substring(0, 2000), // Notion limit
            },
          },
        ],
      };
    }

    // Handle number columns (habits)
    for (const [fieldName, count] of Object.entries(habitUpdates)) {
      properties[fieldName] = {
        number: count,
      };
    }

    await notion.pages.update({
      page_id: targetWeekPage.id,
      properties: properties,
    });

    console.log(
      `✅ Successfully updated Week ${paddedWeek} with personal data!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
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
  const result = await checkInteractiveMode(args, [], DEFAULT_TARGET_WEEKS, []);

  if (result.isInteractive) {
    // First, choose data sources
    console.log("📊 What data would you like to sync?\n");
    console.log("1. All data sources");
    console.log("2. Tasks only");
    console.log("3. PR Events only");
    console.log("4. Personal Calendar only");
    console.log("5. Workout Calendar only");
    console.log("6. Reading Calendar only");
    console.log("7. Video Games Calendar only");
    console.log("8. Personal Coding Calendar only");
    console.log("9. Art Calendar only");
    console.log("10. Habits only");

    const dataSourceInput = await askQuestion(
      "\n? Choose data source (1-10): "
    );

    switch (dataSourceInput.trim()) {
      case "1":
        SELECTED_DATA_SOURCES = "all";
        console.log("✅ Selected: All data sources");
        break;
      case "2":
        SELECTED_DATA_SOURCES = "tasks";
        console.log("✅ Selected: Tasks only");
        break;
      case "3":
        SELECTED_DATA_SOURCES = "pr-events";
        console.log("✅ Selected: PR Events only");
        break;
      case "4":
        SELECTED_DATA_SOURCES = "personal-calendar";
        console.log("✅ Selected: Personal Calendar only");
        break;
      case "5":
        SELECTED_DATA_SOURCES = "workout-calendar";
        console.log("✅ Selected: Workout Calendar only");
        break;
      case "6":
        SELECTED_DATA_SOURCES = "reading-calendar";
        console.log("✅ Selected: Reading Calendar only");
        break;
      case "7":
        SELECTED_DATA_SOURCES = "video-games-calendar";
        console.log("✅ Selected: Video Games Calendar only");
        break;
      case "8":
        SELECTED_DATA_SOURCES = "personal-coding-calendar";
        console.log("✅ Selected: Personal Coding Calendar only");
        break;
      case "9":
        SELECTED_DATA_SOURCES = "personal-art-calendar";
        console.log("✅ Selected: Art Calendar only");
        break;
      case "10":
        SELECTED_DATA_SOURCES = "habits";
        console.log("✅ Selected: Habits only");
        break;
      default:
        SELECTED_DATA_SOURCES = "all";
        console.log("✅ Selected: All data sources (default)");
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

    // ADD PRE-FLIGHT CHECK HERE
    const preflightPass = await performPreflightChecks();
    if (!preflightPass) {
      console.log("❌ Exiting due to failed pre-flight checks");
      process.exit(1);
    }

    console.log("");
  } else {
    TARGET_WEEKS = result.targetWeeks;
    // TODO: Add command line args for data source selection
    // For now, default to all when running non-interactively
    SELECTED_DATA_SOURCES = "all";

    // ADD PRE-FLIGHT CHECK HERE TOO
    const preflightPass = await performPreflightChecks();
    if (!preflightPass) {
      console.log("❌ Exiting due to failed pre-flight checks");
      process.exit(1);
    }
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
