const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("../../src/utils/notion-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

/**
 * Process a single week and extract bad items
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

    // Extract data from various summary fields
    const taskSummary =
      targetWeekPage.properties["Personal Task Summary"]?.rich_text?.[0]
        ?.plain_text || "";
    const calSummary =
      targetWeekPage.properties["Personal Cal Summary"]?.rich_text?.[0]
        ?.plain_text || "";

    // Parse and extract bad items
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
 * Extract bad items from summaries
 */
function extractBadItems(taskSummary, calSummary) {
  let output = "";

  // 1. ROCKS - Extract bad rocks (🚧 and 🥊) - BEFORE habits
  const rocks = extractSection(taskSummary, "ROCKS");
  const badRocks = extractBadRocks(rocks);
  if (badRocks) {
    output += "===== ROCKS =====\n";
    output += badRocks + "\n\n";
  }

  // 2. HABITS - Extract ⚠️ and ❌ habits - AFTER rocks
  const habits = extractSection(taskSummary, "HABITS");
  const badHabits = extractBadHabits(habits);
  if (badHabits) {
    output += "===== HABITS =====\n";
    output += badHabits + "\n\n";
  }

  // 3. TASKS - Extract task categories with ❌ (if any)
  const tasks = extractSection(taskSummary, "SUMMARY");
  const badTasks = extractBadTasks(tasks);
  if (badTasks) {
    output += "===== TASKS =====\n";
    output += badTasks + "\n\n";
  }

  // 4. CAL - Extract calendar events with ❌ (no events when bad)
  const badCalEvents = extractBadCalEvents(calSummary);
  if (badCalEvents) {
    output += "===== CAL =====\n";
    output += badCalEvents + "\n";
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
 * Extract bad rocks (🚧 Didn't go so well and 🥊 Went bad)
 */
function extractBadRocks(rocks) {
  if (!rocks) return "";

  const lines = rocks.split("\n");
  const didntGoWellRocks = [];
  const wentBadRocks = [];

  lines.forEach((line) => {
    if (line.includes("🚧") || line.includes("Didn't go so well")) {
      // Remove the 🚧 emoji from the line
      const cleanLine = line.replace(/🚧\s*/, "").trim();
      didntGoWellRocks.push(cleanLine);
    } else if (line.includes("🥊") || line.includes("Went bad")) {
      // Remove the 🥊 emoji from the line
      const cleanLine = line.replace(/🥊\s*/, "").trim();
      wentBadRocks.push(cleanLine);
    }
  });

  // Sort: 🚧 first, then 🥊
  return [...didntGoWellRocks, ...wentBadRocks].join("\n");
}

/**
 * Extract bad habits (⚠️ and ❌ status)
 */
function extractBadHabits(habits) {
  if (!habits) return "";

  const lines = habits.split("\n");
  const warningHabits = [];
  const badHabits = [];

  lines.forEach((line) => {
    // Look for habits with ⚠️ (warning/not great)
    if (line.startsWith("⚠️")) {
      // Remove the ⚠️ emoji but keep the rest
      const cleanLine = line.replace(/^⚠️\s*/, "").trim();
      warningHabits.push(cleanLine);
    }
    // Look for habits with ❌ (bad)
    else if (line.startsWith("❌")) {
      // Remove the ❌ emoji but keep the rest
      const cleanLine = line.replace(/^❌\s*/, "").trim();
      badHabits.push(cleanLine);
    }
  });

  // Sort: ⚠️ first, then ❌
  return [...warningHabits, ...badHabits].join("\n");
}

/**
 * Extract bad tasks (categories with ❌)
 */
function extractBadTasks(taskSection) {
  if (!taskSection) return "";

  const lines = taskSection.split("\n");
  const output = [];
  let currentCategory = "";
  let currentTasks = [];

  lines.forEach((line) => {
    // Check if this is a category header with ❌
    if (line.includes("❌") && line.includes("(")) {
      // Save previous bad category if exists
      if (currentCategory && currentTasks.length > 0) {
        output.push(`${currentCategory}\n${currentTasks.join(", ")}`);
      }

      // Extract category name and count
      const match = line.match(/❌\s*(.+?)\s*\((\d+)\)/);
      if (match) {
        currentCategory = `${match[1].trim()} (${match[2]})`;
        currentTasks = [];
      }
    }
    // Task line under a bad category (starts with bullet)
    else if (currentCategory && line.trim().startsWith("•")) {
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
 * Extract bad calendar events (categories with ❌ - no events)
 */
function extractBadCalEvents(calSummary) {
  if (!calSummary) return "";

  const summarySection = extractSection(calSummary, "SUMMARY");
  if (!summarySection) return "";

  const lines = summarySection.split("\n");
  const output = [];

  lines.forEach((line) => {
    // Look for category lines with ❌ (typically "0 events, 0 hours")
    if (line.includes("❌")) {
      // Extract the full line but format it nicely
      const match = line.match(/❌\s*(.+?)\s*\((.+?)\):/);
      if (match) {
        const category = match[1].trim();
        const stats = match[2];

        // Check if there's a "No X events this week" line following
        const lineIndex = lines.indexOf(line);
        if (lineIndex < lines.length - 1) {
          const nextLine = lines[lineIndex + 1];
          if (
            nextLine.includes("No") &&
            nextLine.includes("events this week")
          ) {
            // Use the "No X events this week" format
            output.push(nextLine.trim());
          } else {
            // Construct a "No X events" message
            output.push(`No ${category.toLowerCase()} this week`);
          }
        } else {
          // Fallback format
          output.push(
            `${category} (${stats}):\nNo ${category.toLowerCase()} this week`
          );
        }
      }
    }
  });

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
      const result = await processWeekBad(weekNumber);

      if (result) {
        // Only output the formatted content, no debug messages
        console.log(result.badItems);

        // Return the result for parent script
        return result;
      }
    } else {
      console.error("❌ Invalid week number");
      process.exit(1);
    }
  } else {
    console.log("Usage: node recap-personal-bad.js --week <number>");
    console.log("This script is typically called by recap-week-personal.js");
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
