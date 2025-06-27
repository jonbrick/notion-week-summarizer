const readline = require("readline");

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Check if running in interactive mode (no command line args)
async function checkInteractiveMode(
  args,
  allCategories,
  defaultTargetWeeks,
  defaultActiveCategories
) {
  // If command line args are provided, parse them
  if (
    args.includes("--weeks") ||
    args.includes("--categories") ||
    args.includes("--dry-run")
  ) {
    // Command line mode
    const weeksIndex = args.indexOf("--weeks");
    const categoriesIndex = args.indexOf("--categories");

    let targetWeeks = [...defaultTargetWeeks];
    let activeCategories = [...defaultActiveCategories];
    let dryRun = false;

    if (weeksIndex !== -1 && args[weeksIndex + 1]) {
      targetWeeks = args[weeksIndex + 1].split(",").map((w) => parseInt(w));
    }

    if (categoriesIndex !== -1 && args[categoriesIndex + 1]) {
      const catIndices = args[categoriesIndex + 1]
        .split(",")
        .map((c) => parseInt(c));
      if (catIndices.includes(0)) {
        activeCategories = allCategories.map((cat) => cat.notionValue);
      } else {
        activeCategories = catIndices
          .map((idx) => allCategories[idx - 1]?.notionValue)
          .filter(Boolean);
      }
    }

    if (args.includes("--dry-run")) {
      dryRun = true;
    }

    return {
      isInteractive: false,
      targetWeeks,
      activeCategories,
      dryRun,
    };
  }

  // No command line args, run interactive mode
  return {
    isInteractive: true,
    targetWeeks: [...defaultTargetWeeks],
    activeCategories: [...defaultActiveCategories],
    dryRun: false,
  };
}

async function runInteractiveMode(
  allCategories,
  defaultTargetWeeks,
  defaultActiveCategories,
  scriptName
) {
  console.log(`\n${scriptName}`);

  // Format default categories display
  let categoriesDisplay = "";
  if (defaultActiveCategories.length === 6) {
    categoriesDisplay = "All categories";
  } else {
    // Show emoji icons for active categories
    categoriesDisplay = defaultActiveCategories
      .map((cat) => cat.split(" ")[0])
      .join(" ");
  }

  console.log(
    `📌 Defaults: Week ${defaultTargetWeeks.join(",")} | ${categoriesDisplay}\n`
  );

  // Ask for weeks
  const weeksInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 1,2,3): "
  );
  let targetWeeks = [...defaultTargetWeeks];
  if (weeksInput.trim()) {
    targetWeeks = weeksInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  // Show category options
  console.log("\n? Which categories to process?");
  console.log("  0 - All Categories");
  allCategories.forEach((cat, idx) => {
    console.log(`  ${idx + 1} - ${cat.notionValue}`);
  });

  // Ask for categories
  const catInput = await askQuestion(
    "\n? Enter numbers (e.g., 1,3 or 0 for all): "
  );
  let activeCategories = [...defaultActiveCategories];
  if (catInput.trim()) {
    const selections = catInput
      .split(",")
      .map((c) => parseInt(c.trim()))
      .filter((c) => !isNaN(c));

    if (selections.includes(0)) {
      activeCategories = allCategories.map((cat) => cat.notionValue);
    } else {
      activeCategories = selections
        .filter((num) => num >= 1 && num <= allCategories.length)
        .map((num) => allCategories[num - 1].notionValue);
    }
  }

  // Show confirmation
  console.log(`\n📊 Processing weeks: ${targetWeeks.join(", ")}`);
  console.log(
    `📋 Processing categories: ${
      activeCategories.length === allCategories.length
        ? "All 6 categories"
        : activeCategories.join(", ")
    }`
  );

  const confirm = await askQuestion("Continue? (y/n): ");

  rl.close();

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    process.exit(0);
  }

  console.log(""); // Empty line before processing starts

  return {
    targetWeeks,
    activeCategories,
    dryRun: false,
  };
}

module.exports = {
  askQuestion,
  checkInteractiveMode,
  runInteractiveMode,
  rl,
};
