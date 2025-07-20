const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
require("dotenv").config();

// Configuration - using environment variables
const NOTION_TOKEN = process.env.NOTION_TOKEN;

// Initialize clients
const notion = new Client({ auth: NOTION_TOKEN });

// Database IDs - using environment variables
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

// Habit Calendar Configuration
const HABIT_CALENDARS = [
  {
    envVar: "WAKE_UP_EARLY_CALENDAR_ID",
    notionField: "Early Wakeup",
    displayName: "Early Wakeup",
  },
  {
    envVar: "SLEEP_IN_CALENDAR_ID",
    notionField: "Sleep In",
    displayName: "Sleep In",
  },
  {
    envVar: "WORKOUT_CALENDAR_ID",
    notionField: "Workout",
    displayName: "Workout",
  },
  {
    envVar: "READ_CALENDAR_ID",
    notionField: "Read",
    displayName: "Read",
  },
  {
    envVar: "VIDEO_GAMES_CALENDAR_ID",
    notionField: "Video Games",
    displayName: "Video Games",
  },
  {
    envVar: "SOBER_DAYS_CALENDAR_ID",
    notionField: "Sober Days",
    displayName: "Sober Days",
  },
  {
    envVar: "DRINKING_DAYS_CALENDAR_ID",
    notionField: "Drinking Days",
    displayName: "Drinking Days",
  },
  {
    envVar: "BODY_WEIGHT_CALENDAR_ID",
    notionField: "Body Weight",
    displayName: "Body Weight",
  },
];

console.log("🎯 Habit Calendar Summary Generator");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let SELECTED_CALENDARS = [...HABIT_CALENDARS]; // Default to all

// Google Calendar authentication
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

// Pre-flight checks
async function performPreflightChecks() {
  console.log("\n🔍 Checking configuration...");

  // Check for missing calendar IDs (only for selected calendars)
  const missingIds = [];
  SELECTED_CALENDARS.forEach((calendar) => {
    if (!process.env[calendar.envVar]) {
      missingIds.push(calendar.envVar);
    }
  });

  if (missingIds.length > 0) {
    console.error("❌ Missing calendar IDs:");
    missingIds.forEach((id) => console.error(`   - ${id}`));
    console.error("Please check your .env file");
    process.exit(1);
  }

  console.log(
    `✅ All ${SELECTED_CALENDARS.length} selected calendar IDs found`
  );

  // Test Google Calendar API connection
  try {
    const auth = getGoogleAuth();
    const calendar = google.calendar({ version: "v3", auth });

    // Test with a simple calendar list request
    await calendar.calendarList.list({ maxResults: 1 });
    console.log("✅ Google Calendar API connection successful\n");
  } catch (error) {
    console.error(
      "❌ Failed to connect to Google Calendar API:",
      error.message
    );
    console.error("Please check your Google authentication credentials");
    process.exit(1);
  }
}

// Fetch calendar events
async function fetchCalendarEvents(calendarId, startDate, endDate) {
  const auth = getGoogleAuth();
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: calendarId,
    timeMin: `${startDate}T00:00:00Z`,
    timeMax: `${endDate}T23:59:59Z`,
    singleEvents: true,
    orderBy: "startTime",
  });

  return response.data.items || [];
}

// Update Notion with number fields
async function updateHabitNumbers(notion, pageId, summaryUpdates) {
  const properties = {};

  // Convert numbers to Notion property format
  for (const [fieldName, count] of Object.entries(summaryUpdates)) {
    properties[fieldName] = {
      number: count,
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
}

// Process a single week
async function processWeek(weekNumber, isMultiWeek) {
  try {
    const paddedWeek = weekNumber.toString().padStart(2, "0");
    console.log(`🗓️  === PROCESSING WEEK ${weekNumber} ===`);

    // 1. Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      throw new Error(`Could not find Week ${weekNumber} Recap`);
    }

    console.log(`✅ Found Week ${paddedWeek} Recap!`);

    // 2. Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      throw new Error(`Week ${weekNumber} has no week relation`);
    }

    const weekPageId = weekRelation[0].id;

    // 3. Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
    const dateRange = weekPage.properties["Date Range (SET)"].date;

    if (!dateRange) {
      throw new Error(`Week ${weekNumber} has no date range`);
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;
    console.log(`📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}`);

    // 4. Fetch data from selected habit calendars
    console.log(
      `\n📥 Fetching habit data from ${SELECTED_CALENDARS.length} calendar(s)...`
    );
    const summaryUpdates = {};

    for (let i = 0; i < SELECTED_CALENDARS.length; i++) {
      const calendar = SELECTED_CALENDARS[i];
      const calendarId = process.env[calendar.envVar];

      try {
        // Add delay if processing multiple weeks (after first calendar)
        if (isMultiWeek && i > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        const allEvents = await fetchCalendarEvents(
          calendarId,
          startDate,
          endDate
        );

        // Filter events to only include those in the target week
        const events = allEvents.filter((event) => {
          let eventDate;

          // Get the event date (same logic as below, but for filtering)
          if (
            calendar.envVar === "SLEEP_IN_CALENDAR_ID" ||
            calendar.envVar === "WAKE_UP_EARLY_CALENDAR_ID"
          ) {
            eventDate =
              event.end?.date ||
              event.end?.dateTime?.split("T")[0] ||
              event.start?.date ||
              event.start?.dateTime?.split("T")[0];
          } else {
            eventDate =
              event.start?.date || event.start?.dateTime?.split("T")[0];
          }

          // Check if event date is within the week (inclusive)
          return eventDate && eventDate >= startDate && eventDate <= endDate;
        });

        // For habit tracking, count unique days instead of total events
        const uniqueDays = new Set();

        events.forEach((event) => {
          let eventDate;

          // For sleep-related habits, use END time to determine the day
          if (
            calendar.envVar === "SLEEP_IN_CALENDAR_ID" ||
            calendar.envVar === "WAKE_UP_EARLY_CALENDAR_ID"
          ) {
            if (event.end && event.end.date) {
              // All-day event - use end date
              eventDate = event.end.date;
            } else if (event.end && event.end.dateTime) {
              // Timed event - extract date from END time (when you woke up)
              eventDate = event.end.dateTime.split("T")[0];
            } else if (event.start && event.start.date) {
              // Fallback to start date if no end time
              eventDate = event.start.date;
            } else if (event.start && event.start.dateTime) {
              // Fallback to start date if no end time
              eventDate = event.start.dateTime.split("T")[0];
            }
          } else {
            // For other habits, use START time
            if (event.start && event.start.date) {
              eventDate = event.start.date;
            } else if (event.start && event.start.dateTime) {
              eventDate = event.start.dateTime.split("T")[0];
            }
          }

          if (eventDate) {
            uniqueDays.add(eventDate);
          }
        });

        const habitCount = uniqueDays.size;
        console.log(
          `   ${calendar.displayName}: ${habitCount} days (${events.length} events)`
        );
        summaryUpdates[calendar.notionField] = habitCount;
      } catch (error) {
        console.error(
          `\n❌ Failed to fetch ${calendar.displayName} calendar: ${error.message}`
        );
        console.error("Process aborted to ensure data integrity");
        process.exit(1);
      }
    }

    // 5. Update Notion
    console.log(`\n📝 Updating Notion...`);
    await updateHabitNumbers(notion, targetWeekPage.id, summaryUpdates);
    console.log(`✅ Successfully updated Week ${paddedWeek} recap!`);
  } catch (error) {
    console.error(`\n❌ Error processing Week ${weekNumber}: ${error.message}`);
    process.exit(1);
  }
}

// Process all selected weeks
async function processAllWeeks() {
  const isMultiWeek = TARGET_WEEKS.length > 1;

  console.log(
    `\n🚀 Starting habit tracking summary for weeks: ${TARGET_WEEKS.join(", ")}`
  );
  console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...\n`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber, isMultiWeek);

    // Add a newline between weeks for better readability
    if (TARGET_WEEKS.indexOf(weekNumber) < TARGET_WEEKS.length - 1) {
      console.log("");
    }
  }

  console.log(
    `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
  );
}

// Main execution
async function main() {
  // Perform pre-flight checks first
  await performPreflightChecks();

  const args = process.argv.slice(2);

  // Check if running in interactive mode
  const result = await checkInteractiveMode(
    args,
    [], // No categories for this script
    DEFAULT_TARGET_WEEKS,
    [] // No active categories
  );

  if (result.isInteractive) {
    console.log(`📌 Default: Week ${DEFAULT_TARGET_WEEKS.join(",")}\n`);

    const weeksInput = await askQuestion(
      "? Which weeks to process? (comma-separated, e.g., 1,2,3): "
    );

    if (weeksInput.trim()) {
      TARGET_WEEKS = weeksInput
        .split(",")
        .map((w) => parseInt(w.trim()))
        .filter((w) => !isNaN(w));
    }

    // Ask which calendars to update
    console.log("\n? Which calendars to update?");
    console.log("  1 - All Calendars");
    HABIT_CALENDARS.forEach((cal, idx) => {
      console.log(`  ${idx + 2} - ${cal.displayName}`);
    });

    const calInput = await askQuestion(
      "\n? Enter numbers (e.g., 1,3,5 or 1 for all): "
    );

    if (calInput.trim()) {
      const selections = calInput
        .split(",")
        .map((c) => parseInt(c.trim()))
        .filter((c) => !isNaN(c));

      if (selections.includes(1)) {
        SELECTED_CALENDARS = [...HABIT_CALENDARS];
      } else {
        SELECTED_CALENDARS = selections
          .filter((num) => num >= 2 && num <= HABIT_CALENDARS.length + 1)
          .map((num) => HABIT_CALENDARS[num - 2]);
      }
    }

    // Show confirmation
    console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
    console.log(
      `📋 Updating calendars: ${
        SELECTED_CALENDARS.length === HABIT_CALENDARS.length
          ? "All 8 calendars"
          : SELECTED_CALENDARS.map((c) => c.displayName).join(", ")
      }`
    );

    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }
  } else {
    // Command line mode - default to all calendars
    TARGET_WEEKS = result.targetWeeks;
    SELECTED_CALENDARS = [...HABIT_CALENDARS];
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
    console.error("❌ Unexpected error:", error.message);
    rl.close();
    process.exit(1);
  });
