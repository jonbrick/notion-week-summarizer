const { Client } = require("@notionhq/client");
const { spawn } = require("child_process");
const readline = require("readline");
const { findWeekRecapPage } = require("./src/utils/notion-utils");
const config = require("./src/config/recap-personal-config");
const recapFunctions = require("./src/utils/recap-functions");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Global variables for CLI processing
let TARGET_WEEKS = [2]; // Default week
let PROCESSING_MODE = "overview"; // Default to generating overview

// CLI utility functions
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Interactive mode for selecting weeks and options
 */
async function runInteractiveMode() {
  console.log("📋 This will combine good/bad columns into overview column");
  console.log(
    "📊 Processes 'Personal - What went well?' + 'Personal - What didn't go so well?'"
  );
  console.log("📝 Outputs to 'Personal - Overview?' with evaluations\n");

  // Ask for weeks
  const weeksInput = await askQuestion(
    "Which weeks to process? (comma-separated, e.g., 1,2,3): "
  );

  if (weeksInput.trim()) {
    TARGET_WEEKS = weeksInput
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
  return { weeks: TARGET_WEEKS };
}

/**
 * Process a single week - combine good/bad into overview
 */
async function processWeek(weekNumber) {
  try {
    const paddedWeek = weekNumber.toString().padStart(2, "0");
    console.log(`\n${"=".repeat(50)}`);
    console.log(`🔄 Processing Week ${paddedWeek} Overview Generation`);
    console.log(`${"=".repeat(50)}`);

    // Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      console.error(`❌ Could not find Week ${weekNumber} Recap`);
      return;
    }

    console.log(`📥 Found Week ${weekNumber} page`);

    // Extract existing good and bad column content
    const goodContent =
      targetWeekPage.properties[config.dataSources.goodColumn]?.rich_text?.[0]
        ?.plain_text || "";
    const badContent =
      targetWeekPage.properties[config.dataSources.badColumn]?.rich_text?.[0]
        ?.plain_text || "";

    console.log(`📊 Good column: ${goodContent ? "has content" : "empty"}`);
    console.log(`📊 Bad column: ${badContent ? "has content" : "empty"}`);

    if (!goodContent && !badContent) {
      console.log("⚠️ Both good and bad columns are empty, skipping...");
      return;
    }

    // Generate combined overview
    console.log("🔧 Generating combined overview...");
    const overview = generateOverview(goodContent, badContent);

    // Update the overview column in Notion
    await updateOverviewColumn(targetWeekPage.id, overview);

    console.log(`✅ Week ${weekNumber} overview generated successfully!`);
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
}

/**
 * Generate combined overview from good and bad content
 */
function generateOverview(goodContent, badContent) {
  // Get all unique section names from both columns
  const allSections = new Set();

  // Extract section names from good content
  if (goodContent) {
    const goodSections = extractSectionNames(goodContent);
    goodSections.forEach((section) => allSections.add(section));
  }

  // Extract section names from bad content
  if (badContent) {
    const badSections = extractSectionNames(badContent);
    badSections.forEach((section) => allSections.add(section));
  }

  let output = "";

  // Process sections in the order defined by config
  for (const sectionName of config.sectionOrder) {
    if (!allSections.has(sectionName)) {
      continue; // Skip sections that don't exist in either column
    }

    // Extract section content from both columns
    const goodSectionContent = goodContent
      ? recapFunctions.extractSection(goodContent, sectionName)
      : "";
    const badSectionContent = badContent
      ? recapFunctions.extractSection(badContent, sectionName)
      : "";

    // Combine the section using the appropriate logic
    const combinedContent = recapFunctions.combineSection(
      sectionName,
      goodSectionContent,
      badSectionContent,
      config
    );

    if (combinedContent && combinedContent.trim()) {
      // Add section header
      output += config.formatting.sectionHeader(sectionName) + "\n";
      output += combinedContent + "\n";
      output += config.formatting.sectionSeparator;
    }
  }

  return output.trim();
}

/**
 * Extract section names from column content
 */
function extractSectionNames(content) {
  const sections = [];
  const sectionRegex = /=====\s*([^=]+?)\s*=====/g;
  let match;

  while ((match = sectionRegex.exec(content)) !== null) {
    sections.push(match[1].trim());
  }

  return sections;
}

/**
 * Update the overview column in Notion
 */
async function updateOverviewColumn(pageId, overviewContent) {
  try {
    console.log("📤 Updating Notion overview column...");

    await notion.pages.update({
      page_id: pageId,
      properties: {
        [config.dataSources.overviewColumn]: {
          rich_text: [
            {
              text: {
                content: overviewContent,
              },
            },
          ],
        },
      },
    });

    console.log("✅ Notion overview column updated successfully!");
  } catch (error) {
    console.error("❌ Error updating Notion:", error.message);
    throw error;
  }
}

/**
 * Process all target weeks
 */
async function processAllWeeks() {
  console.log(
    `\n🚀 Starting overview generation for week${
      TARGET_WEEKS.length > 1 ? "s" : ""
    }: ${TARGET_WEEKS.join(", ")}`
  );

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log("\n" + "=".repeat(50));
  console.log(
    `🎉 Overview generation complete for week${
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

  console.log("📊 Personal Recap Overview Generator");
  console.log(
    "🔄 Combines 'What went well?' + 'What didn't go so well?' → 'Overview?'\n"
  );

  // Check for --weeks argument
  const weekIndex = args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    TARGET_WEEKS = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));

    await processAllWeeks();
  }
  // Check for quick single week format (--2, --3, etc.)
  else {
    for (const arg of args) {
      if (arg.startsWith("--") && !isNaN(parseInt(arg.slice(2)))) {
        const weekNumber = parseInt(arg.slice(2));
        TARGET_WEEKS = [weekNumber];
        await processAllWeeks();
        process.exit(0);
      }
    }

    // No args provided, run interactive mode
    if (args.length === 0) {
      const result = await runInteractiveMode();
      TARGET_WEEKS = result.weeks;
      await processAllWeeks();
    }
  }

  process.exit(0);
}

// Export for use by parent script (if needed)
module.exports = {
  processWeek,
  generateOverview,
};

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
