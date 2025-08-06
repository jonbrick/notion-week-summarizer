const { spawn } = require("child_process");
const { askQuestion, rl } = require("./src/utils/cli-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
require("dotenv").config();

console.log("📅 Personal Week Processor");
console.log(
  "🔄 Runs Personal Calendar Pull + Personal Task Pull + Personal Habits Pull\n"
);

// Default weeks
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Interactive mode function
async function runInteractiveMode() {
  console.log("📋 This will run:");
  console.log("  • Personal Calendar Pull");
  console.log("  • Personal Task Pull");
  console.log("  • Personal Habits Pull");

  // Ask for weeks
  const weekInput = await askQuestion(
    "\n? Which weeks to process? (comma-separated, e.g., 26,27,28): "
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
  return TARGET_WEEKS;
}

// Function to run a script and wait for completion
function runScript(scriptName, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running ${scriptName}...`);

    const child = spawn("node", [scriptName, ...args], {
      stdio: "inherit", // This will show the output in real-time
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
async function processPersonalWeek() {
  try {
    console.log(
      `\n📅 Processing ${TARGET_WEEKS.length} personal week${
        TARGET_WEEKS.length > 1 ? "s" : ""
      }...\n`
    );

    // Convert weeks to command line args
    const weekArgs = ["--weeks", TARGET_WEEKS.join(",")];

    // Run Personal Calendar Pull
    console.log("=".repeat(50));
    console.log("📍 STEP 1: Personal Calendar Pull");
    console.log("=".repeat(50));
    await runScript("personal-cal-pull.js", [...weekArgs, "--both"]);

    // Run Personal Task Pull
    console.log("\n" + "=".repeat(50));
    console.log("📍 STEP 2: Personal Task Pull");
    console.log("=".repeat(50));
    await runScript("personal-tasks-pull.js", weekArgs);

    // Run Personal Habits Pull
    console.log("\n" + "=".repeat(50));
    console.log("📍 STEP 3: Personal Habits Pull");
    console.log("=".repeat(50));
    await runScript("personal-habits-pull.js", weekArgs);

    console.log("\n" + "=".repeat(50));
    console.log(
      `🎉 Personal week processing complete for week${
        TARGET_WEEKS.length > 1 ? "s" : ""
      }: ${TARGET_WEEKS.join(", ")}`
    );
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Error during personal week processing:", error.message);
    process.exit(1);
  }
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);

  // Check for --weeks argument
  const weekIndex = args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    TARGET_WEEKS = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  } else if (args.length === 0) {
    // No args, run interactive mode
    TARGET_WEEKS = await runInteractiveMode();
  }

  await processPersonalWeek();

  // Ensure clean exit
  process.exit(0);
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
