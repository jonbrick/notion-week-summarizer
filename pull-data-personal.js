// pull-data-personal.js
const { Client } = require("@notionhq/client");
const { pullPersonalTasks } = require("./data-pulls/pull-personal-tasks");
const {
  findWeekRecapPage,
  updateAllSummaries,
} = require("./src/utils/notion-utils");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

console.log("📥 Personal Data Pull - Modular Version");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n📋 Personal Data Pull Options:");
  console.log("  1. Tasks - Pull completed tasks from Notion");
  console.log("  2. Calendars - Pull all calendar events (coming soon)");
  console.log("  3. All - Pull everything");

  const modeChoice = await askQuestion(
    "\n? What to pull? (1-3, default is 3): "
  );
  const mode = modeChoice.trim() || "3";

  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );

  if (weekInput.trim()) {
    TARGET_WEEKS = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
  const confirm = await askQuestion("Continue? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  return { mode, weeks: TARGET_WEEKS };
}

// Main processing function
async function processWeek(weekNumber, mode = "all") {
  console.log(`\n📅 Processing Week ${weekNumber}...`);

  try {
    // Find the recap page for this week
    const recapPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!recapPage) {
      console.error(`❌ Week ${weekNumber} recap page not found`);
      return;
    }

    // Collect all column updates
    const columnUpdates = {};

    // Pull tasks if requested
    if (mode === "all" || mode === "1") {
      console.log("\n🔄 Pulling personal tasks...");
      try {
        const taskData = await pullPersonalTasks(weekNumber);
        Object.assign(columnUpdates, taskData);
        console.log("   ✅ Tasks pulled successfully");
      } catch (error) {
        console.error("   ❌ Failed to pull tasks:", error.message);
      }
    }

    // Pull calendars if requested (TODO)
    if (mode === "all" || mode === "2") {
      console.log("\n🔄 Pulling personal calendars...");
      console.log("   ⚠️  Calendar pulling not yet implemented");
      // TODO: const calendarData = await pullPersonalCalendars(weekNumber);
      // Object.assign(columnUpdates, calendarData);
    }

    // Update Notion with all collected data
    if (Object.keys(columnUpdates).length > 0) {
      console.log("\n📝 Updating Notion page...");
      await updateAllSummaries(notion, recapPage.id, columnUpdates);
      console.log(`✅ Week ${weekNumber} updated successfully!`);
    } else {
      console.log(`⚠️  No data to update for Week ${weekNumber}`);
    }
  } catch (error) {
    console.error(`❌ Error processing week ${weekNumber}:`, error.message);
  }
}

// Main execution
async function main() {
  let mode = "all";

  // Check for command line arguments vs interactive mode
  const args = process.argv.slice(2);
  const result = await checkInteractiveMode(args, [], DEFAULT_TARGET_WEEKS, []);

  if (result.isInteractive) {
    const config = await runInteractiveMode();
    mode = config.mode;
    TARGET_WEEKS = config.weeks;
  } else {
    // Use weeks from the result
    TARGET_WEEKS = result.targetWeeks;

    // Parse additional command line arguments for mode
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--mode" && args[i + 1]) {
        mode = args[i + 1];
      }
    }
  }

  console.log(
    `\n🚀 Starting personal data pull for ${TARGET_WEEKS.length} week(s)`
  );
  console.log(
    `   Mode: ${
      mode === "1" ? "Tasks only" : mode === "2" ? "Calendars only" : "All data"
    }`
  );

  // Process each week
  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber, mode);
  }

  console.log("\n🎉 Personal data pull complete!");

  if (!result.isInteractive) {
    process.exit(0);
  }
}

// Run the script
main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
