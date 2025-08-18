/**
 * Monthly aggregation functions for retro scripts
 * Handles combining weekly data into monthly summaries and evaluating habits
 */

/**
 * Generic monthly aggregation function
 * Routes to specific aggregation logic based on section type
 */
function aggregateMonthlyData(weeklyArrays, sectionName, config) {
  if (!Array.isArray(weeklyArrays) || weeklyArrays.length === 0) {
    return [];
  }

  switch (sectionName) {
    case "HABITS":
      return aggregateHabits(weeklyArrays);
    case "CAL_SUMMARY":
      return aggregateCalSummary(weeklyArrays, weeklyArrays.length);
    case "CAL_EVENTS":
      return aggregateCalEvents(weeklyArrays, weeklyArrays.length);
    case "TASKS":
      return aggregateTasksMonthly(weeklyArrays);
    default:
      // For other sections (TRIPS, EVENTS, ROCKS, TASKS), just concatenate
      return concatenateWeeklyData(weeklyArrays);
  }
}

/**
 * Simple concatenation for sections that don't need special aggregation
 */
function concatenateWeeklyData(weeklyArrays) {
  const allItems = [];
  weeklyArrays.forEach((weekArray) => {
    if (Array.isArray(weekArray)) {
      allItems.push(...weekArray);
    }
  });
  return allItems;
}

/**
 * Extract habit core pattern (remove specific numbers/details)
 * e.g. "🛌 Bad sleeping habits (1 early wake ups, 6 days sleeping in)"
 * becomes "🛌 Bad sleeping habits"
 */
function extractHabitCore(item) {
  if (!item || typeof item !== "string") return null;

  // Remove parenthetical details
  const coreMatch = item.match(/^[✅❌⚠️]?\s*(.+?)\s*\(/);
  if (coreMatch) {
    return coreMatch[1].trim();
  }

  // Fallback: return everything before first parenthesis
  const parenIndex = item.indexOf("(");
  if (parenIndex !== -1) {
    return item
      .substring(0, parenIndex)
      .trim()
      .replace(/^[✅❌⚠️]\s*/, "");
  }

  return item.trim().replace(/^[✅❌⚠️]\s*/, "");
}

/**
 * Aggregate CAL SUMMARY data
 * Combine category totals (events + hours) and count no-item occurrences
 */
function aggregateCalSummary(weeklyArrays, totalWeeks) {
  const categoryTotals = new Map(); // category -> {events, hours}
  const noItemCounts = new Map(); // "No X Time" -> count
  const aggregated = [];

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      // Pattern: "Category (X events, Y hours)"
      const eventHoursMatch = item.match(
        /^[✅❌☑️⚠️]?\s*(.+?)\s*\((\d+)\s+events?,\s*([\d.]+)\s+hours?\):?\s*$/
      );

      if (eventHoursMatch) {
        const category = eventHoursMatch[1].trim();
        const events = parseInt(eventHoursMatch[2]);
        const hours = parseFloat(eventHoursMatch[3]);

        if (!categoryTotals.has(category)) {
          categoryTotals.set(category, { events: 0, hours: 0 });
        }

        const totals = categoryTotals.get(category);
        totals.events += events;
        totals.hours += hours;
      }
      // Pattern: "No X Time" (zero items)
      else if (item.match(/^No .+ Time$/)) {
        const noItem = item.trim();
        noItemCounts.set(noItem, (noItemCounts.get(noItem) || 0) + 1);
      }
      // Other items that don't match patterns - keep as is for now
      else {
        // Could be other cal summary items, we'll just pass them through
        if (!aggregated.includes(item.trim())) {
          aggregated.push(item.trim());
        }
      }
    });
  });

  // Add aggregated category totals
  categoryTotals.forEach((totals, category) => {
    aggregated.push(
      `${category} (${totals.events} events, ${totals.hours.toFixed(
        1
      )} hours total)`
    );
  });

  // Add no-item counts
  noItemCounts.forEach((count, noItem) => {
    aggregated.push(`${noItem} (${count}/${totalWeeks} weeks)`);
  });

  return aggregated;
}

/**
 * Aggregate CAL EVENTS data
 * Similar to CAL SUMMARY but for calendar events
 */
function aggregateCalEvents(weeklyArrays, totalWeeks) {
  const categoryTotals = new Map();
  const aggregated = [];

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      // Pattern: "Category (X events, Y hours)" on the header line
      // Items from weekly extraction can be multi-line: first line is header, following lines are details
      const headerLine = item.split("\n")[0].trim();
      const eventHoursMatch = headerLine.match(
        /^[✅❌☑️⚠️]?\s*(.+?)\s*\((\d+)\s+events?,\s*([\d.]+)\s+hours?\)/
      );

      if (eventHoursMatch) {
        const category = eventHoursMatch[1].trim();
        const events = parseInt(eventHoursMatch[2]);
        const hours = parseFloat(eventHoursMatch[3]);

        if (!categoryTotals.has(category)) {
          categoryTotals.set(category, { events: 0, hours: 0 });
        }

        const totals = categoryTotals.get(category);
        totals.events += events;
        totals.hours += hours;
      }
    });
  });

  // Add aggregated category totals
  categoryTotals.forEach((totals, category) => {
    aggregated.push(
      `${category} (${totals.events} events, ${totals.hours.toFixed(
        1
      )} hours total)`
    );
  });

  return aggregated;
}

/**
 * Aggregate TASKS data monthly
 * Sum weekly counts per category and suppress item details.
 * Supports headers like:
 *   "Category (7/10)" or "Category (7)"
 * Items may come as multi-line strings: first line header, following line contains comma-separated tasks.
 */
function aggregateTasksMonthly(weeklyArrays) {
  const categoryTotals = new Map(); // category -> { done: number, total: number | null }
  const order = []; // preserve first-seen order of categories

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      const headerLine = item.split("\n")[0].trim();
      const match = headerLine.match(
        /^\s*[^A-Za-z0-9]*\s*(.+?)\s*\((\d+)(?:\/(\d+))?\)\s*$/
      );
      if (!match) return;

      const rawCategory = match[1].trim();
      const doneCount = parseInt(match[2], 10);
      const totalCount = match[3] ? parseInt(match[3], 10) : null;

      if (!categoryTotals.has(rawCategory)) {
        categoryTotals.set(rawCategory, { done: 0, total: totalCount });
        order.push(rawCategory);
      }

      const totals = categoryTotals.get(rawCategory);
      totals.done += isNaN(doneCount) ? 0 : doneCount;
      if (totalCount !== null) {
        if (totals.total === null) {
          totals.total = 0;
        }
        totals.total += isNaN(totalCount) ? 0 : totalCount;
      }
    });
  });

  const aggregated = [];
  order.forEach((category) => {
    const totals = categoryTotals.get(category);
    if (!totals) return;
    if (totals.total !== null && totals.total !== undefined) {
      aggregated.push(`${category} (${totals.done}/${totals.total})`);
    } else {
      aggregated.push(`${category} (${totals.done})`);
    }
  });

  return aggregated;
}

/**
 * Aggregate HABITS data
 * Count how many weeks each habit appears and format as "Habit (X/Y weeks)"
 */
function aggregateHabits(weeklyArrays) {
  const habitCounts = new Map(); // habit pattern -> count
  const totalWeeks = weeklyArrays.length;

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    const weekHabits = new Set(); // Track unique habits per week to avoid double counting

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      // Extract the core habit pattern (remove specific numbers/details)
      // e.g. "🛌 Bad sleeping habits (1 early wake ups, 6 days sleeping in)"
      // becomes "🛌 Bad sleeping habits"
      const coreHabit = extractHabitCore(item);

      if (coreHabit && !weekHabits.has(coreHabit)) {
        weekHabits.add(coreHabit);
        habitCounts.set(coreHabit, (habitCounts.get(coreHabit) || 0) + 1);
      }
    });
  });

  const aggregated = [];
  habitCounts.forEach((count, habit) => {
    aggregated.push(`${habit} (${count}/${totalWeeks} weeks)`);
  });

  return aggregated;
}

/**
 * Aggregate Monthly Habits data from the "Monthly Habits" formula
 * Parses clean habit data and evaluates good vs bad based on thresholds
 */
function aggregateMonthlyHabits(monthlyHabitsData, weekCount, config) {
  if (!monthlyHabitsData || !monthlyHabitsData.trim()) {
    return { good: [], bad: [] };
  }

  const goodHabits = [];
  const badHabits = [];

  // Get evaluation rules from config
  const habitRules = config.monthlyHabitEvals || {};

  // Parse each habit pattern
  Object.entries(habitRules).forEach(([habitName, rule]) => {
    const match = monthlyHabitsData.match(rule.pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const evaluation = evaluateHabit(habitName, value, weekCount, rule);

      // Create formatted habit string
      const habitString = match[0]; // Use the full match (e.g., "🌅 7 early wake up")

      if (evaluation === "good") {
        goodHabits.push(habitString);
      } else if (evaluation === "bad") {
        badHabits.push(habitString);
      }
      // Skip 'warning' habits (they don't go in either column)
    }
  });

  return { good: goodHabits, bad: badHabits };
}

/**
 * Evaluate Monthly Habits data from raw monthly habit string
 * Parses habit data and evaluates good vs bad based on config thresholds and week count
 */
function evaluateMonthlyHabits(monthlyHabitsData, weekCount, config) {
  if (!monthlyHabitsData || !monthlyHabitsData.trim()) {
    return { good: [], bad: [] };
  }

  const goodHabits = [];
  const badHabits = [];

  // Get evaluation rules from config
  const habitRules = config.monthlyHabitEvals || {};

  // Process each habit rule
  Object.entries(habitRules).forEach(([habitName, rule]) => {
    if (habitName === "hobbyHabits") {
      // Handle complex hobby scoring separately
      const hobbyResult = evaluateHobbyHabits(
        monthlyHabitsData,
        weekCount,
        rule
      );
      if (hobbyResult.evaluation === "good") {
        goodHabits.push(hobbyResult.habitString);
      } else if (hobbyResult.evaluation === "bad") {
        badHabits.push(hobbyResult.habitString);
      }
      // Skip 'warning' habits
    } else {
      // Handle simple single-pattern habits
      const match = monthlyHabitsData.match(rule.pattern);
      if (match) {
        const value = parseFloat(match[1]);
        const evaluation = evaluateHabit(habitName, value, weekCount, rule);

        // Create formatted habit string like "✅ 🛌 Good sleeping habits (🌅 7 early wake up)"
        const status =
          evaluation === "good" ? "✅" : evaluation === "bad" ? "❌" : "⚠️";
        const description =
          evaluation === "good"
            ? `Good ${rule.description}`
            : evaluation === "bad"
            ? `Bad ${rule.description}`
            : `Not great ${rule.description}`;
        const habitString = `${status} ${rule.emoji} ${description} (${match[0]})`;

        if (evaluation === "good") {
          goodHabits.push(habitString);
        } else if (evaluation === "bad") {
          badHabits.push(habitString);
        }
        // Skip 'warning' habits
      }
    }
  });

  return { good: goodHabits, bad: badHabits };
}

/**
 * Handle hobby habits with complex scoring
 */
function evaluateHobbyHabits(monthlyHabitsData, weekCount, rule) {
  // Extract individual hobby days
  const hobbyValues = {};
  let hobbyDetails = [];

  // Extract each hobby type
  Object.entries(rule.patterns).forEach(([hobbyType, pattern]) => {
    const match = monthlyHabitsData.match(pattern);
    if (match) {
      const days = parseInt(match[1]);
      hobbyValues[hobbyType] = days;
      hobbyDetails.push(`${days} days ${hobbyType}`);
    } else {
      hobbyValues[hobbyType] = 0;
    }
  });

  // Calculate total score (good hobbies - bad hobbies)
  const goodDays =
    (hobbyValues.coding || 0) +
    (hobbyValues.reading || 0) +
    (hobbyValues.art || 0);
  const badDays = hobbyValues.gaming || 0;
  const totalScore = goodDays - badDays;

  // Scale thresholds by week count
  const goodThreshold = rule.goodPerWeek * weekCount;
  const warningThreshold = rule.warningPerWeek * weekCount;

  let evaluation;
  if (totalScore > goodThreshold) {
    evaluation = "good";
  } else if (totalScore >= warningThreshold) {
    evaluation = "warning";
  } else {
    evaluation = "bad";
  }

  // Create formatted string
  const status =
    evaluation === "good" ? "✅" : evaluation === "bad" ? "❌" : "⚠️";
  const description =
    evaluation === "good"
      ? `Good ${rule.description}`
      : evaluation === "bad"
      ? `Bad ${rule.description}`
      : `Not great ${rule.description}`;

  const detailsString =
    hobbyDetails.length > 0 ? hobbyDetails.join(", ") : "no hobby data";
  const habitString = `${status} ${rule.emoji} ${description} (${detailsString})`;

  return { evaluation, habitString };
}

/**
 * Evaluate a single habit based on its rule and week count
 */
function evaluateHabit(habitName, value, weekCount, rule) {
  // Handle per-week thresholds (scale by week count)
  if (rule.goodPerWeek !== undefined) {
    const goodThreshold = rule.goodPerWeek * weekCount;
    const warningThreshold = rule.warningPerWeek * weekCount;

    if (value >= goodThreshold) {
      return "good";
    } else if (value >= warningThreshold) {
      return "warning";
    } else {
      return "bad";
    }
  }

  // Handle absolute thresholds (don't scale)
  if (rule.goodAbsolute !== undefined) {
    const operator = rule.operator || ">=";

    if (operator === "<=") {
      // For things like weight where lower is better
      if (value <= rule.goodAbsolute) {
        return "good";
      } else if (value < rule.warningAbsolute) {
        return "warning";
      } else {
        return "bad";
      }
    } else {
      // For things where higher is better
      if (value >= rule.goodAbsolute) {
        return "good";
      } else if (value >= rule.warningAbsolute) {
        return "warning";
      } else {
        return "bad";
      }
    }
  }

  return "warning"; // Default to warning if no rule matches
}

module.exports = {
  aggregateMonthlyData,
  aggregateHabits,
  aggregateCalSummary,
  aggregateCalEvents,
  aggregateTasksMonthly,
  aggregateMonthlyHabits,
  evaluateMonthlyHabits,
  evaluateHabit,
  evaluateHobbyHabits,
  extractHabitCore,
};
