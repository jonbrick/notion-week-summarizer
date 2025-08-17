/**
 * Shared extraction functions for retro-personal-good.js and retro-personal-bad.js
 *
 * These functions parse the task and calendar summaries and extract specific content
 * based on the evaluation criteria defined in the config. They return arrays of items
 * that can be formatted by the calling scripts.
 *
 * All filtering logic is driven by config.evaluationCriteria, not hardcoded rules.
 * Config is passed in as a parameter to avoid circular dependencies.
 */

/**
 * Check if an item matches the given criteria
 * Supports: "all", "none", ["text1", "text2"], { not: ["text1", "text2"] }
 */
function matchesCriteria(item, criteria) {
  if (criteria === "all") return true;
  if (criteria === "none") return false;

  if (Array.isArray(criteria)) {
    return criteria.some((criterion) => item.includes(criterion));
  }

  if (criteria && criteria.not && Array.isArray(criteria.not)) {
    return !criteria.not.some((criterion) => item.includes(criterion));
  }

  return false;
}

/**
 * Extract a section from summary text using ===== delimiters
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
 * Generic section extraction using config-driven criteria
 * Config is passed in to avoid circular dependencies
 */
function extractSectionItems(
  taskSummary,
  calSummary,
  sectionName,
  mode,
  config
) {
  const criteria = config.evaluationCriteria[sectionName]?.[mode];
  if (!criteria) return [];

  switch (sectionName) {
    case "TRIPS":
      return extractTripsWithCriteria(taskSummary, criteria);
    case "EVENTS":
      return extractEventsWithCriteria(taskSummary, criteria);
    case "ROCKS":
      return extractRocksWithCriteria(taskSummary, criteria);
    case "HABITS":
      return extractHabitsWithCriteria(calSummary, criteria); // Use calSummary for habits
    case "CAL_SUMMARY":
      return extractCalSummaryWithCriteria(calSummary, criteria);
    case "CAL_EVENTS":
      return extractCalEventsWithCriteria(calSummary, criteria, config);
    case "TASKS":
      return extractTasksWithCriteria(taskSummary, criteria);
    default:
      return [];
  }
}

/**
 * TRIPS EXTRACTION
 */
function extractTripsWithCriteria(taskSummary, criteria) {
  const trips = extractSection(taskSummary, "TRIPS");
  if (!trips || trips.includes("No trips")) {
    return [];
  }

  const allTrips = [trips.trim()];
  return allTrips.filter((trip) => matchesCriteria(trip, criteria));
}

/**
 * EVENTS EXTRACTION
 */
function extractEventsWithCriteria(taskSummary, criteria) {
  const events = extractSection(taskSummary, "EVENTS");
  if (!events || events.includes("No events")) {
    return [];
  }

  const lines = events.split("\n");
  const eventList = [];

  lines.forEach((line) => {
    if (line.trim() && !line.includes("=====")) {
      if (matchesCriteria(line.trim(), criteria)) {
        eventList.push(line.trim());
      }
    }
  });

  return eventList;
}

/**
 * ROCKS EXTRACTION
 */
function extractRocksWithCriteria(taskSummary, criteria) {
  const rocks = extractSection(taskSummary, "ROCKS");
  if (!rocks) return [];

  const lines = rocks.split("\n");
  const matchingRocks = [];

  lines.forEach((line) => {
    if (line.trim() && matchesCriteria(line, criteria)) {
      let cleanRock = line.trim();

      // Clean up the rock text based on status
      if (line.includes("✅") || line.includes("Went well")) {
        cleanRock = cleanRock.replace(/✅\s*/, "");
        cleanRock = cleanRock.replace(/^Went well\s*-\s*/, "");
        cleanRock = cleanRock.replace(/\s*\([^)]+\)\s*$/, "");
      } else if (line.includes("👾") || line.includes("Made progress")) {
        cleanRock = cleanRock.replace(/👾\s*/, "");
        cleanRock = cleanRock.replace(
          /^Made progress\s*-\s*/,
          "made progress on "
        );
        cleanRock = cleanRock.replace(/\s*\([^)]+\)\s*$/, "");
      } else if (line.includes("🥊") || line.includes("Went bad")) {
        cleanRock = cleanRock.replace(/🥊\s*/, "");
        cleanRock = cleanRock.replace(/^Went bad\s*-\s*/, "");
        cleanRock = cleanRock.replace(/\s*\([^)]+\)\s*$/, "");
      } else if (line.includes("🚧") || line.includes("Didn't go so well")) {
        cleanRock = cleanRock.replace(/🚧\s*/, "");
        cleanRock = cleanRock.replace(/^Didn't go so well\s*-\s*/, "");
        cleanRock = cleanRock.replace(/\s*\([^)]+\)\s*$/, "");
      }

      if (cleanRock.trim()) {
        matchingRocks.push(cleanRock.trim());
      }
    }
  });

  return matchingRocks;
}

/**
 * HABITS EXTRACTION
 */
function extractHabitsWithCriteria(taskSummary, criteria) {
  const habits = extractSection(taskSummary, "HABITS");
  if (!habits) return [];

  const lines = habits.split("\n");
  const matchingHabits = [];

  lines.forEach((line) => {
    if (line.trim() && matchesCriteria(line, criteria)) {
      // Remove the emoji but keep the rest
      const cleanLine = line.replace(/^[✅❌⚠️]\s*/, "").trim();
      if (cleanLine) {
        matchingHabits.push(cleanLine);
      }
    }
  });

  return matchingHabits;
}

/**
 * CAL SUMMARY EXTRACTION
 */
function extractCalSummaryWithCriteria(calSummary, criteria) {
  const calSummarySection = extractSection(calSummary, "CAL SUMMARY");
  if (!calSummarySection) return [];

  const lines = calSummarySection.split("\n");
  const matchingItems = [];

  lines.forEach((line) => {
    if (line.trim() && matchesCriteria(line, criteria)) {
      matchingItems.push(line.trim());
    }
  });

  return matchingItems;
}
function extractCalEventsWithCriteria(calSummary, criteria, config) {
  if (!calSummary) return [];

  const lines = calSummary.split("\n");
  const output = [];
  let currentCategory = "";
  let currentEvents = [];

  lines.forEach((line) => {
    // Check if this is a category header
    if (
      line.includes("(") &&
      (line.includes("✅") || line.includes("❌") || line.includes("☑️"))
    ) {
      // Save previous category if it matches criteria
      if (
        currentCategory &&
        currentEvents.length > 0 &&
        matchesCriteria(currentCategory, criteria)
      ) {
        output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
      }

      // Start new category - extract name and stats
      let categoryLine = line.trim();
      const match = categoryLine.match(/([✅❌☑️])\s*(.+?)\s*\(([^)]+)\)/);
      if (match) {
        let categoryName = match[2].trim();
        const stats = match[3];

        // Apply category mappings if config provided
        if (
          config &&
          config.categoryMappings &&
          config.categoryMappings[categoryName]
        ) {
          categoryName = config.categoryMappings[categoryName];
        }

        currentCategory = `${categoryLine.charAt(
          0
        )} ${categoryName} (${stats})`;
        currentEvents = [];
      }
    }
    // Event line (starts with bullet)
    else if (line.trim().startsWith("•")) {
      let event = line.trim().substring(1).trim();
      // Remove time patterns like (10:00am - 11:00am) or (30m)
      event = event.replace(/\s*\([^)]+\)$/, "");
      if (event) {
        currentEvents.push(event);
      }
    }
  });

  // Don't forget the last category
  if (
    currentCategory &&
    currentEvents.length > 0 &&
    matchesCriteria(currentCategory, criteria)
  ) {
    output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
  }

  return output;
}

/**
 * TASKS EXTRACTION
 * Note: Looking for "TASKS" section (updated from old "SUMMARY" section name)
 */
function extractTasksWithCriteria(taskSummary, criteria) {
  const tasks = extractSection(taskSummary, "TASKS");
  if (!tasks) return [];

  const lines = tasks.split("\n");
  const output = [];
  let currentCategory = "";
  let currentTasks = [];

  lines.forEach((line) => {
    // Check if this is a category header
    if (line.includes("(") && matchesCriteria(line, criteria)) {
      // Save previous category if exists
      if (currentCategory && currentTasks.length > 0) {
        output.push(`${currentCategory}\n${currentTasks.join(", ")}`);
      }

      // Extract category name and count
      const match = line.match(/([✅❌⚠️])\s*(.+?)\s*\((\d+\/\d+|\d+)\)/);
      if (match) {
        currentCategory = `${match[1]} ${match[2].trim()} (${match[3]})`;
        currentTasks = [];
      }
    }
    // Task line (starts with bullet)
    else if (line.trim().startsWith("•") && currentCategory) {
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

  return output;
}

// Legacy function wrappers for backward compatibility
// These now require config to be passed in
function extractTrips(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "TRIPS", "good", config);
}

function extractAllEvents(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "EVENTS", "good", config);
}

function extractBadEvents(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "EVENTS", "bad", config);
}

function extractGoodRocks(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "ROCKS", "good", config);
}

function extractBadRocks(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "ROCKS", "bad", config);
}

function extractGoodHabits(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "HABITS", "good", config);
}

function extractBadHabits(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "HABITS", "bad", config);
}

function extractGoodCalEvents(calSummary, config) {
  return extractSectionItems("", calSummary, "CAL_EVENTS", "good", config);
}

function extractBadCalEvents(calSummary, config) {
  return extractSectionItems("", calSummary, "CAL_EVENTS", "bad", config);
}

function extractCompletedTasks(taskSummary, calSummary, config) {
  return extractSectionItems(taskSummary, calSummary, "TASKS", "good", config);
}

module.exports = {
  // New config-driven function
  extractSectionItems,

  // Utility functions
  extractSection,
  matchesCriteria,

  // Legacy functions for backward compatibility
  extractTrips,
  extractAllEvents,
  extractBadEvents,
  extractGoodRocks,
  extractBadRocks,
  extractGoodHabits,
  extractBadHabits,
  extractGoodCalEvents,
  extractBadCalEvents,
  extractCompletedTasks,
};
