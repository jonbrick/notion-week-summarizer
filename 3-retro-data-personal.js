const { Client } = require("@notionhq/client");
const { spawn } = require("child_process");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default configuration
const DEFAULT_TARGET_WEEKS = [1];
let TARGET_WEEKS = DEFAULT_TARGET_WEEKS;
let SELECTED_RECAPS = "both"; // both, good-only, bad-only

console.log("📊 Personal Week Recap Generator");

/**
 * Interactive mode to get week selection
 */
async function runInteractiveMode() {
  // First, choose what to generate
  console.log("\n📊 What recaps would you like to generate?\n");
  console.log("1. Both (Good + Bad)");
  console.log("2. Good only (What went well)");
  console.log("3. Bad only (What didn't go so well)");

  const recapInput = await askQuestion("\n? Choose option (1-3): ");

  switch (recapInput.trim()) {
    case "1":
      SELECTED_RECAPS = "both";
      console.log("✅ Selected: Both recaps");
      break;
    case "2":
      SELECTED_RECAPS = "good-only";
      console.log("✅ Selected: Good recap only");
      break;
    case "3":
      SELECTED_RECAPS = "bad-only";
      console.log("✅ Selected: Bad recap only");
      break;
    default:
      SELECTED_RECAPS = "both";
      console.log("✅ Selected: Both recaps (default)");
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
  console.log(`📊 Recaps to generate: ${SELECTED_RECAPS}`);
  const confirm = await askQuestion("Continue? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  return { weeks: TARGET_WEEKS, recaps: SELECTED_RECAPS };
}

/**
 * Run a child script and capture its output
 */
function runChildScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      cwd: process.cwd(),
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      // Don't show real-time output - we'll capture it silently
    });

    child.stderr.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      // Only show errors
      if (output.includes("Error") || output.includes("❌")) {
        process.stderr.write(output);
      }
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Script failed with exit code ${code}: ${stderr}`));
      }
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

/**
 * Extract the formatted content from script output
 */
function extractFormattedContent(output, startMarker, endMarker) {
  const startIndex = output.indexOf(startMarker);
  if (startIndex === -1) {
    // If exact marker not found, try to find the content between separators
    const lines = output.split("\n");
    let capturing = false;
    let content = [];

    for (const line of lines) {
      if (
        line.includes("Good Items Extracted:") ||
        line.includes("Bad Items Extracted:")
      ) {
        capturing = true;
        continue;
      }
      if (capturing && line.includes("=".repeat(50))) {
        if (content.length > 0) {
          // We've hit the end separator
          break;
        }
        // Skip the first separator after the marker
        continue;
      }
      if (capturing) {
        content.push(line);
      }
    }

    return content.join("\n").trim();
  }

  const endIndex = output.indexOf(endMarker, startIndex + startMarker.length);

  if (endIndex !== -1) {
    const content = output
      .substring(startIndex + startMarker.length, endIndex)
      .trim();
    return content;
  }

  // If no end marker, take everything after start marker
  return output.substring(startIndex + startMarker.length).trim();
}

/**
 * Process a single week
 */
async function processWeek(weekNumber) {
  try {
    const paddedWeek = weekNumber.toString().padStart(2, "0");
    console.log(`\n${"=".repeat(50)}`);
    console.log(`📅 Processing Week ${paddedWeek} Recap`);
    console.log(`${"=".repeat(50)}`);

    // Run recap-personal-good.js if needed
    let goodItems = "";
    if (SELECTED_RECAPS === "both" || SELECTED_RECAPS === "good-only") {
      try {
        console.log("📝 Generating Good Recap...");
        const goodOutput = await runChildScript(
          "scripts/retro-data/retro-personal-good.js",
          ["--week", weekNumber.toString()]
        );

        // Extract the formatted good items from the output
        goodItems = extractFormattedContent(
          goodOutput,
          "✅ Good Items Extracted:\n" + "=".repeat(50) + "\n",
          "\n" + "=".repeat(50)
        );

        // If extraction failed, try to get the raw output
        if (!goodItems && goodOutput.trim()) {
          goodItems = goodOutput.trim();
        }
      } catch (error) {
        console.error(`⚠️ Error running good items script: ${error.message}`);
      }
    }

    // Run recap-personal-bad.js if needed
    let badItems = "";
    if (SELECTED_RECAPS === "both" || SELECTED_RECAPS === "bad-only") {
      try {
        console.log("📝 Generating Bad Recap...");
        const badOutput = await runChildScript(
          "scripts/retro-data/retro-personal-bad.js",
          ["--week", weekNumber.toString()]
        );

        badItems = extractFormattedContent(
          badOutput,
          "❌ Bad Items Extracted:\n" + "=".repeat(50) + "\n",
          "\n" + "=".repeat(50)
        );

        // If extraction failed, try to get the raw output
        if (!badItems && badOutput.trim()) {
          badItems = badOutput.trim();
        }
      } catch (error) {
        console.error(`⚠️ Error running bad items script: ${error.message}`);
      }
    }

    // Update Notion with the results
    if (goodItems || badItems) {
      // Reclassify "Good body weight (0 avg body weight)" from good to not great
      try {
        if (goodItems && goodItems.trim().length > 0) {
          const goodLines = goodItems.split("\n");
          let removedBodyWeightZero = false;
          const filteredGoodLines = goodLines.filter((line) => {
            const normalized = line.trim();
            const isTarget =
              /^✅\s*⚖️\s*Good body weight\s*\(0 avg body weight\)\s*$/u.test(
                normalized
              );
            if (isTarget) removedBodyWeightZero = true;
            return !isTarget;
          });

          if (removedBodyWeightZero) {
            goodItems = filteredGoodLines.join("\n").trim();
            const notGreatLine =
              "⚠️ ⚖️ Not great body weight (0 avg body weight)";
            badItems =
              badItems && badItems.trim().length > 0
                ? `${badItems.trim()}\n${notGreatLine}`
                : notGreatLine;
          }
        }
      } catch (_) {
        // If anything goes wrong, proceed without blocking the recap
      }
      await updateNotionRecap(weekNumber, goodItems, badItems);
      console.log(`✅ Successfully updated Week ${paddedWeek} recap!`);
    } else {
      console.log(`⚠️ No items extracted for Week ${paddedWeek}`);
    }
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
}

/**
 * Update Notion with the recap results
 */
async function updateNotionRecap(weekNumber, goodItems, badItems) {
  const paddedWeek = weekNumber.toString().padStart(2, "0");

  // Find the week recap page
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
    throw new Error(`Week ${weekNumber} Recap not found in Notion`);
  }

  const pageId = response.results[0].id;

  console.log("\n📝 Updating Notion with recap...");

  const properties = {};

  if (goodItems) {
    properties["Personal - What went well?"] = {
      rich_text: [
        {
          text: {
            content: goodItems.substring(0, 2000), // Notion limit
          },
        },
      ],
    };
  }

  if (badItems) {
    properties["Personal - What didn't go so well?"] = {
      rich_text: [
        {
          text: {
            content: badItems.substring(0, 2000), // Notion limit
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

/**
 * Process all selected weeks
 */
async function processAllWeeks() {
  console.log(
    `\n📊 Generating ${SELECTED_RECAPS} recap${
      SELECTED_RECAPS !== "both" ? "" : "s"
    } for week${TARGET_WEEKS.length > 1 ? "s" : ""}: ${TARGET_WEEKS.join(", ")}`
  );

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log("\n" + "=".repeat(50));
  console.log(
    `🎉 Personal recap generation complete for week${
      TARGET_WEEKS.length > 1 ? "s" : ""
    }: ${TARGET_WEEKS.join(", ")}`
  );
  console.log("=".repeat(50));
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for --weeks argument with optional --good-only or --bad-only
  const weekIndex = args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    TARGET_WEEKS = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));

    // Check for --good-only or --bad-only flags
    if (args.includes("--good-only")) {
      SELECTED_RECAPS = "good-only";
    } else if (args.includes("--bad-only")) {
      SELECTED_RECAPS = "bad-only";
    } else {
      SELECTED_RECAPS = "both";
    }

    await processAllWeeks();
  }
  // Check for quick single week format (--2, --3, etc.)
  else {
    for (const arg of args) {
      if (arg.startsWith("--") && !isNaN(parseInt(arg.slice(2)))) {
        const weekNumber = parseInt(arg.slice(2));
        TARGET_WEEKS = [weekNumber];
        SELECTED_RECAPS = "both"; // Default to both for quick mode
        await processAllWeeks();
        process.exit(0);
      }
    }

    // No args provided, run interactive mode
    if (args.length === 0) {
      const result = await runInteractiveMode();
      TARGET_WEEKS = result.weeks;
      SELECTED_RECAPS = result.recaps;
      await processAllWeeks();
    }
  }

  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
