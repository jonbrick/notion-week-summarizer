const { Client } = require("@notionhq/client");
const readline = require("readline");
const {
  extractTripsWithCriteria,
  extractEventsWithCriteria,
  extractRocksWithCriteria,
  extractHabitsWithCriteria,
  extractCalSummaryWithCriteria,
  extractCalEventsWithCriteria,
  extractTasksWithCriteria,
} = require("./src/utils/retro-extraction-functions");
const {
  aggregateMonthlyData,
  evaluateMonthlyHabits,
} = require("./src/utils/retro-monthly-functions");
const retroConfig = require("./src/config/retro-extraction-config");
const monthlyConfig = require("./src/config/retro-monthly-config");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const MONTHS_DATABASE_ID = process.env.RECAP_MONTHS_DATABASE_ID;

// CLI
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
function ask(question) {
  return new Promise((resolve) =>
    rl.question(question, (answer) => resolve(answer))
  );
}

console.log("📅 Monthly Personal Retro Generator");

async function findMonthRecapPage(monthNumber) {
  const padded = String(monthNumber).padStart(2, "0");
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthName = monthNames[monthNumber - 1];

  const resp = await notion.databases.query({
    database_id: MONTHS_DATABASE_ID,
  });

  let target = null;
  for (const page of resp.results) {
    const titleProp = page.properties["Month Recap"] || page.properties["Name"];
    const title = Array.isArray(titleProp?.title)
      ? titleProp.title.map((t) => t.plain_text).join("")
      : "";

    if (
      title === `${padded}. ${monthName} Recap` ||
      title === `Month ${monthNumber} Recap` ||
      title === `Month ${padded} Recap` ||
      title === `Month ${monthNumber}` ||
      title === `Month ${padded}` ||
      (title.includes(`${padded}.`) && title.includes(monthName))
    ) {
      target = page;
      break;
    }
  }
  return target;
}

/**
 * Parse weekly sections from the concatenated monthly data
 * Each week is separated by "+++ Week XX Recap Personal Tasks +++" or similar
 */
function parseWeeklySections(monthlyData, sectionType) {
  const weeklyData = [];
  const weekPattern = new RegExp(
    `\\+\\+\\+ Week \\d+ Recap Personal ${sectionType} \\+\\+\\+`,
    "g"
  );
  const sections = monthlyData.split(weekPattern);

  // Skip the first empty section, process the rest
  for (let i = 1; i < sections.length; i++) {
    const weekData = sections[i].trim();
    if (weekData) {
      weeklyData.push(weekData);
    }
  }

  return weeklyData;
}

/**
 * Extract items using the same criteria as weekly retro, but across all weeks
 */
function extractMonthlyItems(
  monthlyTaskData,
  monthlyCalData,
  mode,
  config,
  monthlyHabitsData,
  weekCount
) {
  const allItems = [];

  // Parse weekly task sections
  const weeklyTaskSections = parseWeeklySections(monthlyTaskData, "Tasks");
  const weeklyCalSections = parseWeeklySections(monthlyCalData, "Cal");

  // Process each week's data
  for (
    let i = 0;
    i < Math.max(weeklyTaskSections.length, weeklyCalSections.length);
    i++
  ) {
    const taskData = weeklyTaskSections[i] || "";
    const calData = weeklyCalSections[i] || "";

    // Extract from task data with section-specific criteria
    const trips = extractTripsWithCriteria(
      taskData,
      config.evaluationCriteria.TRIPS?.[mode] ?? "none",
      config
    );
    const events = extractEventsWithCriteria(
      taskData,
      config.evaluationCriteria.EVENTS?.[mode] ?? "none",
      config,
      mode
    );
    const rocks = extractRocksWithCriteria(
      taskData,
      config.evaluationCriteria.ROCKS?.[mode] ?? "none",
      config
    );
    const tasks = extractTasksWithCriteria(
      taskData,
      config.evaluationCriteria.TASKS?.[mode] ?? "none",
      { ...config, monthlyConfig }
    );

    // Extract from cal data with section-specific criteria
    // Use monthly habit evaluation instead of weekly extraction
    // Extract from cal data with section-specific criteria
    // Use monthly habit evaluation instead of weekly extraction
    let habits = [];
    if (i === 0 && monthlyHabitsData) {
      // Only evaluate habits once (on first week) using monthly data
      const habitEvaluation = evaluateMonthlyHabits(
        monthlyHabitsData,
        weekCount,
        config
      );
      habits = mode === "good" ? habitEvaluation.good : habitEvaluation.bad;
    }
    const calSummary = extractCalSummaryWithCriteria(
      calData,
      config.evaluationCriteria.CAL_SUMMARY?.[mode] ?? "none",
      config
    );
    const calEvents = extractCalEventsWithCriteria(
      calData,
      config.evaluationCriteria.CAL_EVENTS?.[mode] ?? "none",
      { ...config, monthlyConfig }
    );

    allItems.push({
      week: i + 1,
      trips,
      events,
      rocks,
      habits,
      calSummary,
      calEvents,
      tasks,
    });
  }

  return allItems;
}

/**
 * Format monthly retrospective sections with aggregation
 */
function formatMonthlyRetro(monthlyItems, mode, sectionConfig) {
  const sections = [];

  const keyMap = {
    TRIPS: "trips",
    EVENTS: "events",
    ROCKS: "rocks",
    HABITS: "habits",
    CAL_SUMMARY: "calSummary",
    CAL_EVENTS: "calEvents",
    TASKS: "tasks",
  };

  retroConfig.sectionOrder.forEach((sectionName) => {
    const cfg = retroConfig.sections[sectionName];
    // Respect include flags per mode
    if (mode === "good" && !cfg.includeInGood) return;
    if (mode === "bad" && !cfg.includeInBad) return;

    const dataKey = keyMap[sectionName];
    let weeklyArrays = [];

    // Collect arrays from each week for this section
    monthlyItems.forEach((weekData) => {
      const weekItems = weekData[dataKey] || [];
      if (Array.isArray(weekItems)) {
        weeklyArrays.push(weekItems);
      }
    });

    // Aggregate the weekly data instead of concatenating
    // UPDATED: For HABITS, don't aggregate - just use the monthly evaluation results
    let aggregatedItems;
    if (sectionName === "HABITS") {
      // Habits are already evaluated at monthly level, just get the first week's results
      aggregatedItems = weeklyArrays.length > 0 ? weeklyArrays[0] || [] : [];
    } else {
      // Aggregate the weekly data for other sections
      aggregatedItems = aggregateMonthlyData(weeklyArrays, sectionName, {
        ...retroConfig,
        monthlyConfig,
      });
    }
    const shouldShow =
      aggregatedItems.length > 0 ||
      (mode === "good" ? cfg.alwaysShowGoodSection : cfg.alwaysShowBadSection);

    if (shouldShow) {
      sections.push(`===== ${cfg.title} =====`);
      if (aggregatedItems.length > 0) {
        sections.push(aggregatedItems.join("\n"));
      } else {
        sections.push(cfg.emptyMessage);
      }
      sections.push("");
    }
  });

  return sections.join("\n").trim();
}

async function processMonth(monthNumber) {
  try {
    console.log(
      `\n🔄 Processing Month ${String(monthNumber).padStart(2, "0")} Retro`
    );

    const page = await findMonthRecapPage(monthNumber);
    if (!page) {
      console.error(`❌ Could not find Month ${monthNumber} Recap page`);
      return;
    }

    // Read the formula-based monthly data
    const monthTaskDataProp = page.properties["Month - Personal Tasks"];
    const monthCalDataProp = page.properties["Month - Personal Cal"];

    let monthTaskData = "";
    let monthCalData = "";

    // Get monthly habits data and week count
    const monthlyHabitsDataProp = page.properties["Monthly Habits"];
    const weekCountProp = page.properties["Number of weeks"];

    let monthlyHabitsData = "";
    let weekCount = 4; // default

    if (monthTaskDataProp?.formula?.string) {
      monthTaskData = monthTaskDataProp.formula.string.trim();
    }

    if (monthCalDataProp?.formula?.string) {
      monthCalData = monthCalDataProp.formula.string.trim();
    }

    if (monthlyHabitsDataProp?.formula?.string) {
      monthlyHabitsData = monthlyHabitsDataProp.formula.string.trim();
    }

    if (weekCountProp?.number) {
      weekCount = weekCountProp.number;
    }

    console.log(`📋 Found Task Data: ${monthTaskData ? "YES" : "NO"}`);
    console.log(`📋 Found Cal Data: ${monthCalData ? "YES" : "NO"}`);

    if (!monthTaskData && !monthCalData) {
      console.log("⚠️ No monthly data found to process");
      return;
    }

    // DELETE ME BECAUSE I AM DEBUGGING LOG STUFF
    console.log(
      `📊 Week count from DB: ${weekCountProp?.number}, using: ${weekCount}`
    );
    console.log(`📊 Monthly habits data: ${monthlyHabitsData ? "YES" : "NO"}`);

    // Extract "what went well" items using good criteria
    console.log("📝 Extracting what went well...");
    const goodItems = extractMonthlyItems(
      monthTaskData,
      monthCalData,
      "good",
      retroConfig,
      monthlyHabitsData,
      weekCount
    );

    // Extract "what didn't go well" items using bad criteria
    console.log("📝 Extracting what didn't go well...");
    const badItems = extractMonthlyItems(
      monthTaskData,
      monthCalData,
      "bad",
      retroConfig,
      monthlyHabitsData,
      weekCount
    );
    // Format the monthly retrospective
    const goodSection = formatMonthlyRetro(
      goodItems,
      "good",
      retroConfig.sections
    );
    const badSection = formatMonthlyRetro(
      badItems,
      "bad",
      retroConfig.sections
    );

    // Check if we have any content to update
    if (!goodSection && !badSection) {
      console.log("⚠️ No monthly retrospective generated");
      return;
    }

    // Update target properties (separate columns)
    console.log("📤 Updating Notion monthly columns...");
    const properties = {};

    if (goodSection) {
      properties["Month - What went well"] = {
        rich_text: [
          {
            text: { content: goodSection.substring(0, 2000) },
          },
        ],
      };
    }

    if (badSection) {
      properties["Month - What didn't go so well"] = {
        rich_text: [
          {
            text: { content: badSection.substring(0, 2000) },
          },
        ],
      };
    }

    await notion.pages.update({
      page_id: page.id,
      properties: properties,
    });

    console.log("✅ Monthly columns updated successfully!");
  } catch (err) {
    console.error("❌ Error processing month:", err.message);
    console.error(err.stack);
  }
}

async function main() {
  if (!MONTHS_DATABASE_ID) {
    console.error("❌ Missing env RECAP_MONTHS_DATABASE_ID");
    process.exit(1);
  }

  console.log(
    "\nThis will generate monthly summaries using:\n- 'Month - Personal Tasks' (formula)\n- 'Month - Personal Cal' (formula)\n\nWill update:\n- 'Month - What went well'\n- 'Month - What didn't go so well'\n"
  );
  const input = await ask("? Which month to process? (1-12): ");
  const month = parseInt((input || "").trim(), 10) || 1;

  console.log(`\n📊 Processing Month: ${month}`);
  const confirm = await ask("Continue? (y/n): ");
  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  await processMonth(month);
}

main().catch((e) => {
  console.error("❌ Unhandled error:", e);
  process.exit(1);
});
