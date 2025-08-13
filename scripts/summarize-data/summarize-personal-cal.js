const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("../../src/utils/notion-utils");
const { askQuestion, rl } = require("../../src/utils/cli-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default configuration
const DEFAULT_TARGET_WEEKS = [1];
let TARGET_WEEKS = DEFAULT_TARGET_WEEKS;

console.log("📅 Personal Cal Summary Generator");

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
    console.log(`\n📅 === PROCESSING WEEK ${weekNumber} ===`);

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
    };

    // Generate Personal Cal Summary
    console.log("📅 Generating Personal Cal Summary...");
    const calSummary = generatePersonalCalSummary(existingData);

    // Update Notion with generated summary
    console.log("📤 Updating Notion with summary...");
    const properties = {
      "Personal Cal Summary": {
        rich_text: [
          {
            text: {
              content: calSummary.substring(0, 2000), // Notion limit
            },
          },
        ],
      },
    };

    await notion.pages.update({
      page_id: targetWeekPage.id,
      properties: properties,
    });

    console.log(
      `✅ Successfully updated Week ${paddedWeek} with Personal Cal Summary!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
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
    } else {
      // No keywords matched, put in general
      categorizedEvents.general.push(event);
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

  // Check for --weeks argument
  const weekIndex = args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    TARGET_WEEKS = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  } else if (args.length === 0) {
    // Interactive mode (when run standalone)
    console.log(`📌 Default: Week ${DEFAULT_TARGET_WEEKS.join(",")}\n`);

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
    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      rl.close();
      process.exit(0);
    }
  }

  await processAllWeeks();
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
