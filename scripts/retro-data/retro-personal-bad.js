const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("../../src/utils/notion-utils");
const config = require("../../src/config/retro-extraction-config");
const extractionFunctions = require("../../src/utils/retro-extraction-functions");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

/**
 * Process a single week and extract bad items using config-driven approach
 */
async function processWeekBad(weekNumber) {
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

    // Extract data from summary fields using config
    const taskSummary =
      targetWeekPage.properties[config.dataSources.taskSummary]?.rich_text?.[0]
        ?.plain_text || "";
    const calSummary =
      targetWeekPage.properties[config.dataSources.calSummary]?.rich_text?.[0]
        ?.plain_text || "";

    // Parse and extract bad items using config
    const badItems = extractBadItems(taskSummary, calSummary);

    return {
      weekNumber,
      badItems,
      pageId: targetWeekPage.id,
    };
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    return null;
  }
}

/**
 * Extract bad items from summaries using config-driven approach
 * Loop through all sections defined in config and extract items that match bad criteria
 */
function extractBadItems(taskSummary, calSummary) {
  let output = "";

  // Loop through sections in the order defined by config
  for (const sectionName of config.sectionOrder) {
    const sectionConfig = config.sections[sectionName];

    // Skip sections not included in bad
    if (!sectionConfig.includeInBad) {
      continue;
    }

    // Use the new config-driven extraction function
    const sectionContent = extractionFunctions.extractSectionItems(
      taskSummary,
      calSummary,
      sectionName,
      "bad",
      config
    );

    // Determine if we should show this section
    const hasContent = sectionContent && sectionContent.length > 0;
    const shouldShow = hasContent || sectionConfig.alwaysShowBadSection;

    if (shouldShow) {
      // Add section header using custom title
      const sectionTitle = sectionConfig.title || sectionName;
      output += config.formatting.sectionHeader(sectionTitle) + "\n";

      // Add content or empty message
      if (hasContent) {
        // For CAL_EVENTS and TASKS, add extra spacing between categories
        if (sectionName === "CAL_EVENTS" || sectionName === "TASKS") {
          if (sectionName === "CAL_EVENTS") {
            const decorated = sectionContent.map((block) => {
              const parts = block.split("\n");
              const header = parts[0] || "";
              const eventsLine = parts[1] || "";
              const updatedEventsLine = eventsLine
                .split(", ")
                .map((ev) => ev.replace(/\bWasted Day\b/g, "🗑️ Wasted Day"))
                .join(", ");
              return header + "\n" + updatedEventsLine;
            });
            output += decorated.join("\n\n") + "\n";
          } else {
            output += sectionContent.join("\n\n") + "\n";
          }
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
      const result = await processWeekBad(weekNumber);

      if (result) {
        // Only output the formatted content, no debug messages
        console.log("❌ Bad Items Extracted:");
        console.log("=".repeat(50));
        console.log(result.badItems);
        console.log("=".repeat(50));

        // Return the result for parent script
        return result;
      }
    } else {
      console.error("❌ Invalid week number");
      process.exit(1);
    }
  } else {
    console.log("Usage: node retro-personal-bad.js --week <number>");
    console.log("This script is typically called by retro-data-personal.js");
  }
}

// Export for use by parent script
module.exports = {
  processWeekBad,
  extractBadItems,
};

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  });
}
