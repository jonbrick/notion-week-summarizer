const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("../../src/utils/notion-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

/**
 * Process a single week and extract good items
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

    // Extract data from various summary fields
    const taskSummary =
      targetWeekPage.properties["Personal Task Summary"]?.rich_text?.[0]
        ?.plain_text || "";
    const calSummary =
      targetWeekPage.properties["Personal Cal Summary"]?.rich_text?.[0]
        ?.plain_text || "";

    // Parse and extract good items
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
 * Extract good items from summaries
 */
function extractGoodItems(taskSummary, calSummary) {
  let output = "";

  // 1. TRIPS - Extract from task summary
  const trips = extractSection(taskSummary, "TRIPS");
  if (trips && !trips.includes("No trips")) {
    output += "===== TRIPS =====\n";
    output += formatTrips(trips) + "\n\n";
  }

  // 2. EVENTS - Extract from task summary
  const events = extractSection(taskSummary, "EVENTS");
  if (events && !events.includes("No events")) {
    output += "===== EVENTS =====\n";
    output += formatEvents(events) + "\n\n";
  }

  // 3. ROCKS - Extract only good rocks (✅ and 👾)
  const rocks = extractSection(taskSummary, "ROCKS");
  const goodRocks = extractGoodRocks(rocks);
  if (goodRocks) {
    output += "===== ROCKS =====\n";
    output += goodRocks + "\n\n";
  }

  // 4. HEALTHY HABITS - Extract only ✅ habits
  const habits = extractSection(taskSummary, "HABITS");
  const goodHabits = extractGoodHabits(habits);
  if (goodHabits) {
    output += "===== HEALTHY HABITS =====\n";
    output += goodHabits + "\n\n";
  }

  // 5. TASKS - Extract task breakdown with counts
  const tasks = extractSection(taskSummary, "SUMMARY");
  const formattedTasks = formatTasksForRecap(tasks);
  if (formattedTasks) {
    output += "===== TASKS =====\n";
    output += formattedTasks + "\n\n";
  }

  // 6. CAL - Extract calendar events with ✅ (has events)
  const calEvents = extractGoodCalEvents(calSummary);
  if (calEvents) {
    output += "===== CAL =====\n";
    output += calEvents + "\n";
  }

  return output.trim();
}

/**
 * Extract section from summary text using ===== delimiters
 */
function extractSection(summaryText, sectionName) {
  const pattern = new RegExp(
    `=====\\s*${sectionName}\\s*=====([\\s\\S]*?)(?=\\n=====|$)`,
    "i"
  );
  const match = summaryText.match(pattern);
  return match ? match[1].trim() : "";
}

/**
 * Format trips - remove any extra formatting
 */
function formatTrips(trips) {
  return trips.trim();
}

/**
 * Format events - clean up formatting
 */
function formatEvents(events) {
  // Events are already comma-separated in the new format
  return events.trim();
}

/**
 * Extract good rocks (✅ Went well and 👾 Made progress)
 */
function extractGoodRocks(rocks) {
  if (!rocks) return "";

  const lines = rocks.split("\n");
  const goodRocks = [];
  const progressRocks = [];

  lines.forEach((line) => {
    if (line.includes("✅") || line.includes("Went well")) {
      // Remove the ✅ emoji from the line
      const cleanLine = line.replace(/✅\s*/, "").trim();
      goodRocks.push(cleanLine);
    } else if (line.includes("👾") || line.includes("Made progress")) {
      // Remove the 👾 emoji from the line
      const cleanLine = line.replace(/👾\s*/, "").trim();
      progressRocks.push(cleanLine);
    }
  });

  // Sort: ✅ first, then 👾
  return [...goodRocks, ...progressRocks].join("\n");
}

/**
 * Extract good habits (only ✅ status)
 */
function extractGoodHabits(habits) {
  if (!habits) return "";

  const lines = habits.split("\n");
  const goodHabits = [];

  lines.forEach((line) => {
    // Look for habits with ✅ at the start
    if (line.startsWith("✅")) {
      // Remove the ✅ emoji but keep the rest
      const cleanLine = line.replace(/^✅\s*/, "").trim();
      goodHabits.push(cleanLine);
    }
  });

  return goodHabits.join("\n");
}

/**
 * Format tasks for recap - remove bullets, make comma-separated
 */
function formatTasksForRecap(taskSection) {
  if (!taskSection) return "";

  const lines = taskSection.split("\n");
  const output = [];
  let currentCategory = "";
  let currentTasks = [];

  lines.forEach((line) => {
    // Check if this is a category header with ✅
    if (line.includes("✅") && line.includes("(")) {
      // Save previous category if exists
      if (currentCategory && currentTasks.length > 0) {
        output.push(`${currentCategory}\n${currentTasks.join(", ")}`);
      }

      // Extract category name and count
      const match = line.match(/✅\s*(.+?)\s*\((\d+)\)/);
      if (match) {
        currentCategory = `${match[1].trim()} (${match[2]})`;
        currentTasks = [];
      }
    }
    // Task line (starts with bullet)
    else if (line.trim().startsWith("•")) {
      // Remove bullet, date in parentheses, and trim
      let task = line.trim().substring(1).trim();
      // Remove date patterns like (Mon Jan 1)
      task = task.replace(/\s*\([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\)$/, "");
      if (task) {
        currentTasks.push(task);
      }
    }
  });

  // Don't forget the last category
  if (currentCategory && currentTasks.length > 0) {
    output.push(`${currentCategory}\n${currentTasks.join(", ")}`);
  }

  return output.join("\n\n");
}

/**
 * Extract good calendar events (categories with ✅)
 */
function extractGoodCalEvents(calSummary) {
  if (!calSummary) return "";

  const summarySection = extractSection(calSummary, "SUMMARY");
  if (!summarySection) return "";

  const lines = summarySection.split("\n");
  const output = [];
  let currentCategory = "";
  let currentEvents = [];

  lines.forEach((line) => {
    // Look for category lines with ✅
    if (line.includes("✅")) {
      // Save previous category if exists
      if (currentCategory && currentEvents.length > 0) {
        output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
      }

      // Extract category info: "✅ Category (X events, Y hours):"
      const match = line.match(/✅\s*(.+?)\s*\((.+?)\)/);
      if (match) {
        currentCategory = `${match[1].trim()} (${match[2]})`;
        currentEvents = [];
      }
    }
    // Event line (starts with bullet)
    else if (line.trim().startsWith("•")) {
      // Remove bullet and timestamp in parentheses
      let event = line.trim().substring(1).trim();
      // Remove time patterns like (10:00am - 11:00am) or (30m)
      event = event.replace(/\s*\([^)]+\)$/, "");
      if (event) {
        currentEvents.push(event);
      }
    }
  });

  // Don't forget the last category
  if (currentCategory && currentEvents.length > 0) {
    output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
  }

  return output.join("\n\n");
}

/**
 * Main function to run the script
 */
async function main() {
  // This script is meant to be called from the parent script
  // But can also be run standalone for testing

  const args = process.argv.slice(2);

  // Check for --week argument
  const weekIndex = args.indexOf("--week");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    const weekNumber = parseInt(args[weekIndex + 1]);

    if (!isNaN(weekNumber)) {
      const result = await processWeekGood(weekNumber);

      if (result) {
        // Only output the formatted content, no debug messages
        console.log(result.goodItems);

        // Return the result for parent script
        return result;
      }
    } else {
      console.error("❌ Invalid week number");
      process.exit(1);
    }
  } else {
    console.log("Usage: node recap-personal-good.js --week <number>");
    console.log("This script is typically called by recap-data-personal.js");
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
