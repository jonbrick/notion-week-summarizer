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
const retroConfig = require("./src/config/retro-extraction-config");
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
function extractMonthlyItems(monthlyTaskData, monthlyCalData, mode, config) {
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
      config
    );

    // Extract from cal data with section-specific criteria
    const habits = extractHabitsWithCriteria(
      calData,
      config.evaluationCriteria.HABITS?.[mode] ?? "none",
      config
    );
    const calSummary = extractCalSummaryWithCriteria(
      calData,
      config.evaluationCriteria.CAL_SUMMARY?.[mode] ?? "none",
      config
    );
    const calEvents = extractCalEventsWithCriteria(
      calData,
      config.evaluationCriteria.CAL_EVENTS?.[mode] ?? "none",
      config
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
 * Format monthly retrospective sections
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
    let allSectionItems = [];

    // Collect all items from all weeks for this section
    monthlyItems.forEach((weekData) => {
      const weekItems = weekData[dataKey] || [];
      if (Array.isArray(weekItems)) {
        allSectionItems = allSectionItems.concat(weekItems);
      }
    });

    const shouldShow =
      allSectionItems.length > 0 ||
      (mode === "good" ? cfg.alwaysShowGoodSection : cfg.alwaysShowBadSection);

    if (shouldShow) {
      sections.push(`===== ${cfg.title} =====`);
      if (allSectionItems.length > 0) {
        sections.push(allSectionItems.join("\n"));
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

    if (monthTaskDataProp?.formula?.string) {
      monthTaskData = monthTaskDataProp.formula.string.trim();
    }

    if (monthCalDataProp?.formula?.string) {
      monthCalData = monthCalDataProp.formula.string.trim();
    }

    console.log(`📋 Found Task Data: ${monthTaskData ? "YES" : "NO"}`);
    console.log(`📋 Found Cal Data: ${monthCalData ? "YES" : "NO"}`);

    if (!monthTaskData && !monthCalData) {
      console.log("⚠️ No monthly data found to process");
      return;
    }

    // Extract "what went well" items using good criteria
    console.log("📝 Extracting what went well...");
    const goodItems = extractMonthlyItems(
      monthTaskData,
      monthCalData,
      "good",
      retroConfig
    );

    // Extract "what didn't go well" items using bad criteria
    console.log("📝 Extracting what didn't go well...");
    const badItems = extractMonthlyItems(
      monthTaskData,
      monthCalData,
      "bad",
      retroConfig
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

    // Combine into final recap
    let monthlyRetro = "";
    if (goodSection) {
      monthlyRetro += "===== WHAT WENT WELL =====\n" + goodSection;
    }
    if (badSection) {
      monthlyRetro +=
        (monthlyRetro ? "\n\n" : "") +
        "===== WHAT DIDN'T GO WELL =====\n" +
        badSection;
    }

    if (!monthlyRetro) {
      console.log("⚠️ No monthly retrospective generated");
      return;
    }

    // Update target property
    console.log("📤 Updating Notion 'Month Recap - Personal'...");
    await notion.pages.update({
      page_id: page.id,
      properties: {
        "Month Recap - Personal": {
          rich_text: [
            {
              text: { content: monthlyRetro.substring(0, 2000) },
            },
          ],
        },
      },
    });

    console.log("✅ Monthly retrospective updated successfully!");
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
    "\nThis will generate a monthly retrospective using:\n- 'Month - Personal Tasks' (formula)\n- 'Month - Personal Cal' (formula)\n"
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
