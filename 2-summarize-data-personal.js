const { spawn } = require("child_process");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

console.log("📊 Personal Data Summarizer");
console.log("🔄 Generates AI summaries from pulled data\n");

// Default configuration
const DEFAULT_TARGET_WEEKS = [1];
let TARGET_WEEKS = DEFAULT_TARGET_WEEKS;
let SELECTED_SUMMARIES = "both"; // both, task-summary, cal-summary

// Interactive mode function
async function runInteractiveMode() {
  // First, choose data sources
  console.log("📊 What summaries would you like to generate?\n");
  console.log("1. Both (Personal Task Summary + Personal Cal Summary)");
  console.log("2. Personal Task Summary only");
  console.log("3. Personal Cal Summary only");

  const summaryInput = await askQuestion("\n? Choose option (1-3): ");

  switch (summaryInput.trim()) {
    case "1":
      SELECTED_SUMMARIES = "both";
      console.log("✅ Selected: Both summaries");
      break;
    case "2":
      SELECTED_SUMMARIES = "task-summary";
      console.log("✅ Selected: Personal Task Summary only");
      break;
    case "3":
      SELECTED_SUMMARIES = "cal-summary";
      console.log("✅ Selected: Personal Cal Summary only");
      break;
    default:
      SELECTED_SUMMARIES = "both";
      console.log("✅ Selected: Both summaries (default)");
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
  console.log(`📊 Summaries to generate: ${SELECTED_SUMMARIES}`);
  const confirm = await askQuestion("Continue? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  return { weeks: TARGET_WEEKS, summaries: SELECTED_SUMMARIES };
}

// Function to run a script and wait for completion
function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running ${scriptName}...`);

    // Determine the working directory for the script
    let scriptCwd = process.cwd();
    let scriptPath = scriptName;

    if (scriptName.startsWith("scripts/")) {
      // For scripts in subdirectories, change to the script's directory
      const scriptDir = scriptName.substring(0, scriptName.lastIndexOf("/"));
      scriptCwd = scriptDir;
      // Use just the filename when changing directory
      scriptPath = scriptName.substring(scriptName.lastIndexOf("/") + 1);
    }

    const child = spawn("node", [scriptPath, ...args], {
      stdio: "inherit", // This will show the output in real-time
      cwd: scriptCwd, // Use the script's directory as working directory
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully`);
        resolve();
      } else {
        console.error(`❌ ${scriptName} failed with exit code ${code}`);
        reject(new Error(`${scriptName} failed`));
      }
    });

    child.on("error", (error) => {
      console.error(`❌ Failed to start ${scriptName}:`, error);
      reject(error);
    });
  });
}

// Main processing function
async function processPersonalSummaries() {
  try {
    console.log(
      `\n📊 Generating ${SELECTED_SUMMARIES} for week${
        TARGET_WEEKS.length > 1 ? "s" : ""
      }: ${TARGET_WEEKS.join(", ")}`
    );

    // Convert weeks to command line args
    const weekArgs = ["--weeks", TARGET_WEEKS.join(",")];

    if (
      SELECTED_SUMMARIES === "both" ||
      SELECTED_SUMMARIES === "task-summary"
    ) {
      // Run Personal Task Summary
      console.log("\n" + "=".repeat(50));
      console.log("📍 Personal Task Summary Generation");
      console.log("=".repeat(50));
      await runScript(
        "scripts/summarize-data/summarize-personal-tasks.js",
        weekArgs
      );
    }

    if (SELECTED_SUMMARIES === "both" || SELECTED_SUMMARIES === "cal-summary") {
      // Run Personal Cal Summary
      console.log("\n" + "=".repeat(50));
      console.log("📍 Personal Cal Summary Generation");
      console.log("=".repeat(50));
      await runScript(
        "scripts/summarize-data/summarize-personal-cal.js",
        weekArgs
      );
    }

    console.log("\n" + "=".repeat(50));
    console.log(
      `🎉 Personal summary generation complete for week${
        TARGET_WEEKS.length > 1 ? "s" : ""
      }: ${TARGET_WEEKS.join(", ")}`
    );
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Error during summary generation:", error.message);
    process.exit(1);
  }
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);

  // Check for --2, --3, etc. format first (quick single week)
  for (const arg of args) {
    if (arg.startsWith("--") && !isNaN(parseInt(arg.slice(2)))) {
      const weekNumber = parseInt(arg.slice(2));
      TARGET_WEEKS = [weekNumber];
      SELECTED_SUMMARIES = "both"; // Default to both for quick mode
      await processPersonalSummaries();
      process.exit(0);
    }
  }

  // Check for --weeks argument
  const weekIndex = args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    TARGET_WEEKS = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));

    // Check for --task-summary or --cal-summary flags
    if (args.includes("--task-summary")) {
      SELECTED_SUMMARIES = "task-summary";
    } else if (args.includes("--cal-summary")) {
      SELECTED_SUMMARIES = "cal-summary";
    } else {
      SELECTED_SUMMARIES = "both";
    }

    await processPersonalSummaries();
  } else if (args.length === 0) {
    // No args, run interactive mode
    const result = await runInteractiveMode();
    TARGET_WEEKS = result.weeks;
    SELECTED_SUMMARIES = result.summaries;
    await processPersonalSummaries();
  }

  // Ensure clean exit
  process.exit(0);
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
