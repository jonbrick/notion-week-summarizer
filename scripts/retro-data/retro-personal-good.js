const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("../../src/utils/notion-utils");
const config = require("../../src/config/retro-extraction-config");
const extractionFunctions = require("../../src/utils/retro-extraction-functions");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

/**
 * Process a single week and extract good items using config-driven approach
 */
async function processWeekGood(weekNumber) {
  try {
    // Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      console.error(`❌ Could not find Week ${weekNumber} Recap`);
      return null;
    }

    // Extract data from summary fields using config - handle truncation
    const taskSummary =
      targetWeekPage.properties[config.dataSources.taskSummary]?.rich_text?.[0]
        ?.plain_text || "";

    // Get full cal summary by concatenating all rich_text blocks if truncated
    let calSummary = "";
    const calSummaryRichText =
      targetWeekPage.properties[config.dataSources.calSummary]?.rich_text || [];
    if (calSummaryRichText.length > 0) {
      calSummary = calSummaryRichText
        .map((block) => block.plain_text || "")
        .join("");
    }

    console.log("🔍 FULL CAL SUMMARY LENGTH:", calSummary.length);
    console.log(
      "🔍 CAL SUMMARY CONTAINS CAL_EVENTS?",
      calSummary.includes("===== CAL EVENTS =====")
    );

    // Parse and extract good items using config
    const goodItems = extractGoodItems(taskSummary, calSummary);

    return {
      weekNumber,
      goodItems,
      pageId: targetWeekPage.id,
    };
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    return null;
  }
}

/**
 * Extract good items from summaries using config-driven approach
 * Loop through all sections defined in config and extract items that match good criteria
 */
function extractGoodItems(taskSummary, calSummary) {
  let output = "";

  // Loop through sections in the order defined by config
  for (const sectionName of config.sectionOrder) {
    const sectionConfig = config.sections[sectionName];
    console.log("🔍 SECTION DEBUG: Processing section:", sectionName);
    console.log(
      "🔍 SECTION DEBUG: Include in good:",
      sectionConfig.includeInGood
    );

    // Skip sections not included in good
    if (!sectionConfig.includeInGood) {
      console.log("🔍 SECTION DEBUG: Skipping section:", sectionName);
      continue;
    }

    // Use the new config-driven extraction function
    console.log("🔍 SECTION DEBUG: Calling extraction for:", sectionName);
    const sectionContent = extractionFunctions.extractSectionItems(
      taskSummary,
      calSummary,
      sectionName,
      "good",
      config
    );
    console.log(
      "🔍 SECTION DEBUG: Extracted content length:",
      sectionContent ? sectionContent.length : 0
    );

    // Determine if we should show this section
    const hasContent = sectionContent && sectionContent.length > 0;
    const shouldShow = hasContent || sectionConfig.alwaysShowGoodSection;

    if (shouldShow) {
      // Add section header using custom title
      const sectionTitle = sectionConfig.title || sectionName;
      output += config.formatting.sectionHeader(sectionTitle) + "\n";

      // Add content or empty message
      if (hasContent) {
        // For CAL_EVENTS and TASKS, add extra spacing between categories
        if (sectionName === "CAL_EVENTS" || sectionName === "TASKS") {
          output += sectionContent.join("\n\n") + "\n";
        } else if (sectionName === "ROCKS") {
          // Join rocks with comma separation
          output += sectionContent.join(", ") + "\n";
        } else {
          output += sectionContent.join(config.formatting.itemSeparator) + "\n";
        }
      } else {
        output += sectionConfig.emptyMessage + "\n";
      }

      // Add section separator
      output += config.formatting.sectionSeparator;
    }
  }

  return output.trim();
}

/**
 * Main function to run the script standalone or be called by parent
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for --week argument
  const weekIndex = args.indexOf("--week");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    const weekNumber = parseInt(args[weekIndex + 1]);

    if (!isNaN(weekNumber)) {
      const result = await processWeekGood(weekNumber);

      if (result) {
        // Only output the formatted content, no debug messages
        console.log("✅ Good Items Extracted:");
        console.log("=".repeat(50));
        console.log(result.goodItems);
        console.log("=".repeat(50));

        // Return the result for parent script
        return result;
      }
    } else {
      console.error("❌ Invalid week number");
      process.exit(1);
    }
  } else {
    console.log("Usage: node retro-personal-good.js --week <number>");
    console.log("This script is typically called by retro-data-personal.js");
  }
}

// Export for use by parent script
module.exports = {
  processWeekGood,
  extractGoodItems,
};

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
