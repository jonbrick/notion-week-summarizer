const { Client } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
} = require("./src/utils/cli-utils");
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
const DEFAULT_TARGET_WEEKS = [1]; // Default: just week 1

// 2️⃣ DEFAULT CATEGORIES TO PROCESS (all on by default)
const DEFAULT_ACTIVE_CATEGORIES = [
  "💼 Work",
  "💪 Physical Health",
  "🌱 Personal",
  "🍻 Interpersonal",
  "❤️ Mental Health",
  "🏠 Home",
];

// ========================================
// These will be set either from defaults or user input
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let ACTIVE_CATEGORIES = [...DEFAULT_ACTIVE_CATEGORIES];
let DRY_RUN = false;

// Load context file (optional - will work without it)
let CONTEXT = "";
try {
  CONTEXT = fs.readFileSync("./context.md", "utf8");
  console.log("📖 Loaded context file");
} catch (error) {
  console.log(
    "📝 No context file found - create context.md to add definitions and style rules"
  );
}

// Task categories configuration
const ALL_TASK_CATEGORIES = [
  {
    notionValue: "💼 Work",
    summaryField: "Work Task Summary",
    promptContext: "work task",
  },
  {
    notionValue: "💪 Physical Health",
    summaryField: "Physical Health Task Summary",
    promptContext: "health task",
  },
  {
    notionValue: "🌱 Personal",
    summaryField: "Personal Task Summary",
    promptContext: "personal task",
  },
  {
    notionValue: "🍻 Interpersonal",
    summaryField: "Interpersonal Task Summary",
    promptContext: "interpersonal task",
  },
  {
    notionValue: "❤️ Mental Health",
    summaryField: "Mental Health Task Summary",
    promptContext: "mental health task",
  },
  {
    notionValue: "🏠 Home",
    summaryField: "Home Task Summary",
    promptContext: "home task",
  },
];

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
    const recapPages = await notion.databases.query({
      database_id: RECAP_DATABASE_ID,
    });

    // Find target week by looking at page titles with smart padding
    let targetWeekPage = null;
    const paddedWeek = targetWeek.toString().padStart(2, "0");

    for (const page of recapPages.results) {
      const titleProperty = page.properties["Week Recap"];
      if (titleProperty && titleProperty.title) {
        const title = titleProperty.title.map((t) => t.plain_text).join("");

        if (
          title === `Week ${targetWeek} Recap` ||
          title === `Week ${paddedWeek} Recap` ||
          title === `Week ${targetWeek}` ||
          title === `Week ${paddedWeek}`
        ) {
          targetWeekPage = page;
          console.log(`✅ Found Week ${paddedWeek} Recap!`);
          break;
        }
      }
    }

    if (!targetWeekPage) {
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
      const summary = await generateAISummary(
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
      await updateAllSummaries(targetWeekPage.id, summaryUpdates);
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

async function generateAISummary(taskNames, promptContext) {
  // Build prompt with optional context
  let prompt = "";

  if (CONTEXT) {
    prompt += `CONTEXT FOR BETTER SUMMARIES:
${CONTEXT}

---

`;
  }

  prompt += `Convert these ${promptContext}s into a concise summary. I need clear, professional language that respects my time - no fluff or unnecessary words.

RULES:
- 1-3 sentences maximum (4+ is too much)
- Group similar/related items together when possible
- Professional, direct language - not casual
- Be matter-of-fact and neutral - no judgment about outcomes
- Focus on WHAT I did, not how well I did it
- NO bullet points, NO lists, NO line breaks
- Cut all unnecessary words - be efficient

GROUPING EXAMPLES:
Multiple games: "ECG Game 3, ECG Game 4, ECG Game 5" → "Played ECG Games 3, 4, 5"
Multiple appointments: "Dr. Smith checkup, Dr. Jones blood test" → "Had appointments with Dr. Smith and Dr. Jones"
Multiple chores: "Clean kitchen, Vacuum living room, Dishes" → "Cleaned kitchen, vacuumed living room, did dishes"
Multiple meetings: "Team standup, Client call, 1:1 with manager" → "Had team standup, client call, and 1:1 with manager"

SINGLE ITEM EXAMPLES:
"Dr. Smith - checkup" → "Had checkup with Dr. Smith"
"Gym - leg day" → "Did leg day at gym"
"Therapy - Jernee Montoya" → "Had therapy with Jernee Montoya"
"Hackathon" → "Participated in hackathon"

TASKS TO SUMMARIZE:
${taskNames.map((name) => `${name}`).join("\n")}

Return 1-3 concise sentences combining these activities:`;

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 80,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].text.trim();
}

async function updateAllSummaries(pageId, summaryUpdates) {
  const properties = {};

  // Convert summaries to Notion property format
  for (const [fieldName, summary] of Object.entries(summaryUpdates)) {
    properties[fieldName] = {
      rich_text: [
        {
          text: {
            content: summary,
          },
        },
      ],
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
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
