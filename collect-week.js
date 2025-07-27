const { spawn } = require("child_process");
const { askQuestion, rl } = require("./src/utils/cli-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
require("dotenv").config();

console.log("📅 Week Data Collector");
console.log("🔄 Runs both Personal + Work data collection\n");

// Default weeks
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Interactive mode function
async function runInteractiveMode() {
  console.log("📋 This will run both:");
  console.log("  • Personal Calendar Pull + Personal Task Pull");
  console.log("  • Work Calendar Pull + Work Task Pull");

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
async function processWeek() {
  try {
    console.log(
      `\n📅 Processing ${TARGET_WEEKS.length} week${
        TARGET_WEEKS.length > 1 ? "s" : ""
      }...\n`
    );

    // Convert weeks to command line args
    const weekArgs = ["--weeks", TARGET_WEEKS.join(",")];

    // Run Personal Collection
    console.log("=".repeat(50));
    console.log("📍 STEP 1: Personal Data Collection");
    console.log("=".repeat(50));
    await runScript("collect-personal.js", weekArgs);

    // Run Work Collection
    console.log("\n" + "=".repeat(50));
    console.log("📍 STEP 2: Work Data Collection");
    console.log("=".repeat(50));
    await runScript("collect-work.js", weekArgs);

    console.log("\n" + "=".repeat(50));
    console.log(
      `🎉 Week data collection complete for week${
        TARGET_WEEKS.length > 1 ? "s" : ""
      }: ${TARGET_WEEKS.join(", ")}`
    );
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\n❌ Error during week processing:", error.message);
    process.exit(1);
  }
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);

  // Check for --2, --3, etc. format first
  for (const arg of args) {
    if (arg.startsWith("--") && !isNaN(parseInt(arg.slice(2)))) {
      const weekNumber = parseInt(arg.slice(2));
      TARGET_WEEKS = [weekNumber];
      await processWeek();
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
  } else if (args.length === 0) {
    // No args, run interactive mode
    TARGET_WEEKS = await runInteractiveMode();
  }

  await processWeek();

  // Ensure clean exit
  process.exit(0);
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
