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
  console.log(`🔍 EXTRACT DEBUG: Looking for section: "${sectionName}"`);
  console.log(
    `🔍 EXTRACT DEBUG: Raw text preview: "${summaryText.substring(0, 500)}..."`
  );

  // Add debug to see if the section exists in the text
  const sectionExists = summaryText.includes(`===== ${sectionName} =====`);
  console.log(
    `🔍 EXTRACT DEBUG: Section "${sectionName}" exists in text: ${sectionExists}`
  );

  const pattern = new RegExp(
    `=====\\s*${sectionName}\\s*=====([\\s\\S]*?)(?=\\n=====|$)`,
    "i"
  );
  const match = summaryText.match(pattern);

  if (!match && sectionExists) {
    console.log(`🔍 EXTRACT DEBUG: REGEX FAILED for section "${sectionName}"`);
    console.log(`🔍 EXTRACT DEBUG: Full text: "${summaryText}"`);
  }

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
      return extractEventsWithCriteria(taskSummary, criteria, config, mode);
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
function extractEventsWithCriteria(taskSummary, criteria, config, mode) {
  const events = extractSection(taskSummary, "EVENTS");
  if (!events || events.includes("No events")) {
    return [];
  }

  const lines = events.split("\n");
  const eventList = [];

  lines.forEach((line) => {
    if (line.trim() && !line.includes("=====")) {
      const raw = line.trim();
      if (matchesCriteria(raw, criteria)) {
        let cleanEvent = raw;
        const dashIndex = cleanEvent.indexOf(" - ");
        if (dashIndex !== -1) {
          // Split into type and description
          const eventTypeWithEmojis = cleanEvent.substring(0, dashIndex);
          const description = cleanEvent.substring(dashIndex + 3);

          // Preserve only configured emojis from the type; drop all other type text
          const preserveEmojis =
            (config &&
              config.formatting &&
              config.formatting.preserveTypeEmojisForModes) ||
            {};
          const emojisToPreserve = new Set(preserveEmojis[mode] || []);

          // Collect only preserved emojis present in the type
          const keptEmojis = Array.from(
            eventTypeWithEmojis.matchAll(
              /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu
            )
          )
            .map((m) => m[0])
            .filter((e) => emojisToPreserve.has(e));

          cleanEvent =
            keptEmojis.length > 0
              ? `${keptEmojis.join(" ")} ${description}`.trim()
              : description;
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

/**
 * CAL EVENTS EXTRACTION
 */
function extractCalEventsWithCriteria(calSummary, criteria, config) {
  console.log("🔍 CAL_EVENTS DEBUG: Starting extraction");
  console.log("🔍 CAL_EVENTS DEBUG: Criteria:", criteria);

  if (!calSummary) {
    console.log("🔍 CAL_EVENTS DEBUG: No calSummary provided");
    return [];
  }

  // ADD THIS DEBUG
  console.log("🔍 CAL_EVENTS DEBUG: Full calSummary text:");
  console.log(calSummary);
  console.log("🔍 CAL_EVENTS DEBUG: End of full text");

  // Extract only the CAL_EVENTS section first
  const calEventsSection = extractSection(calSummary, "CAL_EVENTS");
  console.log(
    "🔍 CAL_EVENTS DEBUG: Extracted section length:",
    calEventsSection ? calEventsSection.length : 0
  );
  console.log(
    "🔍 CAL_EVENTS DEBUG: Section content preview:",
    calEventsSection ? calEventsSection.substring(0, 200) + "..." : "NONE"
  );

  if (!calEventsSection) {
    console.log("🔍 CAL_EVENTS DEBUG: No CAL_EVENTS section found");
    return [];
  }

  const lines = calEventsSection.split("\n");
  console.log("🔍 CAL_EVENTS DEBUG: Number of lines:", lines.length);

  const output = [];
  let currentCategory = "";
  let originalCategoryLine = ""; // Keep original line for criteria matching
  let currentEvents = [];
  let currentCategoryName = ""; // Category without stats/emoji

  lines.forEach((line) => {
    // Check if this is a category header (more robust emoji detection)
    if (line.includes("(") && /[✅❌☑️⚠️]/u.test(line)) {
      // Save previous category if it matches criteria
      if (currentCategory && matchesCriteria(originalCategoryLine, criteria)) {
        if (currentEvents.length > 0) {
          output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
        } else {
          // Show just the category header when details are hidden
          output.push(currentCategory);
        }
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
        currentCategoryName = cleanStatusEmojis(categoryName, config);
        currentCategory = `${currentCategoryName} (${stats})`;
        currentEvents = [];
      }
    }
    // Event line (starts with bullet)
    else if (line.trim().startsWith("•")) {
      // Check main config for weekly behavior
      let shouldHideDetails = false;
      if (config && config.calEventDetails) {
        const categoryConfig = config.calEventDetails.find(
          (cat) => cat.displayName === currentCategoryName
        );
        if (categoryConfig && !categoryConfig.showDetails) {
          shouldHideDetails = true;
        }
      }
      // Override with monthly config if present (for monthly retros)
      else if (config.monthlyConfig && config.monthlyConfig.calEventDetails) {
        const categoryConfig = config.monthlyConfig.calEventDetails.find(
          (cat) => cat.displayName === currentCategoryName
        );
        if (categoryConfig && !categoryConfig.showDetails) {
          shouldHideDetails = true;
        }
      }

      if (shouldHideDetails) {
        return; // Skip this event detail, but category header will still be added
      }

      let event = line.trim().substring(1).trim();
      // Always remove time-of-day ranges like (10:00am - 11:00am)
      event = event.replace(
        /\s*\((?=[^)]*(?:\d{1,2}:\d{2}|\b(?:am|pm)\b))[^)]*\)\s*$/i,
        ""
      );
      // For interpersonal-like categories, remove duration suffixes like (2.0h) or (30m)
      const interpersonalCategoryPattern =
        /interpersonal|relationship|relationships|calls|family|social time|time with relationships|calls time|family time/i;
      if (interpersonalCategoryPattern.test(currentCategoryName)) {
        event = event.replace(/\s*\((?:\d+(?:\.\d+)?h|\d+m)\)\s*$/i, "");
      }
      if (event) {
        currentEvents.push(event);
      }
    }
  });

  // Don't forget the last category
  if (currentCategory && matchesCriteria(originalCategoryLine, criteria)) {
    if (currentEvents.length > 0) {
      output.push(`${currentCategory}:\n${currentEvents.join(", ")}`);
    } else {
      // Show just the category header when details are hidden
      output.push(currentCategory);
    }
  }

  console.log("🔍 CAL_EVENTS DEBUG: Final output length:", output.length);
  console.log("🔍 CAL_EVENTS DEBUG: Final output:", output);
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
  let includeDetailsForCategory = true;

  lines.forEach((line, index) => {
    console.log(`🔍 CAL_EVENTS DEBUG: Line ${index}: "${line}"`);
    console.log(
      `🔍 CAL_EVENTS DEBUG: Line includes '(': ${line.includes("(")}`
    );
    console.log(
      `🔍 CAL_EVENTS DEBUG: Line includes '✅': ${line.includes("✅")}`
    );
    console.log(
      `🔍 CAL_EVENTS DEBUG: Emoji test result: ${/[✅❌☑️⚠️]/u.test(line)}`
    );
    // Check if this is a category header
    if (line.includes("(") && matchesCriteria(line, criteria)) {
      // Save previous category if exists
      if (currentCategory) {
        if (includeDetailsForCategory && currentTasks.length > 0) {
          output.push(`${currentCategory}\n${currentTasks.join(", ")}`);
        } else {
          // Push just the header even if no details or none matched
          output.push(currentCategory);
        }
      }

      // Extract category name and count
      const match = line.match(/([✅❌⚠️☑️])\s*(.+?)\s*\((\d+\/\d+|\d+)\)/);
      if (match) {
        // Remove emoji from category display using config
        const rawCategoryName = match[2].trim();
        const cleanCategoryName = cleanStatusEmojis(rawCategoryName, config);
        currentCategory = `${cleanCategoryName} (${match[3]})`;
        currentTasks = [];
        // Determine if item details should be included for this category
        // Determine if item details should be included for this category
        // First check monthly config, then fall back to regular config
        let includeDetailsFromConfig = false;
        const monthlyConfig = config.monthlyConfig;

        if (monthlyConfig && monthlyConfig.taskDetails) {
          const categoryConfig = monthlyConfig.taskDetails.find(
            (cat) => cat.displayName === cleanCategoryName
          );
          if (categoryConfig) {
            includeDetailsFromConfig = categoryConfig.showDetails;
          }
        } else {
          // Fall back to regular config
          const taskDetailConfig =
            config && Array.isArray(config.taskDetails)
              ? config.taskDetails.find(
                  (cat) => cat.displayName === cleanCategoryName
                )
              : null;
          includeDetailsFromConfig = taskDetailConfig
            ? taskDetailConfig.showDetails
            : false;
        }

        includeDetailsForCategory = includeDetailsFromConfig;
      }
    }
    // Task line (starts with bullet)
    else if (line.trim().startsWith("•") && currentCategory) {
      if (!includeDetailsForCategory) {
        // Skip details for categories not configured to show details
        return;
      }
      const task = line.trim().substring(1).trim();
      if (!task) return;

      // Apply optional per-task show/hide filters from config
      const showPatterns =
        config && Array.isArray(config.tasksShowItemPatterns)
          ? config.tasksShowItemPatterns
          : [];
      const hidePatterns =
        config && Array.isArray(config.tasksHideItemPatterns)
          ? config.tasksHideItemPatterns
          : [];

      if (showPatterns.length > 0) {
        const matchesShow = showPatterns.some((p) => task.includes(p));
        if (!matchesShow) return;
      }
      if (hidePatterns.length > 0) {
        const matchesHide = hidePatterns.some((p) => task.includes(p));
        if (matchesHide) return;
      }

      currentTasks.push(task);
    }
  });

  // Don't forget the last category
  if (currentCategory) {
    if (includeDetailsForCategory && currentTasks.length > 0) {
      output.push(`${currentCategory}\n${currentTasks.join(", ")}`);
    } else {
      output.push(currentCategory);
    }
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

  // Direct extraction functions (exported for monthly retro and others)
  extractTripsWithCriteria,
  extractEventsWithCriteria,
  extractRocksWithCriteria,
  extractHabitsWithCriteria,
  extractCalSummaryWithCriteria,
  extractCalEventsWithCriteria,
  extractTasksWithCriteria,

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
