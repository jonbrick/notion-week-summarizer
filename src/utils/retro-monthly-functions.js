/**
 * Monthly aggregation functions for retro data
 *
 * These functions take arrays of weekly data (already extracted and filtered)
 * and aggregate them into monthly summaries by:
 * - Summing numbers (events, hours, tasks)
 * - Counting occurrences across weeks
 * - Deduplicating repeated items
 */

/**
 * Remove day of week references from text
 * Removes patterns like "on Sun", "on Monday", "on Tue", etc.
 */
function removeDaysOfWeek(text) {
  // Remove ALL occurrences of " on [Day]" patterns (global flag)
  return (
    text
      .replace(
        /\s+on\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/gi,
        ""
      )
      // Also remove standalone day references at the end like " - Tue"
      .replace(
        /\s*-\s*(Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)(?:\s|$)/gi,
        ""
      )
      .trim()
  );
}

/**
 * Aggregate CAL_SUMMARY data
 * Handles patterns like:
 * - "Personal Time (11 events, 17.3 hours):" -> sum across weeks
 * - "No Video Game Time" -> count occurrences
 */
function aggregateCalSummary(weeklyArrays) {
  const aggregated = [];
  const categoryTotals = new Map(); // category -> {events: number, hours: number}
  const noItemCounts = new Map(); // "No X Time" -> count

  const totalWeeks = weeklyArrays.length;

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      // Pattern: "Category Name (X events, Y hours):"
      const eventHoursMatch = item.match(
        /^(.+?)\s*\((\d+)\s+events?,\s*(\d+(?:\.\d+)?)\s+hours?\):?\s*$/
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

/**
 * Handle hobby habits with complex scoring
 */
function evaluateHobbyHabits(monthlyHabitsData, weekCount) {
  // Extract individual hobby days
  const codingMatch = monthlyHabitsData.match(/💻 (\d+) days coding/);
  const readingMatch = monthlyHabitsData.match(/📖 (\d+) days reading/);
  const artMatch = monthlyHabitsData.match(/🎨 (\d+) days making art/);
  const gamingMatch = monthlyHabitsData.match(
    /🎮 (\d+) days playing video games/
  );

  const codingDays = codingMatch ? parseInt(codingMatch[1]) : 0;
  const readingDays = readingMatch ? parseInt(readingMatch[1]) : 0;
  const artDays = artMatch ? parseInt(artMatch[1]) : 0;
  const gamingDays = gamingMatch ? parseInt(gamingMatch[1]) : 0;

  // Calculate total score (good hobbies - bad hobbies)
  const totalScore = codingDays + readingDays + artDays - gamingDays;

  // Scale thresholds by week count (weekly thresholds: >5 = good, >=1 = warning)
  const goodThreshold = 5 * weekCount;
  const warningThreshold = 1 * weekCount;

  let evaluation;
  if (totalScore > goodThreshold) {
    evaluation = "good";
  } else if (totalScore >= warningThreshold) {
    evaluation = "warning";
  } else {
    evaluation = "bad";
  }

  // Create a combined hobby habits string
  const hobbyDetails = [
    codingDays > 0 ? `${codingDays} days coding` : "0 days coding",
    readingDays > 0 ? `${readingDays} days reading` : "0 days reading",
    artDays > 0 ? `${artDays} days making art` : "0 days making art",
    gamingDays > 0
      ? `${gamingDays} days playing video games`
      : "0 days playing video games",
  ].join(", ");

  const habitString = `📖 hobby habits (${hobbyDetails})`;

  return { evaluation, habitString };
}

/**
 * Aggregate CAL_EVENTS data
 * Handles patterns like:
 * - "Category (X events, Y hours):\nEvent1, Event2" -> sum and combine
 */
function aggregateCalEvents(weeklyArrays, config) {
  const categoryData = new Map(); // category -> {events: number, hours: number, eventsList: Set}

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      // Pattern: "Category (X events, Y hours):\nEvent list"
      const lines = item.split("\n");
      if (lines.length < 2) return;

      const headerLine = lines[0];
      const eventsLine = lines.slice(1).join("\n"); // Rest is events

      // Parse header: "Category (X events, Y hours):"
      const headerMatch = headerLine.match(
        /^(.+?)\s*\((\d+)\s+events?,\s*(\d+(?:\.\d+)?)\s+hours?\):?\s*$/
      );

      if (headerMatch) {
        const category = headerMatch[1].trim();
        const events = parseInt(headerMatch[2]);
        const hours = parseFloat(headerMatch[3]);

        if (!categoryData.has(category)) {
          categoryData.set(category, {
            events: 0,
            hours: 0,
            eventsList: new Set(),
          });
        }

        const data = categoryData.get(category);
        data.events += events;
        data.hours += hours;

        // Add individual events to the set (split by comma and clean)
        if (eventsLine.trim()) {
          const individualEvents = eventsLine
            .split(",")
            .map((e) => e.trim())
            .filter((e) => e);
          individualEvents.forEach((event) => {
            // Remove days of week from each event
            const cleanEvent = removeDaysOfWeek(event);
            data.eventsList.add(cleanEvent);
          });
        }
      }
    });
  });

  const aggregated = [];
  categoryData.forEach((data, category) => {
    // Check if this category should hide event details
    const hideDetails =
      config &&
      config.calEventsHideDetails &&
      config.calEventsHideDetails.includes(category);

    if (hideDetails) {
      // Only show totals for this category
      aggregated.push(
        `${category} (${data.events} events, ${data.hours.toFixed(
          1
        )} hours total)`
      );
    } else {
      // Show totals + event list for this category
      const eventsList = Array.from(data.eventsList).join(", ");
      aggregated.push(
        `${category} (${data.events} events, ${data.hours.toFixed(
          1
        )} hours total):\n${eventsList}`
      );
    }
  });

  return aggregated;
}

/**
 * Aggregate ROCKS and EVENTS data by deduplicating
 * These should just be unique lists without repetition
 */
function aggregateRocksAndEvents(weeklyArrays) {
  const uniqueItems = new Set();

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (item && typeof item === "string") {
        // Remove days of week before adding to set
        const cleanItem = removeDaysOfWeek(item.trim());
        uniqueItems.add(cleanItem);
      }
    });
  });

  // Join with commas instead of letting formatMonthlyRetro use newlines
  const itemsArray = Array.from(uniqueItems);
  return itemsArray.length > 0 ? [itemsArray.join(", ")] : [];
}

/**
 * Aggregate TASKS data
 * Sum up task counts and optionally show task details based on config
 */
function aggregateTasks(weeklyArrays, config) {
  const categoryTotals = new Map(); // category -> total count
  const categoryTasks = new Map(); // category -> Set of task details

  weeklyArrays.forEach((weekArray) => {
    if (!Array.isArray(weekArray)) return;

    weekArray.forEach((item) => {
      if (!item || typeof item !== "string") return;

      // Split by newlines to get the header line and task details
      const lines = item.split("\n");
      const headerLine = lines[0]; // First line has the category and count
      const taskDetails = lines.slice(1).join("\n"); // Rest are task details

      // Pattern: "Category Tasks (X)"
      const taskMatch = headerLine.match(/^(.+?)\s*\((\d+)\)\s*$/);

      if (taskMatch) {
        const category = taskMatch[1].trim();
        const count = parseInt(taskMatch[2]);

        categoryTotals.set(
          category,
          (categoryTotals.get(category) || 0) + count
        );

        // Store task details if this category should show them
        if (
          config &&
          config.tasksShowDetails &&
          config.tasksShowDetails.includes(category)
        ) {
          if (!categoryTasks.has(category)) {
            categoryTasks.set(category, new Set());
          }

          // Split task details by comma and add to set (also remove days)
          if (taskDetails.trim()) {
            const individualTasks = taskDetails
              .split(",")
              .map((t) => t.trim())
              .filter((t) => t);
            individualTasks.forEach((task) => {
              const cleanTask = removeDaysOfWeek(task);
              categoryTasks.get(category).add(cleanTask);
            });
          }
        }
      }
    });
  });

  const aggregated = [];
  categoryTotals.forEach((total, category) => {
    // Check if this category should show task details
    const showDetails =
      config &&
      config.tasksShowDetails &&
      config.tasksShowDetails.includes(category);

    if (showDetails && categoryTasks.has(category)) {
      // Show totals + task list for this category
      const tasksList = Array.from(categoryTasks.get(category)).join(", ");
      aggregated.push(`${category}: ${total} total\n${tasksList}`);
    } else {
      // Only show totals for this category
      aggregated.push(`${category}: ${total} total`);
    }
  });

  return aggregated;
}

/**
 * Main aggregation function that routes to specific aggregators based on section type
 */
function aggregateMonthlyData(
  weeklyArrays,
  sectionName,
  config,
  monthlyHabitsData,
  weekCount
) {
  if (!Array.isArray(weeklyArrays) || weeklyArrays.length === 0) {
    return [];
  }

  switch (sectionName.toUpperCase()) {
    case "CAL_SUMMARY":
      return aggregateCalSummary(weeklyArrays);

    case "HABITS":
      // Use Monthly Habits formula data instead of weekly aggregation
      if (monthlyHabitsData && weekCount) {
        const habitResults = aggregateMonthlyHabits(
          monthlyHabitsData,
          weekCount,
          config
        );
        // Return good or bad habits based on current mode (this will be handled by caller)
        return habitResults; // Return the object so caller can pick good/bad
      }
      return aggregateHabits(weeklyArrays); // Fallback to old method

    case "CAL_EVENTS":
      return aggregateCalEvents(weeklyArrays, config);

    case "ROCKS":
    case "EVENTS":
      return aggregateRocksAndEvents(weeklyArrays);

    case "TASKS":
      return aggregateTasks(weeklyArrays, config);

    case "TRIPS":
      // Trips are usually unique, just deduplicate
      return aggregateRocksAndEvents(weeklyArrays);

    default:
      // Unknown section, just deduplicate
      return aggregateRocksAndEvents(weeklyArrays);
  }
}

module.exports = {
  aggregateMonthlyData,
  aggregateCalSummary,
  aggregateHabits,
  aggregateRocksAndEvents,
  aggregateCalEvents,
  aggregateTasks,
};
