const { Client } = require("@notionhq/client");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const { findWeekRecapPage } = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");

// Import all data pull modules
const { pullCalendarEvents } = require("./src/data-pulls/personal-calendar");
const { pullTasks } = require("./src/data-pulls/personal-tasks");
const { pullPREvents } = require("./src/data-pulls/personal-prs");
const { pullHabits } = require("./src/data-pulls/personal-habits");

require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("📥 Personal Data Orchestrator");
console.log("🎯 Pulling calendar, tasks, PRs, and habits\n");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Process a single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

    // 1. Find the week recap page
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

    // 2. Get the week relation and date range
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      console.log(`❌ Week ${weekNumber} has no week relation`);
      return;
    }

    const weekPageId = weekRelation[0].id;
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
    const dateRange = weekPage.properties["Date Range (SET)"].date;

    if (!dateRange) {
      console.log(`❌ Week ${weekNumber} has no date range`);
      return;
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // 3. Run all data pulls in parallel for efficiency
    console.log("\n🔄 Starting data pulls...");

    const [calendarData, tasksData, prData, habitsData] = await Promise.all([
      pullCalendarEvents(startDate, endDate),
      pullTasks(startDate, endDate),
      pullPREvents(startDate, endDate),
      pullHabits(startDate, endDate, weekPageId),
    ]);

    // 4. Combine all column updates
    const columnUpdates = {
      ...calendarData,
      ...tasksData,
      ...prData,
      ...habitsData,
    };

    // Log summary of what we're updating
    console.log("\n📊 Summary of updates:");
    Object.keys(columnUpdates).forEach((column) => {
      const lines = columnUpdates[column].split("\n");
      const header = lines[0];
      console.log(`   ${header}`);
    });

    // 5. Update Notion with all columns
    console.log("\n📝 Updating Notion columns...");
    const properties = {};

    for (const [fieldName, content] of Object.entries(columnUpdates)) {
      // Ensure content is a string and respect Notion's 2000 char limit
      const contentStr =
        typeof content === "string" ? content : String(content);

      properties[fieldName] = {
        rich_text: [
          {
            text: {
              content: contentStr.substring(0, 2000),
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
      `✅ Successfully updated Week ${paddedWeek} with all personal data!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    throw error;
  }
}

// Process all selected weeks
async function processAllWeeks() {
  console.log(`\n🚀 Processing ${TARGET_WEEKS.length} week(s)...`);

  for (const weekNumber of TARGET_WEEKS) {
    try {
      await processWeek(weekNumber);
    } catch (error) {
      console.error(`❌ Failed to process week ${weekNumber}:`, error.message);
      // Continue with next week instead of stopping
    }
  }

  console.log(`\n🎉 Completed processing ${TARGET_WEEKS.length} week(s)!`);
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Check if running in interactive mode
  const result = await checkInteractiveMode(args, [], DEFAULT_TARGET_WEEKS, []);

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

    console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }

    console.log("");
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
    console.error("❌ Unhandled error:", error);
    rl.close();
    process.exit(1);
  });
