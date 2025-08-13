const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("./src/utils/notion-utils");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default configuration
const DEFAULT_TARGET_WEEKS = [1];
let TARGET_WEEKS = DEFAULT_TARGET_WEEKS;
let SELECTED_DATA_SOURCES = "both"; // both, task-summary, cal-summary

console.log("📊 Personal Data Summarizer - Clean Version");

// Task Summary Configuration
const taskSummaryConfig = [
  {
    type: "single",
    key: "tripDetails",
    include: true,
    order: 1,
    title: "TRIPS",
  },
  {
    type: "single",
    key: "eventDetails",
    include: true,
    order: 2,
    title: "EVENTS",
  },
  {
    type: "single",
    key: "habitsDetails",
    include: true,
    order: 3,
    title: "HABITS",
  },
  {
    type: "single",
    key: "rockDetails",
    include: true,
    order: 4,
    title: "ROCKS",
  },
  {
    type: "taskBreakdown",
    key: "personalTasks",
    include: true,
    order: 5,
    title: "SUMMARY",
  },
];

// Task Categories Configuration
const taskCategoriesConfig = [
  { category: "Personal Tasks", include: true, order: 1 },
  { category: "Physical Health Tasks", include: true, order: 2 },
  { category: "Interpersonal Tasks", include: false, order: 3 }, // DISABLED
  { category: "Mental Health Tasks", include: false, order: 4 },
  { category: "Home Tasks", include: true, order: 5 }, // DISABLED
];

// Interpersonal Events Grouping Configuration
const interpersonalGroupingConfig = {
  general: {
    displayName: "Interpersonal events",
    precedence: 1, // Lowest priority - catch-all
    order: 1, // Display first
    include: true,
  },
  relationships: {
    keywords: ["jen", "jen rothman", "jenn"],
    displayName: "Relationships",
    precedence: 2, // Trumps general only
    order: 2, // Display second
    include: true,
  },
  family: {
    keywords: ["mom", "dad", "vicki", "evan", "fam", "vick"],
    displayName: "Family",
    precedence: 3, // Trumps relationships and general
    order: 3, // Display third
    include: true,
  },
  calls: {
    keywords: ["call", "facetime", "ft"],
    displayName: "Calls",
    precedence: 4, // Highest - trumps everything
    order: 4, // Display last
    include: true,
  },
};

// Calendar Event Evaluation Functions
function evaluateZeroIsGood(eventCount) {
  if (eventCount === 0) return "✅";
  if (eventCount > 0) return "❌";
}

function evaluateZeroIsBad(eventCount) {
  if (eventCount === 0) return "❌";
  if (eventCount > 0) return "✅";
}

function evaluateDontCare(eventCount) {
  return "☑️";
}

function evaluateCareSometimes(eventCount) {
  if (eventCount > 1) return "✅";
  return "☑️";
}

// Cal Summary Configuration
const calSummaryConfig = [
  {
    key: "personalEvents",
    include: false,
    order: 1,
    displayName: "Personal events",
    evaluation: evaluateDontCare,
  },
  {
    key: "homeEvents",
    include: false,
    order: 2,
    displayName: "Home events",
    evaluation: evaluateDontCare,
  },
  {
    key: "interpersonalEvents",
    include: true,
    order: 3,
    displayName: "Interpersonal events",
    evaluation: evaluateCareSometimes,
    useGrouping: true, // Special flag for interpersonal grouping
  },
  {
    key: "mentalHealthEvents",
    include: true,
    order: 4,
    displayName: "Mental health events",
    evaluation: evaluateCareSometimes,
  },
  {
    key: "physicalHealthEvents",
    include: true,
    order: 5,
    displayName: "Physical health events",
    evaluation: evaluateZeroIsBad,
  },
  {
    key: "workoutEvents",
    include: true,
    order: 6,
    displayName: "Workout events",
    evaluation: evaluateZeroIsBad,
  },
  {
    key: "readingEvents",
    include: true,
    order: 7,
    displayName: "Reading events",
    evaluation: evaluateZeroIsBad,
  },
  {
    key: "videoGameEvents",
    include: true,
    order: 8,
    displayName: "Video game events",
    evaluation: evaluateZeroIsGood,
  },
  {
    key: "personalPREvents",
    include: true,
    order: 9,
    displayName: "Personal PR events",
    evaluation: evaluateCareSometimes,
  },
];

/**
 * Process a single week
 */
async function processWeek(weekNumber) {
  try {
    console.log(`\n📊 === PROCESSING WEEK ${weekNumber} ===`);

    // Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      console.log(`❌ Could not find Week ${weekNumber} Recap`);
      return;
    }

    const paddedWeek = weekNumber.toString().padStart(2, "0");
    console.log(`✅ Found Week ${paddedWeek} Recap!`);

    // Read existing data populated by @pull-data-personal
    const existingData = {
      personalTasks:
        targetWeekPage.properties["Personal Tasks"]?.rich_text?.[0]
          ?.plain_text || "",
      personalEvents:
        targetWeekPage.properties["Personal Events"]?.rich_text?.[0]
          ?.plain_text || "",
      interpersonalEvents:
        targetWeekPage.properties["Interpersonal Events"]?.rich_text?.[0]
          ?.plain_text || "",
      homeEvents:
        targetWeekPage.properties["Home Events"]?.rich_text?.[0]?.plain_text ||
        "",
      physicalHealthEvents:
        targetWeekPage.properties["Physical Health Events"]?.rich_text?.[0]
          ?.plain_text || "",
      mentalHealthEvents:
        targetWeekPage.properties["Mental Health Events"]?.rich_text?.[0]
          ?.plain_text || "",
      workoutEvents:
        targetWeekPage.properties["Workout Events"]?.rich_text?.[0]
          ?.plain_text || "",
      readingEvents:
        targetWeekPage.properties["Reading Events"]?.rich_text?.[0]
          ?.plain_text || "",
      videoGameEvents:
        targetWeekPage.properties["Video Game Events"]?.rich_text?.[0]
          ?.plain_text || "",
      personalPREvents:
        targetWeekPage.properties["Personal PR Events"]?.rich_text?.[0]
          ?.plain_text || "",
      habitsDetails:
        targetWeekPage.properties["Habits Details"]?.formula?.string || "",
      tripDetails:
        targetWeekPage.properties["Trip Details"]?.formula?.string || "",
      eventDetails:
        targetWeekPage.properties["Event Details"]?.formula?.string || "",
      rockDetails:
        targetWeekPage.properties["Rock Details"]?.formula?.string || "",
      // Habit number columns
      earlyWakeup: targetWeekPage.properties["Early Wakeup"]?.number || 0,
      sleepIn: targetWeekPage.properties["Sleep In"]?.number || 0,
      workout: targetWeekPage.properties["Workout"]?.number || 0,
      soberDays: targetWeekPage.properties["Sober Days"]?.number || 0,
      drinkingDays: targetWeekPage.properties["Drinking Days"]?.number || 0,
      bodyWeight: targetWeekPage.properties["Body Weight"]?.number || null,
    };

    // Object to store generated summaries
    const summaries = {};

    // Generate Personal Task Summary
    if (
      SELECTED_DATA_SOURCES === "both" ||
      SELECTED_DATA_SOURCES === "task-summary"
    ) {
      console.log("📝 Generating Personal Task Summary...");
      summaries["Personal Task Summary"] =
        generatePersonalTaskSummary(existingData);
    }

    // Generate Personal Cal Summary
    if (
      SELECTED_DATA_SOURCES === "both" ||
      SELECTED_DATA_SOURCES === "cal-summary"
    ) {
      console.log("📅 Generating Personal Cal Summary...");
      summaries["Personal Cal Summary"] =
        generatePersonalCalSummary(existingData);
    }

    // Update Notion with generated summaries
    console.log("\n📝 Updating Notion with summaries...");
    const properties = {};

    for (const [fieldName, content] of Object.entries(summaries)) {
      properties[fieldName] = {
        rich_text: [
          {
            text: {
              content: content.substring(0, 2000), // Notion limit
            },
          },
        ],
      };
    }

    await notion.pages.update({
      page_id: targetWeekPage.id,
      properties: properties,
    });

    console.log(
      `✅ Successfully updated Week ${paddedWeek} with personal summaries!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
}

/**
 * Generate Personal Task Summary using config
 */
function generatePersonalTaskSummary(data) {
  let summary = "";

  const enabledSections = taskSummaryConfig
    .filter((section) => section.include)
    .sort((a, b) => a.order - b.order);

  enabledSections.forEach((section) => {
    summary += `===== ${section.title} =====\n`;

    if (section.type === "single") {
      const content = data[section.key];
      if (content && content.trim()) {
        // Check if this section needs special formatting
        if (section.key === "habitsDetails") {
          summary += formatHabits(content) + "\n";
        } else if (section.key === "rockDetails") {
          summary += formatRocks(content) + "\n";
        } else if (section.key === "eventDetails") {
          summary += formatEvents(content) + "\n";
        } else {
          // For now, just use raw content for other sections
          summary += content + "\n";
        }
      } else {
        summary += `No ${section.title.toLowerCase()} this week\n`;
      }
    } else if (section.type === "taskBreakdown") {
      const content = data[section.key];
      if (content && content.trim()) {
        summary += formatPersonalTasksSummary(content);
      } else {
        summary += "No personal tasks this week";
      }
    }

    summary += "\n";
  });

  return summary.trim();
}

/**
 * Generate Personal Cal Summary using config
 */
function generatePersonalCalSummary(data) {
  let summary = "===== SUMMARY =====\n";

  const eventSummaries = [];
  const enabledEvents = calSummaryConfig
    .filter((event) => event.include)
    .sort((a, b) => a.order - b.order);

  // Add stats-only events first (include: false)
  const statsOnlyEvents = calSummaryConfig
    .filter((event) => !event.include)
    .sort((a, b) => a.order - b.order);

  statsOnlyEvents.forEach((eventConfig) => {
    const eventData = data[eventConfig.key];
    const hours = extractHours(eventData);
    const count = extractEventCount(eventData);
    const status = eventConfig.evaluation
      ? eventConfig.evaluation(parseInt(count))
      : "";
    eventSummaries.push(
      `${status} ${eventConfig.displayName} (${count} events, ${hours} hours):`
    );
  });

  // Add detailed events
  enabledEvents.forEach((eventConfig) => {
    const eventData = data[eventConfig.key];
    const count =
      eventConfig.key === "personalPREvents"
        ? extractAppsCount(eventData)
        : extractEventCount(eventData);
    const status = eventConfig.evaluation
      ? eventConfig.evaluation(parseInt(count))
      : "";

    if (
      eventData &&
      !eventData.includes(
        `No ${eventConfig.key.replace("Events", "").toLowerCase()} events`
      )
    ) {
      if (eventConfig.key === "personalPREvents") {
        eventSummaries.push(
          formatPersonalPREvents(
            eventData,
            `${status} ${eventConfig.displayName}`
          )
        );
      } else if (
        eventConfig.useGrouping &&
        eventConfig.key === "interpersonalEvents"
      ) {
        // Use special interpersonal grouping
        eventSummaries.push(
          formatInterpersonalEventsGrouped(eventData, status)
        );
      } else {
        eventSummaries.push(
          formatCalendarEvents(
            eventData,
            `${status} ${eventConfig.displayName}`
          )
        );
      }
    } else {
      const defaultText =
        eventConfig.key === "personalPREvents"
          ? `${status} ${
              eventConfig.displayName
            } (0 apps, 0 commits):\nNo ${eventConfig.key
              .replace("Events", "")
              .toLowerCase()} events this week`
          : `${status} ${
              eventConfig.displayName
            } (0 events, 0 hours):\nNo ${eventConfig.key
              .replace("Events", "")
              .toLowerCase()} events this week`;
      eventSummaries.push(defaultText);
    }
  });

  summary += eventSummaries.join("\n\n");
  return summary;
}

/**
 * Format interpersonal events with grouping
 */
function formatInterpersonalEventsGrouped(eventData, statusIcon) {
  if (!eventData || eventData.includes("No interpersonal events")) {
    return `${statusIcon} Interpersonal events (0 events, 0 hours):\nNo interpersonal events this week`;
  }

  // Parse the event data to extract individual events
  const lines = eventData.split("\n");
  const events = [];

  // Extract individual event lines (start with •)
  const eventLines = lines.filter((line) => line.trim().startsWith("•"));

  eventLines.forEach((line) => {
    const trimmedLine = line.trim().substring(1).trim(); // Remove •

    // Extract hours from the line (e.g., "Event name (1.5h)")
    const hoursMatch = trimmedLine.match(/\(([0-9.]+)h\)$/);
    const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;

    // Extract event name (everything before the hours)
    const eventName = trimmedLine.replace(/\s*\([0-9.]+h\)$/, "");

    events.push({
      name: eventName,
      hours: hours,
      originalLine: trimmedLine,
    });
  });

  // Categorize events by precedence
  const categorizedEvents = {
    general: [],
    relationships: [],
    family: [],
    calls: [],
  };

  // Debug: Track categorization
  const debugInfo = [];

  events.forEach((event) => {
    const eventLower = event.name.toLowerCase();
    let assignedCategory = null;
    let matchedKeywords = [];

    // Check each category to see what keywords match
    Object.entries(interpersonalGroupingConfig).forEach(([key, config]) => {
      if (config.keywords) {
        const matches = config.keywords.filter((keyword) => {
          const keywordLower = keyword.toLowerCase();

          // Special handling for short keywords that might match unintentionally
          if (keywordLower === "ft" || keywordLower === "fam") {
            // Match as whole word only
            const wordRegex = new RegExp(`\\b${keywordLower}\\b`, "i");
            return wordRegex.test(event.name);
          }

          // For other keywords, use regular includes
          return eventLower.includes(keywordLower);
        });

        if (matches.length > 0) {
          matchedKeywords.push({
            category: key,
            keywords: matches,
            precedence: config.precedence,
          });
        }
      }
    });

    // Sort by precedence (highest first) and assign to highest precedence category
    if (matchedKeywords.length > 0) {
      matchedKeywords.sort((a, b) => b.precedence - a.precedence);
      assignedCategory = matchedKeywords[0].category;
      categorizedEvents[assignedCategory].push(event);

      // Debug log
      debugInfo.push({
        event: event.name,
        matched: matchedKeywords,
        assigned: assignedCategory,
      });
    } else {
      // No keywords matched, put in general
      categorizedEvents.general.push(event);
      debugInfo.push({
        event: event.name,
        matched: [],
        assigned: "general",
      });
    }
  });

  // Build output in display order
  let output = "";
  const displayOrder = Object.entries(interpersonalGroupingConfig)
    .filter(([key, config]) => config.include)
    .sort((a, b) => a[1].order - b[1].order);

  displayOrder.forEach(([categoryKey, config]) => {
    const categoryEvents = categorizedEvents[categoryKey];

    if (categoryEvents.length > 0) {
      const totalHours = categoryEvents.reduce(
        (sum, event) => sum + event.hours,
        0
      );
      const formattedHours = totalHours.toFixed(1);

      // Use evaluation function for status
      const evaluation = calSummaryConfig.find(
        (c) => c.key === "interpersonalEvents"
      )?.evaluation;
      const categoryStatus = evaluation
        ? evaluation(categoryEvents.length)
        : statusIcon;

      if (output) output += "\n";

      output += `${categoryStatus} ${config.displayName} (${
        categoryEvents.length
      } event${
        categoryEvents.length !== 1 ? "s" : ""
      }, ${formattedHours} hours):\n`;

      categoryEvents.forEach((event) => {
        output += `• ${event.originalLine}\n`;
      });
    }
  });

  return output.trim();
}

/**
 * Helper functions for formatting
 */
function formatPersonalTasksSummary(personalTasks) {
  // Task exemption arrays (case-insensitive matching)
  const exemptions = {
    "Home Tasks": ["laundry", "fold"],
    "Personal Tasks": ["shave", "groceries"],
    "Physical Health Tasks": ["workout", "run"],
  };

  const lines = personalTasks.split("\n");
  const enabledCategories = taskCategoriesConfig
    .filter((cat) => cat.include)
    .map((cat) => cat.category);

  let output = "";
  let currentCategory = "";
  let isInEnabledCategory = false;
  let totalTasks = 0;
  let currentCategoryTasks = 0;
  let currentCategorySection = ""; // Build category section separately

  for (const line of lines) {
    // Check if this line is a category header
    const categoryMatch = line.match(/^(.+?)\s+\((\d+)\)$/);
    if (categoryMatch) {
      // If we were processing a previous category, add it to output if it has tasks
      if (isInEnabledCategory && currentCategory && currentCategoryTasks > 0) {
        // Add newline before category header (except first)
        if (output.includes("✅")) {
          output += "\n";
        }
        output += `✅ ${currentCategory} (${currentCategoryTasks})\n`;
        output += currentCategorySection;
      }

      currentCategory = categoryMatch[1];
      currentCategoryTasks = 0;
      currentCategorySection = "";
      isInEnabledCategory = enabledCategories.includes(currentCategory);
    } else if (isInEnabledCategory && line.trim().startsWith("•")) {
      // Check if task should be exempted
      const shouldExempt =
        exemptions[currentCategory]?.some((exemption) =>
          line.toLowerCase().includes(exemption.toLowerCase())
        ) || false;

      if (!shouldExempt) {
        // Remove dates from task lines using regex
        const cleanedLine = line.replace(
          /\s*\([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\)$/,
          ""
        );
        currentCategorySection += cleanedLine + "\n";
        currentCategoryTasks++;
        totalTasks++;
      }
    } else if (line.includes("PERSONAL TASKS")) {
      // Update the header with new total
      output += `PERSONAL TASKS (${totalTasks} tasks):\n`;
    }
  }

  // Handle the last category
  if (isInEnabledCategory && currentCategory && currentCategoryTasks > 0) {
    if (output.includes("✅")) {
      output += "\n";
    }
    output += `✅ ${currentCategory} (${currentCategoryTasks})\n`;
    output += currentCategorySection;
  }

  return output.trim();
}

function formatCalendarEvents(eventData, eventType) {
  // Remove the existing title from eventData to avoid duplication
  const lines = eventData.split("\n");
  const contentLines = lines.filter(
    (line) => !line.includes("Events (") && !line.includes("PR Events (")
  );

  return `${eventType} (${extractEventCount(eventData)} events, ${extractHours(
    eventData
  )} hours):\n${contentLines.join("\n")}`;
}

function extractHours(eventData) {
  const hoursMatch = eventData?.match(/(\d+\.?\d*)\s*hours?/);
  return hoursMatch ? hoursMatch[1] : "0";
}

function extractEventCount(eventData) {
  const countMatch = eventData?.match(/(\d+)\s*events?/);
  return countMatch ? countMatch[1] : "0";
}

function extractAppsCount(eventData) {
  const appsMatch = eventData?.match(/(\d+)\s*apps?/);
  return appsMatch ? appsMatch[1] : "0";
}

function extractCommitsCount(eventData) {
  const commitsMatch = eventData?.match(/(\d+)\s*commits?/);
  return commitsMatch ? commitsMatch[1] : "0";
}

function formatPersonalPREvents(eventData, eventType) {
  const appsCount = extractAppsCount(eventData);
  const commitsCount = extractCommitsCount(eventData);

  // Remove the existing title from eventData to avoid duplication
  const lines = eventData.split("\n");
  const contentLines = lines.filter(
    (line) =>
      !line.includes("Personal PR Events (") && !line.includes("PR Events (")
  );

  return `${eventType} (${appsCount} apps, ${commitsCount} commits):\n${contentLines.join(
    "\n"
  )}`;
}

function formatRocks(rockDetails) {
  if (!rockDetails || !rockDetails.trim()) {
    return "";
  }

  // Split on ), then add ) back to each part (except the last)
  const parts = rockDetails.split("),");
  const rockLines = parts
    .map((part, index) => {
      // Add ) back to all parts except the last one
      return index < parts.length - 1 ? part.trim() + ")" : part.trim();
    })
    .filter((rock) => rock.length > 0);

  // Sort by status text, keeping original format intact
  const sortedRocks = rockLines.sort((a, b) => {
    let priorityA = 5,
      priorityB = 5;

    if (a.includes("Went well")) priorityA = 1;
    else if (a.includes("Made progress")) priorityA = 2;
    else if (a.includes("Didn't go so well")) priorityA = 3;
    else if (a.includes("Went bad")) priorityB = 4;

    if (b.includes("Went well")) priorityB = 1;
    else if (b.includes("Made progress")) priorityB = 2;
    else if (b.includes("Didn't go so well")) priorityB = 3;
    else if (b.includes("Went bad")) priorityB = 4;

    return priorityA - priorityB;
  });

  return sortedRocks.join("\n");
}

function formatHabits(habitsDetails) {
  if (!habitsDetails || !habitsDetails.trim()) {
    return "";
  }

  const lines = habitsDetails.split("\n").filter((line) => line.trim());
  const formattedLines = [];

  for (const line of lines) {
    let status = "⚠️"; // default
    // Clean up the line - remove extra spaces and invisible characters
    let formattedLine = line.trim().replace(/\s+/g, " ");

    // Early wake ups vs sleeping in
    if (line.includes("early wake ups") && line.includes("sleeping in")) {
      const wakeUpMatch = line.match(/(\d+)\s*early wake ups/);
      const sleepInMatch = line.match(/(\d+)\s*days sleeping in/);

      if (wakeUpMatch && sleepInMatch) {
        const wakeUps = parseInt(wakeUpMatch[1]);
        const sleepIns = parseInt(sleepInMatch[1]);

        if (wakeUps > sleepIns) status = "✅";
        else if (wakeUps === sleepIns) status = "⚠️";
        else status = "❌";
      }
    }

    // Sober vs drinking days
    else if (line.includes("sober") && line.includes("drinking")) {
      const soberMatch = line.match(/(\d+)\s*days sober/);
      const drinkingMatch = line.match(/(\d+)\s*days drinking/);

      if (soberMatch && drinkingMatch) {
        const soberDays = parseInt(soberMatch[1]);
        const drinkingDays = parseInt(drinkingMatch[1]);

        if (soberDays > drinkingDays) status = "✅";
        else if (soberDays === drinkingDays) status = "⚠️";
        else status = "❌";
      }
    }

    // Workouts
    else if (line.includes("workouts")) {
      const workoutMatch = line.match(/(\d+)\s*workouts/);

      if (workoutMatch) {
        const workouts = parseInt(workoutMatch[1]);

        if (workouts > 1) status = "✅";
        else if (workouts === 1) status = "⚠️";
        else status = "❌";
      }
    }

    // Reading vs gaming
    else if (line.includes("reading") && line.includes("gaming")) {
      const readingMatch = line.match(/(\d+)\s*days reading/);
      const gamingMatch = line.match(/(\d+)\s*days gaming/);

      if (readingMatch && gamingMatch) {
        const readingDays = parseInt(readingMatch[1]);
        const gamingDays = parseInt(gamingMatch[1]);

        if (readingDays > gamingDays) status = "✅";
        else if (readingDays === gamingDays) status = "⚠️";
        else status = "❌";
      }
    }

    // Body weight
    else if (line.includes("body weight")) {
      const weightMatch = line.match(/([\d.]+)\s*avg body weight/);

      if (weightMatch) {
        const weight = parseFloat(weightMatch[1]);

        if (weight <= 195) status = "✅";
        else if (weight > 195 && weight < 200) status = "⚠️";
        else status = "❌";
      }
    }

    formattedLines.push(`${status} ${formattedLine}`);
  }

  return formattedLines.join("\n");
}

function formatEvents(eventDetails) {
  if (!eventDetails || !eventDetails.trim()) {
    return "";
  }

  // Day priority for sorting
  const dayPriority = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // Split on commas like we did with rocks
  const eventLines = eventDetails
    .split(",")
    .map((event) => event.trim())
    .filter((event) => event.length > 0);

  // Sort by first day mentioned in each event
  const sortedEvents = eventLines.sort((a, b) => {
    const dayMatchA = a.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
    const dayMatchB = b.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);

    const dayA = dayMatchA ? dayMatchA[1] : "Sun";
    const dayB = dayMatchB ? dayMatchB[1] : "Sun";

    return dayPriority[dayA] - dayPriority[dayB];
  });

  return sortedEvents.join("\n");
}

/**
 * Process all selected weeks
 */
async function processAllWeeks() {
  console.log(`\n🚀 Processing ${TARGET_WEEKS.length} week(s)...`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log(
    `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
  );
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);

  // Check if running in interactive mode
  const result = await checkInteractiveMode();

  if (result.isInteractive) {
    // First, choose data sources
    console.log("📊 What data would you like to summarize?\n");
    console.log("1. Both (Personal Task Summary + Personal Cal Summary)");
    console.log("2. Personal Task Summary only");
    console.log("3. Personal Cal Summary only");

    const dataSourceInput = await askQuestion("\n? Choose option (1-3): ");

    switch (dataSourceInput.trim()) {
      case "1":
        SELECTED_DATA_SOURCES = "both";
        console.log("✅ Selected: Both summaries");
        break;
      case "2":
        SELECTED_DATA_SOURCES = "task-summary";
        console.log("✅ Selected: Personal Task Summary only");
        break;
      case "3":
        SELECTED_DATA_SOURCES = "cal-summary";
        console.log("✅ Selected: Personal Cal Summary only");
        break;
      default:
        SELECTED_DATA_SOURCES = "both";
        console.log("✅ Selected: Both summaries (default)");
        break;
    }

    // Then choose weeks
    console.log(`\n📌 Default: Week ${DEFAULT_TARGET_WEEKS.join(",")}\n`);

    const weeksInput = await askQuestion(
      "? Which weeks to process? (comma-separated, e.g., 1,2,3): "
    );

    if (weeksInput.trim()) {
      TARGET_WEEKS = weeksInput
        .split(",")
        .map((w) => parseInt(w.trim()))
        .filter((w) => !isNaN(w));
    }

    console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
    console.log(`📊 Data sources: ${SELECTED_DATA_SOURCES}`);
    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }

    console.log("");
  } else {
    TARGET_WEEKS = result.targetWeeks;
    SELECTED_DATA_SOURCES = "both";
  }

  await processAllWeeks();
}

/**
 * Interactive mode for user input
 */
async function checkInteractiveMode() {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Non-interactive mode - could add argument parsing here later
    return { isInteractive: false, targetWeeks: DEFAULT_TARGET_WEEKS };
  }

  return { isInteractive: true };
}

// Run the script
main()
  .then(() => {
    rl.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    rl.close();
    process.exit(1);
  });
