/**
 * Utility functions for recap-data-personal.js
 * Handles parsing, evaluation, and combination logic for creating overview from good/bad columns
 */

/**
 * Parse hours from text like "(1 event, 4.5 hours)" or "(5 events, 10.5 hours)"
 * @param {string} text - Text containing hour information
 * @returns {number} - Parsed hours, or 0 if not found
 */
function parseHours(text) {
  const match = text.match(/\(.*?(\d+(?:\.\d+)?)\s*hours?\)/i);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Get day-of-week index (Sun=0 ... Sat=6) from a string, or 7 if none found
 */
function getDayIndex(text) {
  const dayMatch = text.match(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/);
  if (!dayMatch) return 7;
  const order = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return order[dayMatch[1]] ?? 7;
}

/**
 * Parse task count from text like "Personal Tasks (11)" or "Home Tasks (3)"
 * @param {string} text - Text containing task count
 * @returns {number} - Parsed count, or 0 if not found
 */
function parseTaskCount(text) {
  const match = text.match(/\((\d+)\)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Evaluate habits based on scoring system
 * @param {Array} habitLines - Array of habit text lines
 * @param {Object} config - Config object with scoring rules
 * @returns {Object} - {score, evaluation, lines}
 */
function evaluateHabits(habitLines, config) {
  let totalScore = 0;
  const scoringRules = config.evaluationRules.habits.scoring;

  habitLines.forEach((line) => {
    const lowerLine = line.toLowerCase();

    if (lowerLine.includes("good")) {
      totalScore += scoringRules.goodHabit;
    } else if (lowerLine.includes("bad")) {
      totalScore += scoringRules.badHabit;
    } else if (lowerLine.includes("not great")) {
      totalScore += scoringRules.notGreatHabit;
    }
  });

  // Find overall evaluation based on score
  const evaluationRules = config.evaluationRules.habits.overallEvaluation;
  let evaluation = "Ok healthy habits this week"; // default

  for (const rule of evaluationRules) {
    if (totalScore >= rule.min && totalScore <= rule.max) {
      evaluation = rule.label;
      break;
    }
  }

  return {
    score: totalScore,
    evaluation,
    lines: habitLines,
  };
}

/**
 * Get evaluation label based on value and ranges
 * @param {number} value - Value to evaluate
 * @param {Array} ranges - Array of range objects with min, max, label
 * @returns {string} - Evaluation label
 */
function getEvaluationLabel(value, ranges) {
  for (const range of ranges) {
    if (value >= range.min && value < range.max) {
      return range.label;
    }
  }
  return "Some"; // default fallback
}

/**
 * Extract section content from column text
 * @param {string} columnText - Full column text
 * @param {string} sectionName - Section name to extract
 * @returns {string} - Section content
 */
function extractSection(columnText, sectionName) {
  const pattern = new RegExp(
    `=====\\s*${sectionName}\\s*=====([\\s\\S]*?)(?=\\n=====|$)`,
    "i"
  );
  const match = columnText.match(pattern);
  return match ? match[1].trim() : "";
}

/**
 * Parse CAL EVENTS section into categories with hours
 * @param {string} sectionContent - CAL EVENTS section content
 * @returns {Array} - Array of {category, hours, events, content}
 */
function parseCalEvents(sectionContent) {
  const categories = [];
  const lines = sectionContent.split("\n").filter((line) => line.trim());

  let currentCategory = null;

  for (const line of lines) {
    // Check if this is a category header (contains hours info)
    if (line.includes("(") && line.includes("hours)")) {
      const hours = parseHours(line);
      const categoryName = line.split("(")[0].trim().replace(":", "");

      currentCategory = {
        category: categoryName,
        hours,
        events: [],
        content: line,
      };
      categories.push(currentCategory);
    } else if (currentCategory && line.trim()) {
      // This is an event under the current category
      currentCategory.events.push(line.trim());
      currentCategory.content += "\n" + line;
    }
  }

  return categories;
}

/**
 * Parse TASKS section into categories with counts
 * @param {string} sectionContent - TASKS section content
 * @returns {Array} - Array of {category, count, tasks, content}
 */
function parseTasks(sectionContent) {
  const categories = [];
  const lines = sectionContent.split("\n").filter((line) => line.trim());

  let currentCategory = null;

  for (const line of lines) {
    // Check if this is a category header (contains count info)
    if (line.includes("(") && line.includes(")") && /\(\d+\)/.test(line)) {
      const count = parseTaskCount(line);
      const categoryName = line.split("(")[0].trim();

      currentCategory = {
        category: categoryName,
        count,
        tasks: [],
        content: line,
      };
      categories.push(currentCategory);
    } else if (currentCategory && line.trim()) {
      // This is a task list under the current category
      currentCategory.tasks.push(line.trim());
      currentCategory.content += "\n" + line;
    }
  }

  return categories;
}

/**
 * Combine and evaluate a section based on its type
 * @param {string} sectionName - Name of the section
 * @param {string} goodContent - Content from good column
 * @param {string} badContent - Content from bad column
 * @param {Object} config - Configuration object
 * @returns {string} - Combined and evaluated section content
 */
function combineSection(sectionName, goodContent, badContent, config) {
  const sectionType = config.sectionTypes[sectionName] || "simple";

  switch (sectionType) {
    case "simple":
      // Special handling for EVENTS: sort items by day-of-week across good+bad
      if (sectionName === "EVENTS") {
        return combineEventsSection(goodContent, badContent, config);
      }
      return combineSimpleSection(goodContent, badContent, config);

    case "calEvents":
      return combineCalEventsSection(goodContent, badContent, config);

    case "tasks":
      return combineTasksSection(goodContent, badContent, config);

    case "habits":
      return combineHabitsSection(goodContent, badContent, config);

    default:
      return combineSimpleSection(goodContent, badContent, config);
  }
}

/**
 * Combine simple sections (TRIPS, EVENTS, ROCKS)
 */
function combineSimpleSection(goodContent, badContent, config) {
  const combined = [];

  if (goodContent && goodContent.trim()) {
    combined.push(goodContent.trim());
  }

  if (badContent && badContent.trim()) {
    combined.push(badContent.trim());
  }

  return combined.join(config.formatting.itemSeparator);
}

/**
 * Combine EVENTS with day-of-week sorting across good + bad items
 */
function combineEventsSection(goodContent, badContent, config) {
  const items = [];
  if (goodContent && goodContent.trim()) {
    items.push(...goodContent.split("\n").filter((l) => l.trim()));
  }
  if (badContent && badContent.trim()) {
    items.push(...badContent.split("\n").filter((l) => l.trim()));
  }

  const sorted = items.sort((a, b) => getDayIndex(a) - getDayIndex(b));
  return sorted.join(config.formatting.itemSeparator);
}

/**
 * Combine CAL EVENTS sections with evaluations
 */
function combineCalEventsSection(goodContent, badContent, config) {
  const allCategories = new Map();

  // Parse categories from both good and bad content
  if (goodContent) {
    const goodCategories = parseCalEvents(goodContent);
    goodCategories.forEach((cat) => {
      allCategories.set(cat.category, cat);
    });
  }

  if (badContent) {
    const badCategories = parseCalEvents(badContent);
    badCategories.forEach((cat) => {
      if (allCategories.has(cat.category)) {
        // Combine with existing
        const existing = allCategories.get(cat.category);
        existing.hours += cat.hours;
        existing.events.push(...cat.events);
        existing.content += "\n" + cat.content;
      } else {
        allCategories.set(cat.category, cat);
      }
    });
  }

  // Generate output with evaluations
  let output = "";
  const ranges = config.evaluationRules.calEvents.categories.ranges;

  for (const [categoryName, category] of allCategories) {
    const evaluation = getEvaluationLabel(category.hours, ranges);
    output +=
      config.formatting.categoryHeader(evaluation, categoryName) +
      ` (${category.hours} hours)` +
      "\n";
    // Sort events by day-of-week (Sun -> Sat) if a day token exists
    const sortedEvents = [...category.events].sort((a, b) => {
      return getDayIndex(a) - getDayIndex(b);
    });
    output += sortedEvents.join("\n") + "\n\n";
  }

  return output.trim();
}

/**
 * Combine TASKS sections with evaluations
 */
function combineTasksSection(goodContent, badContent, config) {
  const allCategories = new Map();

  // Parse categories from both good and bad content
  if (goodContent) {
    const goodCategories = parseTasks(goodContent);
    goodCategories.forEach((cat) => {
      allCategories.set(cat.category, cat);
    });
  }

  if (badContent) {
    const badCategories = parseTasks(badContent);
    badCategories.forEach((cat) => {
      if (allCategories.has(cat.category)) {
        // Combine with existing
        const existing = allCategories.get(cat.category);
        existing.count += cat.count;
        existing.tasks.push(...cat.tasks);
        existing.content += "\n" + cat.content;
      } else {
        allCategories.set(cat.category, cat);
      }
    });
  }

  // Generate output with evaluations
  let output = "";
  const ranges = config.evaluationRules.tasks.categories.ranges;

  for (const [categoryName, category] of allCategories) {
    const evaluation = getEvaluationLabel(category.count, ranges);
    output +=
      config.formatting.categoryHeader(evaluation, categoryName) +
      ` (${category.count})` +
      "\n";
    output += category.tasks.join("\n") + "\n\n";
  }

  return output.trim();
}

/**
 * Combine HABITS sections with scoring evaluation
 */
function combineHabitsSection(goodContent, badContent, config) {
  const allHabits = [];

  if (goodContent) {
    const goodLines = goodContent.split("\n").filter((line) => line.trim());
    allHabits.push(...goodLines);
  }

  if (badContent) {
    const badLines = badContent.split("\n").filter((line) => line.trim());
    allHabits.push(...badLines);
  }

  const evaluation = evaluateHabits(allHabits, config);

  let output = evaluation.evaluation + "\n";
  output += allHabits.join("\n");

  return output;
}

module.exports = {
  parseHours,
  parseTaskCount,
  evaluateHabits,
  getEvaluationLabel,
  extractSection,
  parseCalEvents,
  parseTasks,
  combineSection,
};
