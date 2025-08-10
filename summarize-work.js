const { Client } = require("@notionhq/client");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default week (will be overridden by user input)
let TARGET_WEEK = 1;

console.log("📊 Work Summary Generator (Reorganizing Only)");

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n🎯 Work Summary Generator");

  // Ask for weeks
  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );
  let targetWeeks = [TARGET_WEEK]; // default
  if (weekInput.trim()) {
    targetWeeks = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(
    `\n📊 Generating work summary for Week${
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

async function fetchWeekData(weekNumber) {
  const paddedWeek = weekNumber.toString().padStart(2, "0");

  // Query for the specific week
  const response = await notion.databases.query({
    database_id: RECAP_DATABASE_ID,
    filter: {
      property: "Week Recap",
      title: {
        contains: `Week ${paddedWeek} Recap`,
      },
    },
  });

  if (response.results.length === 0) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  const page = response.results[0];

  // Extract work data
  const weekData = {
    id: page.id,
    weekRecap: page.properties["Week Recap"]?.title?.[0]?.plain_text || "",
    workTaskSummary:
      page.properties["Work Task Summary"]?.rich_text?.[0]?.plain_text || "",
    workCalSummary:
      page.properties["Work Cal Summary"]?.rich_text?.[0]?.plain_text || "",
  };

  return weekData;
}

// Extract section from summary text using regex
function extractSection(summaryText, sectionName) {
  // First try the original pattern
  const pattern = new RegExp(`${sectionName}[\\s\\S]*?(?=\\n=====|$)`, "i");
  const match = summaryText.match(pattern);
  if (match) {
    return match[0].trim();
  }

  // If no match, try a more specific pattern for sections that might be at the end
  const endPattern = new RegExp(`${sectionName}[\\s\\S]*`, "i");
  const endMatch = summaryText.match(endPattern);
  return endMatch ? endMatch[0].trim() : "";
}

// Extract tasks section with category breakdown
function extractTasksWithHours(taskSummary, calSummary, prsData) {
  // Extract tasks section from task summary
  const tasksSection = extractSection(taskSummary, "===== TASKS =====");
  if (!tasksSection) return "";

  // Extract summary section from cal summary for hours
  const calSummarySection = extractSection(calSummary, "===== SUMMARY =====");

  // Parse hours from cal summary
  const hoursMap = {};
  if (calSummarySection) {
    const lines = calSummarySection.split("\n");
    lines.forEach((line) => {
      const match = line.match(/([A-Za-z]+):\s*([\d.]+)\s*hours?\s*\((\d+)%\)/);
      if (match) {
        const category = match[1];
        const hours = match[2];
        const percent = match[3];
        hoursMap[category] = { hours, percent };
      }
    });
  }

  // Parse PRs data
  let prsCount = 0;
  let commitCount = 0;
  let prsList = [];
  if (prsData) {
    const prsLines = prsData.split("\n");
    prsLines.forEach((line, index) => {
      // Extract PR count from header like "1 shipped, 1 commits" or "1 shipped, 30 commits"
      const headerMatch = line.match(/(\d+)\s+shipped,\s*(\d+)\s+commits?/);
      if (headerMatch) {
        prsCount = parseInt(headerMatch[1]);
        commitCount = parseInt(headerMatch[2]);
      }
      // Extract PR titles (lines starting with •)
      if (line.trim().startsWith("•")) {
        prsList.push(line.trim());
      }
    });
    console.log(
      `PRs parsed: ${prsCount} PRs, ${commitCount} commits, ${prsList.length} PR titles`
    );
  }

  // Parse tasks and add hours
  const lines = tasksSection.split("\n");
  let result = "===== TASKS =====\n";
  let currentCategory = "";
  let currentTasks = [];
  let processedCategories = new Set();

  lines.forEach((line) => {
    if (line.trim() && !line.startsWith("•")) {
      // This is a category line - output previous category if exists
      if (currentCategory && currentTasks.length > 0) {
        // Add all tasks for the previous category
        currentTasks.forEach((task) => {
          result += `${task}\n`;
        });
        result += "\n"; // Add newline after all tasks for this category
      }

      const categoryMatch = line.match(/^([A-Za-z]+)\s*\((\d+)\)/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1];
        const taskCount = categoryMatch[2];
        const hours = hoursMap[currentCategory]?.hours || "0.0";
        const percent = hoursMap[currentCategory]?.percent || "0";
        const emoji = taskCount > 0 ? "✅" : "❌";
        processedCategories.add(currentCategory);

        // Special handling for Coding category - combine with PRs
        if (currentCategory === "Coding" && prsCount > 0) {
          result += `${emoji} ${currentCategory}: ${prsCount} PR shipped, ${commitCount} commits, ${hours} hours (${percent}%)\n`;
          // Add PRs immediately for Coding category
          prsList.forEach((pr) => {
            result += `${pr}\n`;
          });
          // Add extra newline after the last PR
          result += "\n";
        } else {
          result += `${emoji} ${currentCategory}: ${taskCount} tasks, ${hours} hours (${percent}%)\n`;
          // For non-Coding categories, we'll add tasks later, but we need to ensure
          // we have a newline after the category header for proper spacing
        }

        // Reset tasks for new category
        currentTasks = [];
      }
    } else if (line.startsWith("•")) {
      // This is a task line
      // For Coding category, show PRs instead of regular tasks
      if (currentCategory === "Coding" && prsList.length > 0) {
        // Don't add regular coding tasks, we'll add PRs instead
      } else {
        currentTasks.push(line);
      }
    }
  });

  // Handle the last category
  if (currentTasks.length > 0) {
    // Add remaining tasks for the last category
    currentTasks.forEach((task) => {
      result += `${task}\n`;
    });
    // Add newline after the last category's tasks
    result += "\n";
  }

  // Special case: If we have PRs but no Coding category was processed, add it
  if (prsCount > 0 && !processedCategories.has("Coding")) {
    const hours = hoursMap["Coding"]?.hours || "0.0";
    const percent = hoursMap["Coding"]?.percent || "0";
    result += `✅ Coding: ${prsCount} PR shipped, ${commitCount} commits, ${hours} hours (${percent}%)\n`;
    // Add PRs immediately for Coding category
    prsList.forEach((pr) => {
      result += `${pr}\n`;
    });
    result += "\n";
  }

  // Add final newline if we had any content
  if (currentCategory || prsCount > 0) {
    result += "\n";
  }

  return result.trim();
}

// Extract summary section for "what didn't go well"
function extractSummaryForBad(summaryText, hasPRs = false, prsCount = 0) {
  const summarySection = extractSection(summaryText, "===== SUMMARY =====");
  if (!summarySection) return "";

  const lines = summarySection.split("\n");
  let result = "===== SUMMARY =====\n";

  lines.forEach((line) => {
    if (line.includes("❌")) {
      // For Coding category: only skip if there are actual PRs shipped
      if (line.includes("Coding:")) {
        if (prsCount > 0) {
          // Skip if there are PRs (it's shown in TASKS section)
          return;
        } else {
          // Show as "0 PRs" instead of "0 tasks"
          result += line.replace("0 tasks", "0 PRs") + "\n";
          return;
        }
      }
      result += `${line}\n`;
    }
  });

  return result.trim();
}

// Combine summaries into "what went well" and "what didn't go well"
function combineSummaries(taskSummary, calSummary) {
  const goodItems = [];
  const badItems = [];

  // Extract sections for "what went well"

  // 1. EVENTS from task summary
  const eventsSection = extractSection(taskSummary, "===== EVENTS =====");
  if (eventsSection) {
    goodItems.push(eventsSection);
  }

  // 2. ROCKS from task summary - separate good and bad
  const rocksSection = extractSection(taskSummary, "===== ROCKS =====");
  if (rocksSection) {
    const lines = rocksSection.split("\n");
    const goodRocks = [];
    const badRocks = [];

    lines.forEach((line) => {
      if (line.includes("👾 Made progress") || line.includes("✅ Went well")) {
        goodRocks.push(line);
      } else if (
        line.includes("🥊 Went bad") ||
        line.includes("🚧 Didn't go so well")
      ) {
        badRocks.push(line);
      }
    });

    // Add good rocks to good items
    if (goodRocks.length > 0) {
      goodItems.push("===== ROCKS =====\n" + goodRocks.join("\n"));
    }

    // Add bad rocks to bad items
    if (badRocks.length > 0) {
      badItems.push("===== ROCKS =====\n" + badRocks.join("\n"));
    }
  }

  // 3. PRs from cal summary - will be combined with Coding tasks
  const prsSection = extractSection(calSummary, "===== PRs =====");
  let prsData = "";
  let prsCount = 0;
  if (prsSection) {
    prsData = prsSection;
    console.log("Found PRs section:", prsSection.substring(0, 100) + "...");

    // Extract PR count from header like "1 shipped, 1 commits" or "1 shipped, 30 commits"
    const prsLines = prsSection.split("\n");
    prsLines.forEach((line) => {
      const headerMatch = line.match(/(\d+)\s+shipped,\s*(\d+)\s+commits?/);
      if (headerMatch) {
        prsCount = parseInt(headerMatch[1]);
      }
    });
  } else {
    console.log("No PRs section found in cal summary");
  }

  // 4. TASKS with hours (combined from both summaries)
  const tasksWithHours = extractTasksWithHours(
    taskSummary,
    calSummary,
    prsData
  );
  if (tasksWithHours) {
    goodItems.push(tasksWithHours);
  }

  // Extract sections for "what didn't go well"

  // 1. Summary items with ❌ or ☑️
  const badSummary = extractSummaryForBad(
    taskSummary,
    prsData.length > 0,
    prsCount
  );
  if (badSummary) {
    badItems.push(badSummary);
  }

  return {
    good: goodItems,
    bad: badItems,
  };
}

// Update Notion with parsed summaries
async function updateNotionSummary(pageId, goodItems, badItems) {
  const properties = {
    "Work - What went well?": {
      rich_text: [
        {
          text: { content: goodItems.join("\n\n") },
        },
      ],
    },
    "Work - What didn't go so well?": {
      rich_text: [
        {
          text: { content: badItems.join("\n\n") },
        },
      ],
    },
  };

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
}

async function processSummary(weekNumber) {
  try {
    console.log(`\n📥 Fetching Week ${weekNumber} data...`);

    // Fetch the week data
    const weekData = await fetchWeekData(weekNumber);
    console.log(`✅ Found Week ${weekNumber} data!`);

    // Combine summaries
    console.log("📊 Combining summaries...");
    const combined = combineSummaries(
      weekData.workTaskSummary,
      weekData.workCalSummary
    );

    console.log(`   Good items: ${combined.good.length}`);
    console.log(`   Bad items: ${combined.bad.length}`);

    // Show preview
    console.log("\n📄 Summary Preview:");
    console.log("================");
    console.log("What went well:");
    combined.good.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.split("\n")[0]}...`);
    });
    console.log("\nWhat didn't go well:");
    combined.bad.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item}`);
    });

    // Update Notion
    console.log("\n📝 Updating Notion...");
    await updateNotionSummary(weekData.id, combined.good, combined.bad);
    console.log(`✅ Successfully updated Week ${weekNumber} summary!`);
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    console.error(error.stack);
  }
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);
  let targetWeeks = [TARGET_WEEK]; // default

  // Check for --week or --weeks argument
  const weekIndex =
    args.indexOf("--week") !== -1
      ? args.indexOf("--week")
      : args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    targetWeeks = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  // If no args, run interactive mode
  if (args.length === 0) {
    targetWeeks = await runInteractiveMode();
  }

  // Run the summary generation for each week
  console.log(
    `\n🚀 Processing ${targetWeeks.length} week${
      targetWeeks.length > 1 ? "s" : ""
    }...\n`
  );

  for (let i = 0; i < targetWeeks.length; i++) {
    const week = targetWeeks[i];
    console.log(`📍 [${i + 1}/${targetWeeks.length}] Starting Week ${week}...`);
    await processSummary(week);

    // Add a separator between weeks (except for the last one)
    if (i < targetWeeks.length - 1) {
      console.log("\n" + "=".repeat(50) + "\n");
    }
  }

  console.log(
    `\n🎉 All ${targetWeeks.length} week${
      targetWeeks.length > 1 ? "s" : ""
    } completed!`
  );

  // Explicitly exit the process to ensure clean shutdown
  process.exit(0);
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
