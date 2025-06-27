const { Client } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
} = require("./src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("./src/utils/notion-utils");
const { generateTaskSummary } = require("./src/utils/ai-utils");
const {
  ALL_TASK_CATEGORIES,
  DEFAULT_TARGET_WEEKS,
  DEFAULT_ACTIVE_CATEGORIES,
} = require("./src/config/task-config");
require("dotenv").config();

// Configuration - now using environment variables
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Initialize clients
const notion = new Client({ auth: NOTION_TOKEN });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Database IDs - now using environment variables
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

// ========================================
// ⭐ DEFAULT CONFIGURATION (BACKDOOR) ⭐
// ========================================

// 1️⃣ DEFAULT WEEKS TO PROCESS
// 2️⃣ DEFAULT CATEGORIES TO PROCESS (all on by default)

// ========================================
// These will be set either from defaults or user input
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let ACTIVE_CATEGORIES = [...DEFAULT_ACTIVE_CATEGORIES];
let DRY_RUN = false;

// Filter categories based on ACTIVE_CATEGORIES
function getActiveCategories() {
  return ALL_TASK_CATEGORIES.filter((cat) =>
    ACTIVE_CATEGORIES.includes(cat.notionValue)
  );
}

async function generateAllWeekSummaries() {
  try {
    const TASK_CATEGORIES = getActiveCategories();

    console.log(
      `🚀 Starting summary generation for weeks: ${TARGET_WEEKS.join(", ")}`
    );
    console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...`);
    console.log(
      `📋 Active categories: ${TASK_CATEGORIES.map((c) => c.notionValue).join(
        ", "
      )}\n`
    );

    if (DRY_RUN) {
      console.log("🔍 DRY RUN MODE - No changes will be made to Notion\n");
    }

    for (const weekNumber of TARGET_WEEKS) {
      console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);
      await generateWeekSummary(weekNumber);
    }

    console.log(
      `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
    );
  } catch (error) {
    console.error("❌ Error in batch processing:", error);
  }
}

async function generateWeekSummary(targetWeek) {
  try {
    const TASK_CATEGORIES = getActiveCategories();

    // 1. Get all recap pages and find target week
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      targetWeek
    );
    const paddedWeek = targetWeek.toString().padStart(2, "0");
    if (targetWeekPage) {
      console.log(`✅ Found Week ${paddedWeek} Recap!`);
    } else {
      console.log(`❌ Could not find Week ${targetWeek} Recap`);
      return;
    }

    // 2. Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      console.log(`❌ Week ${targetWeek} has no week relation`);
      return;
    }

    const weekPageId = weekRelation[0].id;

    // 3. Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });

    const dateRange = weekPage.properties["Date Range (SET)"].date;
    if (!dateRange) {
      console.log(`❌ Week ${targetWeek} has no date range`);
      return;
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;

    console.log(`📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}`);

    // 4. Process each category (only the active ones!)
    const summaryUpdates = {};

    for (const category of TASK_CATEGORIES) {
      console.log(`\n🔄 Processing ${category.notionValue}...`);

      // Query tasks for this category using Due Date within the week's date range
      const tasksResponse = await notion.databases.query({
        database_id: TASKS_DATABASE_ID,
        filter: {
          and: [
            {
              property: "Due Date",
              date: {
                on_or_after: startDate,
              },
            },
            {
              property: "Due Date",
              date: {
                on_or_before: endDate,
              },
            },
            {
              property: "Type",
              select: {
                equals: category.notionValue,
              },
            },
            {
              property: "Status",
              status: {
                equals: "🟢 Done",
              },
            },
          ],
        },
      });

      console.log(
        `📋 Found ${tasksResponse.results.length} ${category.notionValue} tasks`
      );

      if (tasksResponse.results.length === 0) {
        // Create short, clear empty message
        const categoryName = category.notionValue
          .replace(/💪|💼|🌱|🍻|❤️|🏠/g, "")
          .trim();
        summaryUpdates[
          category.summaryField
        ] = `No ${categoryName} tasks this week.`;
        console.log(`📝 Empty summary for ${category.notionValue}`);
        continue;
      }

      // Extract task names
      const taskNames = tasksResponse.results.map((task) => {
        const titleProperty = task.properties.Task;
        if (titleProperty && titleProperty.title) {
          return titleProperty.title.map((t) => t.plain_text).join("");
        }
        return "Untitled task";
      });

      console.log(`📝 Tasks to summarize:`, taskNames);

      // Generate AI summary
      const summary = await generateTaskSummary(
        taskNames,
        category.promptContext
      );
      summaryUpdates[category.summaryField] = summary;

      console.log(`🤖 Generated summary: ${summary}`);
    }

    // 5. Update all summaries at once
    if (DRY_RUN) {
      console.log("🔍 DRY RUN MODE - Would update these summaries:");
      for (const [field, summary] of Object.entries(summaryUpdates)) {
        console.log(`   ${field}: ${summary}`);
      }
      console.log("   (No changes made to Notion)");
    } else {
      await updateAllSummaries(notion, targetWeekPage.id, summaryUpdates);
    }
    console.log(
      `✅ Successfully ${
        DRY_RUN ? "simulated" : "updated"
      } Week ${paddedWeek} recap with selected category summaries!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${targetWeek}:`, error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const result = await checkInteractiveMode(
    args,
    ALL_TASK_CATEGORIES,
    DEFAULT_TARGET_WEEKS,
    DEFAULT_ACTIVE_CATEGORIES
  );

  if (result.isInteractive) {
    const interactiveResult = await runInteractiveMode(
      ALL_TASK_CATEGORIES,
      DEFAULT_TARGET_WEEKS,
      DEFAULT_ACTIVE_CATEGORIES,
      "🎯 Notion Week Summary Generator"
    );
    TARGET_WEEKS = interactiveResult.targetWeeks;
    ACTIVE_CATEGORIES = interactiveResult.activeCategories;
    DRY_RUN = interactiveResult.dryRun;
  } else {
    TARGET_WEEKS = result.targetWeeks;
    ACTIVE_CATEGORIES = result.activeCategories;
    DRY_RUN = result.dryRun;
  }

  await generateAllWeekSummaries();
  if (rl && rl.close) rl.close();
}

// Run the script
main();
