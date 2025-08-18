const { spawn } = require("child_process");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

console.log(
  "🧩 Personal Week Orchestrator (Pull → Summarize → Retro → Overview)"
);

// Default: operate on a single week
const DEFAULT_WEEK = 1;

// Timeouts (ms) per phase; adjust via env if needed
const TIMEOUTS = {
  pull: parseInt(process.env.ORCH_TIMEOUT_PULL || "600000"), // 10 min
  summarize: parseInt(process.env.ORCH_TIMEOUT_SUMMARIZE || "480000"), // 8 min
  retro: parseInt(process.env.ORCH_TIMEOUT_RETRO || "420000"), // 7 min
  recap: parseInt(process.env.ORCH_TIMEOUT_RECAP || "300000"), // 5 min
};

function runScriptWithTimeout(scriptPath, args, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n${"=".repeat(50)}`);
    console.log(`▶️  ${label}`);
    console.log("=".repeat(50));

    const child = spawn("node", [scriptPath, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
    });

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      console.error(
        `\n⏱️  Timeout after ${Math.round(timeoutMs / 1000)}s: ${label}`
      );
      // Try graceful first
      child.kill("SIGTERM");
      // Force kill if it doesn't exit promptly
      setTimeout(() => child.kill("SIGKILL"), 5000);
      finished = true;
      reject(new Error(`Timeout: ${label}`));
    }, timeoutMs);

    child.on("close", (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (code === 0) {
        console.log(`✅ ${label} finished`);
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  try {
    // Ask for single week
    console.log(`\n📌 Default week: ${DEFAULT_WEEK}\n`);
    const weekInput = await askQuestion(
      "? Which week to process? (single number): "
    );
    const targetWeek = weekInput.trim()
      ? parseInt(weekInput.trim())
      : DEFAULT_WEEK;
    if (isNaN(targetWeek) || targetWeek <= 0) {
      console.error("❌ Invalid week number");
      rl.close();
      process.exit(1);
    }

    console.log(`\n📊 This will run ALL steps for Week ${targetWeek}:`);
    console.log("   1) Pull data");
    console.log("   2) Summarize data (tasks + cal)");
    console.log("   3) Generate recaps (good + bad)");
    console.log("   4) Build combined overview");
    const confirm = await askQuestion("Continue? (y/n): ");
    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      rl.close();
      process.exit(0);
    }
    rl.close();

    const weekArg = ["--weeks", String(targetWeek)];

    // 1) Pull data (fail-fast)
    await runScriptWithTimeout(
      "1-pull-data-personal.js",
      [...weekArg, "--fail-fast"],
      TIMEOUTS.pull,
      `Pull data for Week ${targetWeek}`
    );

    // 2) Summarize (both summaries by default)
    await runScriptWithTimeout(
      "2-summarize-data-personal.js",
      weekArg,
      TIMEOUTS.summarize,
      `Summarize (tasks + cal) for Week ${targetWeek}`
    );

    // 3) Retro (both good + bad by default)
    await runScriptWithTimeout(
      "3-retro-data-personal.js",
      weekArg,
      TIMEOUTS.retro,
      `Generate recaps (good + bad) for Week ${targetWeek}`
    );

    // 4) Combined overview
    await runScriptWithTimeout(
      "4-recap-data-personal.js",
      weekArg,
      TIMEOUTS.recap,
      `Build combined overview for Week ${targetWeek}`
    );

    console.log("\n" + "=".repeat(50));
    console.log(`🎉 Finished all steps for Week ${targetWeek}`);
    console.log("=".repeat(50));
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Orchestration failed: ${err.message}`);
    process.exit(1);
  }
}

main();
