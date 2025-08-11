const { spawn } = require("child_process");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

console.log("📊 Week Summary Generator (Personal + Work)");

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n🎯 Week Summary Generator");

  // Ask for weeks
  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );
  let targetWeeks = [1]; // default
  if (weekInput.trim()) {
    targetWeeks = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(
    `\n📊 Generating summaries for Week${
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

// Run a script with given arguments
function runScript(scriptName, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running ${scriptName}...`);

    const child = spawn("node", [scriptName, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    child.on("close", (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully`);
        resolve();
      } else {
        console.error(`❌ ${scriptName} failed with code ${code}`);
        reject(new Error(`${scriptName} failed with code ${code}`));
      }
    });

    child.on("error", (error) => {
      console.error(`❌ Error running ${scriptName}:`, error.message);
      reject(error);
    });
  });
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);
  let targetWeeks = [1]; // default

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

    try {
      // Run personal summary
      await runScript("summarize-personal.js", [`--weeks`, week.toString()]);

      // Run work summary
      await runScript("summarize-work.js", [`--weeks`, week.toString()]);

      console.log(`✅ Week ${week} completed successfully!`);
    } catch (error) {
      console.error(`❌ Error processing Week ${week}:`, error.message);
      // Continue with next week instead of exiting
    }

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
