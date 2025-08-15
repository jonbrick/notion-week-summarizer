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
 * NEW ORDER: EVENTS, ROCKS, TASKS, CAL, HABITS
 */
function extractGoodItems(taskSummary, calSummary) {
  let output = "";

  // 1. EVENTS - Extract from task summary
  const events = extractSection(taskSummary, "EVENTS");
  if (events && !events.includes("No events")) {
    output += "===== EVENTS =====\n";
    output += formatEvents(events) + "\n\n";
  }

  // 2. ROCKS - Extract only good rocks (✅ and 👾)
  const rocks = extractSection(taskSummary, "ROCKS");
  const goodRocks = extractGoodRocks(rocks);
  if (goodRocks) {
    output += "===== ROCKS =====\n";
    output += goodRocks + "\n\n";
  }

  // 3. TASKS - Extract task breakdown with counts
  const tasks = extractSection(taskSummary, "SUMMARY");
  const formattedTasks = formatTasksForRecap(tasks);
  if (formattedTasks) {
    output += "===== TASKS =====\n";
    output += formattedTasks + "\n\n";
  }

  // 4. CAL - Extract calendar events with ✅ (has events)
  const calEvents = extractGoodCalEvents(calSummary);
  if (calEvents) {
    output += "===== CAL =====\n";
    output += calEvents + "\n\n";
  }

  // 5. HEALTHY HABITS - Extract only ✅ habits
  const habits = extractSection(taskSummary, "HABITS");
  const goodHabits = extractGoodHabits(habits);
  if (goodHabits) {
    output += "===== HEALTHY HABITS =====\n";
    output += goodHabits + "\n";
  }

  // Note: TRIPS section removed from output

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
  const formattedRocks = [];

  lines.forEach((line) => {
    if (line.includes("✅") || line.includes("Went well")) {
      // Extract just the rock name, removing "Went well - " and the category in parentheses
      let rockName = line.replace(/✅\s*/, "").trim();
      rockName = rockName.replace(/^Went well\s*-\s*/, "");
      rockName = rockName.replace(/\s*\([^)]+\)\s*$/, "").trim();
      if (rockName) {
        formattedRocks.push(rockName);
      }
    } else if (line.includes("👾") || line.includes("Made progress")) {
      // Keep "Made progress" but lowercase it, remove emoji and category
      let rockText = line.replace(/👾\s*/, "").trim();
      rockText = rockText.replace(/^Made progress\s*-\s*/, "made progress on ");
      rockText = rockText.replace(/\s*\([^)]+\)\s*$/, "").trim();
      if (rockText) {
        formattedRocks.push(rockText);
      }
    }
  });

  // Join all rocks with commas instead of newlines
  return formattedRocks.join(", ");
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
      const match = line.match(/✅\s*(.+?)\s*\((\d+\/\d+|\d+)\)/);
      if (match) {
        currentCategory = `${match[1].trim()} (${match[2]})`;
        currentTasks = [];
      }
    }
    // Task line (starts with bullet)
    else if (line.trim().startsWith("•")) {
      // Remove bullet and clean up
      const task = line.trim().substring(1).trim();
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
 * Extract good calendar events
 */
function extractGoodCalEvents(calSummary) {
  if (!calSummary) return "";

  const lines = calSummary.split("\n");
  const output = [];
  let currentCategory = "";
  let currentEvents = [];

  lines.forEach((line) => {
    // Check if this is a category header with ✅
    if (line.includes("✅") && line.includes("(")) {
      // Save previous category if exists
      if (currentCategory && currentEvents.length > 0) {
        output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
      }

      // Extract category name and stats
      const match = line.match(/✅\s*(.+?)\s*\(([^)]+)\)/);
      if (match) {
        let categoryName = match[1].trim();
        const stats = match[2];

        // Apply special mappings for category names
        if (categoryName === "Interpersonal events") {
          categoryName = "Social time";
        } else if (categoryName === "Relationships") {
          categoryName = "Time with Relationships";
        } else if (categoryName === "Calls") {
          categoryName = "Calls time";
        } else if (categoryName === "Family") {
          categoryName = "Family time";
        }

        currentCategory = `${categoryName} (${stats})`;
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
