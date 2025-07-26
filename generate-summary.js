const { Client } = require("@notionhq/client");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default week (will be overridden by user input)
let TARGET_WEEK = 1;

console.log("📊 Work Summary Generator (Parsing Only)");

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

// Parse evaluation section from summary text
function parseEvaluationSection(summaryText) {
  if (!summaryText.includes("===== EVALUATION =====")) {
    return [];
  }

  const evaluationSection = summaryText.split("===== EVALUATION =====")[1];
  if (!evaluationSection) {
    return [];
  }

  const lines = evaluationSection.split("\n");
  const evaluations = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.startsWith("✅") ||
      trimmedLine.startsWith("❌") ||
      trimmedLine.startsWith("⚠️") ||
      trimmedLine.startsWith("🏝️")
    ) {
      evaluations.push({
        type: trimmedLine.startsWith("✅") ? "good" : "bad",
        text: trimmedLine.substring(2).trim(), // Remove the emoji and space
        rawLine: trimmedLine,
      });
    }
    // Also capture bullet points under main items (for meetings, PRs, etc.)
    else if (trimmedLine.startsWith("•") && evaluations.length > 0) {
      const lastEval = evaluations[evaluations.length - 1];
      if (!lastEval.bullets) {
        lastEval.bullets = [];
      }
      lastEval.bullets.push(trimmedLine.substring(1).trim()); // Remove bullet and space
    }
  }

  return evaluations;
}

// Extract specific care-abouts from evaluations
function extractCareAbouts(taskEvals, calEvals) {
  const careAbouts = {
    good: [],
    bad: [],
  };

  // 1. Rock status (from tasks) - TOP PRIORITY
  const rockEvals = taskEvals.filter(
    (e) =>
      e.text.includes("ROCK ACHIEVED") ||
      e.text.includes("ROCK PROGRESS") ||
      e.text.includes("ROCK FAILED") ||
      e.text.includes("ROCK LITTLE PROGRESS")
  );
  rockEvals.forEach((rock) => {
    if (rock.type === "good") {
      careAbouts.good.push(rock.text);
    } else {
      careAbouts.bad.push(rock.text);
    }
  });

  // 2. OOO Days (from cal) - HIGH PRIORITY
  const oooEval = calEvals.find((e) => e.text.includes("OOO:"));
  let oooDays = 0;
  if (oooEval) {
    // Extract the number of days from the OOO text
    const dayMatch = oooEval.text.match(/OOO: (\d+) Days?/);
    if (dayMatch) {
      oooDays = parseInt(dayMatch[1]);
      if (oooDays === 1) {
        // 1 day OOO goes in "what went well" at the top
        careAbouts.good.unshift(oooEval.text);
      } else {
        // Multiple days OOO goes in both columns at the top
        careAbouts.good.unshift(oooEval.text);
        careAbouts.bad.unshift(oooEval.text);
      }
    }
  }

  // 3. Design Tasks (from tasks)
  const designTaskEval = taskEvals.find(
    (e) => e.text.includes("DESIGN TASKS") || e.text.includes("NO DESIGN TASKS")
  );
  if (designTaskEval) {
    if (designTaskEval.type === "good") {
      careAbouts.good.push(designTaskEval.text);
    } else {
      careAbouts.bad.push(designTaskEval.text);
    }
  }

  // 4. Misc Meetings (from cal) - ALL meetings, not just first 5
  const meetingEval = calEvals.find((e) => e.text.includes("MEETINGS"));
  if (meetingEval && meetingEval.type === "good" && meetingEval.bullets) {
    // Clean meeting names by removing durations and time information
    const cleanMeetingBullets = meetingEval.bullets.map((bullet) => {
      return bullet
        .replace(/\s*\(\d+(?:\.\d+)?\s*hours?\)\s*$/, "") // Remove (X hours) at end
        .replace(/\s*\(\d+(?:\.\d+)?\s*minutes?\)\s*$/, "") // Remove (X minutes) at end
        .replace(/\s*\(\d+:\d+(?::\d+)?\)\s*$/, "") // Remove (HH:MM:SS) at end
        .replace(/\s*\(\d+:\d+\)\s*$/, "") // Remove (HH:MM) at end
        .replace(/\s*\(\d+(?:\.\d+)?\s*h\)\s*$/, "") // Remove (Xh) at end
        .replace(/\s*\(\d+(?:\.\d+)?\s*m\)\s*$/, "") // Remove (Xm) at end
        .trim();
    });
    careAbouts.good.push(
      `Misc meetings:\n${cleanMeetingBullets.map((b) => `  • ${b}`).join("\n")}`
    );
  }

  // 5. Other task categories (from tasks)
  const otherTaskCategories = ["QA TASKS", "RESEARCH TASKS", "FEEDBACK TASKS"];

  otherTaskCategories.forEach((category) => {
    const taskEval = taskEvals.find(
      (e) => e.text.includes(category) || e.text.includes(`NO ${category}`)
    );
    if (taskEval) {
      if (taskEval.type === "good") {
        careAbouts.good.push(taskEval.text);
      } else {
        careAbouts.bad.push(taskEval.text);
      }
    }
  });

  // 6. PRs shipped (from cal) - LAST
  const prEval = calEvals.find((e) => e.text.includes("PRs SHIPPED"));
  if (prEval) {
    if (prEval.type === "good" && prEval.bullets) {
      // Clean PR titles by removing hash numbers and fix double colons
      const cleanPRBullets = prEval.bullets.map((bullet) => {
        return bullet.replace(/\s*\(#\d+\)\s*$/, "").trim();
      });

      // Fix the text to remove double colons
      const cleanText = prEval.text.replace(/::+$/, ":");

      careAbouts.good.push(
        `${cleanText}\n${cleanPRBullets.map((b) => `  • ${b}`).join("\n")}`
      );
    } else if (prEval.type === "bad") {
      careAbouts.bad.push(prEval.text);
    }
  }

  // 7. OOO Cleanup - If 5+ days OOO, remove all bad items except OOO itself
  if (oooDays >= 5) {
    // Keep only the OOO entry in bad items
    const oooBadItem = careAbouts.bad.find((item) => item.includes("OOO:"));
    careAbouts.bad = oooBadItem ? [oooBadItem] : [];
  }

  return careAbouts;
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

    // Parse evaluation sections
    console.log("📊 Parsing evaluation sections...");
    const taskEvaluations = parseEvaluationSection(weekData.workTaskSummary);
    const calEvaluations = parseEvaluationSection(weekData.workCalSummary);

    console.log(`   Task evaluations found: ${taskEvaluations.length}`);
    console.log(`   Calendar evaluations found: ${calEvaluations.length}`);

    // Extract care-abouts
    console.log("🎯 Extracting care-abouts...");
    const careAbouts = extractCareAbouts(taskEvaluations, calEvaluations);

    console.log(`   Good items: ${careAbouts.good.length}`);
    console.log(`   Bad items: ${careAbouts.bad.length}`);

    // Show preview
    console.log("\n📄 Summary Preview:");
    console.log("================");
    console.log("What went well:");
    careAbouts.good.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.split("\n")[0]}...`);
    });
    console.log("\nWhat didn't go well:");
    careAbouts.bad.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item}`);
    });

    // Update Notion
    console.log("\n📝 Updating Notion...");
    await updateNotionSummary(weekData.id, careAbouts.good, careAbouts.bad);
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
