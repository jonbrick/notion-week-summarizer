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
 * Clean status emojis from text using config (preserves content emojis like 🍻🛌)
 */
function cleanStatusEmojis(text, config) {
  if (
    !config ||
    !config.formatting ||
    !config.formatting.statusEmojisToRemove
  ) {
    return text;
  }

  let cleanText = text;
  config.formatting.statusEmojisToRemove.forEach((emoji) => {
    cleanText = cleanText.replace(new RegExp(emoji, "g"), "");
  });

  return cleanText.trim();
}

/**
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
 * Check if an item matches the given criteria
 * Config is passed in to avoid circular dependencies
 */
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
      return extractTripsWithCriteria(taskSummary, criteria, config);
    case "EVENTS":
      return extractEventsWithCriteria(taskSummary, criteria, config);
    case "ROCKS":
      return extractRocksWithCriteria(taskSummary, criteria, config);
    case "HABITS":
      return extractHabitsWithCriteria(calSummary, criteria, config);
    case "CAL_SUMMARY":
      return extractCalSummaryWithCriteria(calSummary, criteria, config);
    case "CAL_EVENTS":
      return extractCalEventsWithCriteria(calSummary, criteria, config);
    case "TASKS":
      return extractTasksWithCriteria(taskSummary, criteria, config);
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
        // Clean up the event - remove emoji and event type, keep only the description after first dash
        let cleanEvent = line.trim();
        const dashIndex = cleanEvent.indexOf(" - ");
        if (dashIndex !== -1) {
          // Take everything after "Event Type - "
          cleanEvent = cleanEvent.substring(dashIndex + 3);
        }
        eventList.push(cleanEvent);
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
      const original = line.trim();

      // Robust parse: optional leading emoji/text, status phrase, dash, title, optional parens
      const parsed = original.match(
        /^\s*[^A-Za-z0-9]*\s*(Went well|Made progress|Didn't go so well|Went bad)\s*-\s*(.+?)(?:\s*\([^)]+\)\s*)?$/i
      );

      let phrase = "";
      if (parsed) {
        const status = parsed[1].toLowerCase();
        const title = parsed[2].trim();
        if (!title) return;
        if (status === "made progress") {
          phrase = `Made progress on ${title}`;
        } else if (status === "went bad") {
          phrase = `${title} went bad`;
        } else if (status === "didn't go so well") {
          phrase = `${title} didn't go so well`;
        } else {
          // went well
          phrase = title;
        }
      } else {
        // Fallback cleanup if the strict parse did not match
        const isProgress = /\bMade progress\b/i.test(original);
        const isWentBad = /\bWent bad\b/i.test(original);
        const isNotGreat = /Didn't go so well/i.test(original);
        let title = original
          .replace(/^[^A-Za-z0-9]+\s*/, "")
          .replace(/^Went well\s*-\s*/i, "")
          .replace(/^Made progress\s*-\s*/i, "")
          .replace(/^Went bad\s*-\s*/i, "")
          .replace(/^Didn't go so well\s*-\s*/i, "")
          .replace(/\s*\([^)]+\)\s*$/, "")
          .trim();
        if (!title) return;
        if (isProgress) {
          phrase = `Made progress on ${title}`;
        } else if (isWentBad) {
          phrase = `${title} went bad`;
        } else if (isNotGreat) {
          phrase = `${title} didn't go so well`;
        } else {
          phrase = title;
        }
      }

      if (phrase.trim()) {
        matchingRocks.push(phrase.trim());
      }
    }
  });

  return matchingRocks;
}

/**
 * HABITS EXTRACTION
 */
function extractHabitsWithCriteria(calSummary, criteria, config) {
  const habits = extractSection(calSummary, "HABITS");
  if (!habits) return [];

  const lines = habits.split("\n");
  const matchingHabits = [];

  lines.forEach((line) => {
    if (line.trim() && matchesCriteria(line, criteria)) {
      // Only remove status emojis, keep content emojis like 🍻🛌
      const cleanLine = cleanStatusEmojis(line, config);
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
function extractCalSummaryWithCriteria(calSummary, criteria, config) {
  const calSummarySection = extractSection(calSummary, "CAL SUMMARY");
  if (!calSummarySection) return [];

  const lines = calSummarySection.split("\n");
  const matchingItems = [];

  lines.forEach((line) => {
    if (line.trim() && matchesCriteria(line, criteria)) {
      let processed = line;
      // Replace zero-item lines for specific categories regardless of emoji
      if (config && config.calSummaryZeroItemReplacements) {
        const zeroMatch = processed.match(
          /^[✅❌☑️⚠️]\s*(.+?)\s*\((\d+) events?,\s*(\d+\.?\d*) hours?\):?/
        );
        if (zeroMatch) {
          const category = zeroMatch[1].trim();
          const events = parseInt(zeroMatch[2], 10);
          const hours = parseFloat(zeroMatch[3]);
          if (events === 0 && hours === 0) {
            const replacement = config.calSummaryZeroItemReplacements[category];
            if (replacement) {
              processed = replacement;
            }
          }
        }
      }

      // Use config-based status emoji cleaning
      const cleanLine = cleanStatusEmojis(processed, config);
      if (cleanLine) {
        matchingItems.push(cleanLine);
      }
    }
  });

  return matchingItems;
}
function extractCalEventsWithCriteria(calSummary, criteria, config) {
  if (!calSummary) return [];

  const lines = calSummary.split("\n");
  const output = [];
  let currentCategory = "";
  let originalCategoryLine = ""; // Keep original line for criteria matching
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
        matchesCriteria(originalCategoryLine, criteria)
      ) {
        output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
      }

      // Start new category - extract name and stats
      let categoryLine = line.trim();
      originalCategoryLine = categoryLine; // Keep original for criteria matching
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

        // Remove emoji from the category display
        currentCategory = `${cleanStatusEmojis(
          categoryName,
          config
        )} (${stats})`;
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
    matchesCriteria(originalCategoryLine, criteria)
  ) {
    output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
  }

  return output;
}

/**
 * TASKS EXTRACTION
 * Note: Looking for "TASKS" section (updated from old "SUMMARY" section name)
 */
function extractTasksWithCriteria(taskSummary, criteria, config) {
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
      const match = line.match(/([✅❌⚠️☑️])\s*(.+?)\s*\((\d+\/\d+|\d+)\)/);
      if (match) {
        // Remove emoji from category display using config
        currentCategory = `${cleanStatusEmojis(match[2].trim(), config)} (${
          match[3]
        })`;
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
