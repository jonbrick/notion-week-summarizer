const { Client } = require("@notionhq/client");
const { rl, askQuestion } = require("../../src/utils/cli-utils");
const { findWeekRecapPage } = require("../../src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("../../src/config/task-config");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

console.log("📅 Personal Cal Summary Generator");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Calendar Summary Configuration - Updated order and evaluations
const calSummaryConfig = [
  {
    key: "personalEvents",
    displayName: "Personal Time",
    include: false,
    order: 1,
    evaluation: (count) => (count > 0 ? "☑️" : "☑️"),
  },
  {
    key: "interpersonalEvents",
    displayName: "Interpersonal Time",
    include: true,
    order: 2,
    evaluation: (count) => (count > 0 ? "✅" : "☑️"),
  },
  // Relationship, Family, Calls will be handled by interpersonal grouping
  {
    key: "physicalHealthEvents",
    displayName: "Physical Health Time",
    include: true,
    order: 6,
    evaluation: (count) => (count > 0 ? "✅" : "☑️"),
  },
  {
    key: "mentalHealthEvents",
    displayName: "Mental Health Time",
    include: true,
    order: 7,
    evaluation: (count) => (count > 0 ? "✅" : "☑️"),
  },
  {
    key: "workoutEvents",
    displayName: "Workout Time",
    include: true,
    order: 8,
    evaluation: (count) => (count > 0 ? "✅" : "❌"),
  },
  {
    key: "readingEvents",
    displayName: "Reading Time",
    include: true,
    order: 9,
    evaluation: (count) => (count > 0 ? "✅" : "❌"),
  },
  {
    key: "codingEvents",
    displayName: "Coding Time",
    include: true,
    order: 10,
    evaluation: (count) => (count > 0 ? "✅" : "❌"), // Changed from ☑️ to ❌
  },
  {
    key: "artEvents",
    displayName: "Art Time",
    include: true,
    order: 11,
    evaluation: (count) => (count > 0 ? "✅" : "❌"), // Changed from ☑️ to ❌
  },
  {
    key: "videoGameEvents",
    displayName: "Video Game Time",
    include: true,
    order: 12,
    evaluation: (count) => (count > 0 ? "❌" : "✅"),
  },
  {
    key: "personalPREvents",
    displayName: "Personal PR",
    include: true,
    order: 13,
    evaluation: (count) => (count > 0 ? "✅" : "☑️"),
  },
];

// Interpersonal Events Grouping Configuration - Updated order and names
const interpersonalGroupingConfig = {
  general: {
    displayName: "Interpersonal Time",
    include: true,
    order: 2,
    precedence: 0,
  },
  relationships: {
    displayName: "Relationship Time",
    include: true,
    order: 3,
    keywords: ["jen"],
    precedence: 2,
  },
  family: {
    displayName: "Family Time",
    include: true,
    order: 4,
    keywords: [
      "fam",
      "ft",
      "family",
      "lynne",
      "victor",
      "vick",
      "lb",
      "vb",
      "ez",
      "jordan",
    ],
    precedence: 3,
  },
  calls: {
    displayName: "Calls",
    include: true,
    order: 5,
    keywords: ["call", "ft", "facetime"],
    precedence: 99,
  },
};

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

    // Read existing data from calendar event columns
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
      codingEvents:
        targetWeekPage.properties["Personal Coding Events"]?.rich_text?.[0]
          ?.plain_text || "",
      artEvents:
        targetWeekPage.properties["Art Events"]?.rich_text?.[0]?.plain_text ||
        "",
      personalPREvents:
        targetWeekPage.properties["Personal PR Events"]?.rich_text?.[0]
          ?.plain_text || "",
      habitsDetails:
        targetWeekPage.properties["Habits Details"]?.formula?.string || "",
    };

    // Generate Personal Cal Summary
    console.log("📅 Generating Personal Cal Summary...");
    let calSummary = generatePersonalCalSummary(existingData).replace(
      /:\nNo .* events this week/g,
      ":"
    );

    // Move any lines with (0 events) or (0 apps) from SUMMARY to CAL SUMMARY
    const moveZeroItemsRegex =
      /(===== SUMMARY =====\n)((?:.*\n)*?)(^[☑️✅❌⚠️] .+? \(0 (?:events|apps).+?\):$)/gm;
    let match;
    while ((match = moveZeroItemsRegex.exec(calSummary)) !== null) {
      const zeroItem = match[3];
      // Insert before CAL SUMMARY section ends
      calSummary = calSummary.replace(
        /(===== CAL SUMMARY =====\n(?:.*\n)*?)(===== SUMMARY =====)/,
        `$1${zeroItem}\n$2`
      );
      // Remove from SUMMARY section
      calSummary = calSummary.replace(match[0], match[1] + match[2]);
      break; // Process one at a time to avoid regex issues
    }

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
 * Format habits with evaluation logic
 */
function formatHabits(habitsDetails) {
  if (!habitsDetails || !habitsDetails.trim()) {
    return "";
  }

  const lines = habitsDetails.split("\n").filter((line) => line.trim());
  const formattedLines = [];

  for (const line of lines) {
    let status = "";
    let emoji = "";
    let habitDescription = "";
    let originalValues = "";

    // Clean up the line - remove extra spaces and invisible characters
    let cleanedLine = line.trim().replace(/\s+/g, " ");

    // 1. Early wake ups vs sleeping in
    if (line.includes("early wake ups") && line.includes("sleeping in")) {
      const wakeUpMatch = line.match(/(\d+)\s*early wake ups/);
      const sleepInMatch = line.match(/(\d+)\s*days sleeping in/);

      if (wakeUpMatch) {
        const wakeUps = parseInt(wakeUpMatch[1]);
        emoji = "🛌";
        originalValues = cleanedLine;

        if (wakeUps >= 4) {
          status = "✅";
          habitDescription = "Good sleeping habits";
        } else if (wakeUps >= 2) {
          status = "⚠️";
          habitDescription = "Not great sleeping habits";
        } else {
          status = "❌";
          habitDescription = "Bad sleeping habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 2. Sober vs drinking days
    else if (line.includes("sober") && line.includes("drinking")) {
      const soberMatch = line.match(/(\d+)\s*days sober/);

      if (soberMatch) {
        const soberDays = parseInt(soberMatch[1]);
        emoji = "🍻";
        originalValues = cleanedLine;

        if (soberDays >= 4) {
          status = "✅";
          habitDescription = "Good drinking habits";
        } else if (soberDays >= 2) {
          status = "⚠️";
          habitDescription = "Not great drinking habits";
        } else {
          status = "❌";
          habitDescription = "Bad drinking habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 3. Workouts
    else if (line.includes("workouts") && !line.includes("days")) {
      const workoutMatch = line.match(/(\d+)\s*workouts/);

      if (workoutMatch) {
        const workouts = parseInt(workoutMatch[1]);
        emoji = "💪";
        originalValues = cleanedLine;

        if (workouts >= 3) {
          status = "✅";
          habitDescription = "Good workout habits";
        } else if (workouts >= 1) {
          status = "⚠️";
          habitDescription = "Not great workout habits";
        } else {
          status = "❌";
          habitDescription = "Bad workout habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 4. Hobby habits (reading, gaming, coding, art) - UPDATED LOGIC
    else if (
      line.includes("reading") ||
      line.includes("gaming") ||
      line.includes("coding") ||
      line.includes("art")
    ) {
      // NEW Hobby classification with equal weights
      const HOBBY_CLASSIFICATION = {
        good: {
          coding: { pattern: /(\d+)\s*days coding/, weight: 1 },
          reading: { pattern: /(\d+)\s*days reading/, weight: 1 },
          art: { pattern: /(\d+)\s*days (?:making )?art/, weight: 1 }, // Fixed pattern for "making art"
        },
        bad: {
          gaming: { pattern: /(\d+)\s*days gaming/, weight: 1 },
        },
      };

      // Extract hobby days
      let goodHobbyDays = 0;
      let badHobbyDays = 0;
      let hobbyDetails = [];

      // Count good hobbies
      for (const [hobbyName, config] of Object.entries(
        HOBBY_CLASSIFICATION.good
      )) {
        const match = line.match(config.pattern);
        if (match) {
          const days = parseInt(match[1]);
          goodHobbyDays += days * config.weight;
          hobbyDetails.push(`${days} days ${hobbyName}`);
        }
      }

      // Count bad hobbies
      for (const [hobbyName, config] of Object.entries(
        HOBBY_CLASSIFICATION.bad
      )) {
        const match = line.match(config.pattern);
        if (match) {
          const days = parseInt(match[1]);
          badHobbyDays += days * config.weight;
          hobbyDetails.push(`${days} days ${hobbyName}`);
        }
      }

      // Only process if we found any hobby data
      if (hobbyDetails.length > 0) {
        emoji = "📖";
        originalValues = hobbyDetails.join(", ");

        // NEW Evaluation logic: Total possible = 21 points (7 days × 3 good hobbies)
        const totalScore = goodHobbyDays - badHobbyDays; // Gaming subtracts from total

        if (totalScore > 5) {
          status = "✅";
          habitDescription = "Good hobby habits";
        } else if (totalScore >= 1) {
          status = "⚠️";
          habitDescription = "Not great hobby habits";
        } else {
          status = "❌";
          habitDescription = "Bad hobby habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 5. Average body weight
    else if (line.includes("body weight") || line.includes("avg body weight")) {
      const weightMatch = line.match(
        /([\d.]+)\s*(?:avg\s*)?(?:body\s*)?weight/i
      );

      if (weightMatch) {
        const weight = parseFloat(weightMatch[1]);
        emoji = "⚖️";
        originalValues = cleanedLine;

        if (weight <= 195) {
          status = "✅";
          habitDescription = "Good body weight";
        } else if (weight < 200) {
          status = "⚠️";
          habitDescription = "Not great body weight";
        } else {
          status = "❌";
          habitDescription = "Bad body weight";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // If no pattern matched, just add the line with a warning status
    else {
      formattedLines.push(`⚠️ ${cleanedLine}`);
    }
  }

  return formattedLines.join("\n");
}

/**
 * Generate Personal Cal Summary using config
 */
function generatePersonalCalSummary(data) {
  let summary = "";

  // HABITS section first
  if (data.habitsDetails && data.habitsDetails.trim()) {
    summary += "===== HABITS =====\n";
    summary += formatHabits(data.habitsDetails) + "\n\n";
  }

  // CAL SUMMARY section for include: false items
  summary += "===== CAL SUMMARY =====\n";

  const statsOnlyEvents = calSummaryConfig
    .filter((event) => !event.include)
    .sort((a, b) => a.order - b.order);

  statsOnlyEvents.forEach((eventConfig) => {
    const eventData = data[eventConfig.key];
    const hours = extractHours(eventData);
    const count = extractEventCount(eventData);
    const status = eventConfig.evaluation
      ? eventConfig.evaluation(parseInt(count))
      : "☑️";

    if (eventConfig.key === "personalPREvents") {
      const appsCount = extractAppsCount(eventData);
      const commitsCount = extractCommitsCount(eventData);
      summary += `${status} ${eventConfig.displayName} (${appsCount} apps, ${commitsCount} commits):\n`;
    } else {
      summary += `${status} ${eventConfig.displayName} (${count} events, ${hours} hours):\n`;
    }
  });

  summary += "\n";

  // SUMMARY section
  summary += "===== SUMMARY =====\n";

  const eventSummaries = [];
  const enabledEvents = calSummaryConfig
    .filter((event) => event.include)
    .sort((a, b) => a.order - b.order);

  // Detailed events will be added below; stats-only items were included in CAL SUMMARY above

  // Add detailed events
  enabledEvents.forEach((eventConfig) => {
    const eventData = data[eventConfig.key];
    const count =
      eventConfig.key === "personalPREvents"
        ? extractAppsCount(eventData)
        : extractEventCount(eventData);
    const status = eventConfig.evaluation
      ? eventConfig.evaluation(parseInt(count))
      : "☑️";

    if (eventConfig.key === "interpersonalEvents") {
      // Special handling for interpersonal events grouping
      const interpersonalOutput = formatInterpersonalEvents(
        eventData,
        "Interpersonal"
      );
      if (interpersonalOutput) {
        eventSummaries.push(interpersonalOutput);
      }
    } else if (eventConfig.key === "personalPREvents") {
      // Special handling for Personal PR events
      const prOutput = formatPersonalPREvents(eventData, "Personal PR");
      if (prOutput) {
        eventSummaries.push(`${status} ${prOutput}`);
      } else {
        // Show title with count but no "No ___ events this week" text
        const appsCount = extractAppsCount(eventData);
        const commitsCount = extractCommitsCount(eventData);
        eventSummaries.push(
          `${status} Personal PR (${appsCount} apps, ${commitsCount} commits):`
        );
      }
    } else {
      // Standard calendar event formatting
      const calendarOutput = formatCalendarEvents(
        eventData,
        eventConfig.displayName
      );
      if (calendarOutput) {
        eventSummaries.push(`${status} ${calendarOutput}`);
      } else {
        // For empty events, show title with count but no "No ___ events this week" text
        const count = extractEventCount(eventData);
        const hours = extractHours(eventData);
        eventSummaries.push(
          `${status} ${eventConfig.displayName} (${count} events, ${hours} hours):`
        );
      }
    }
  });

  // Join all summaries
  summary += eventSummaries.join("\n");

  return summary.trim();
}

/**
 * Format interpersonal events with grouping
 */
function formatInterpersonalEvents(eventData, eventType) {
  if (!eventData || !eventData.trim()) {
    return "";
  }

  const lines = eventData.split("\n");
  const contentLines = lines.filter(
    (line) => !line.includes("Events (") && line.trim() !== ""
  );

  const events = [];
  contentLines.forEach((line) => {
    const trimmedLine = line.trim().replace(/^•\s*/, "");
    if (trimmedLine) {
      const hoursMatch = trimmedLine.match(/\(([0-9.]+)h\)$/);
      const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
      const eventName = trimmedLine.replace(/\s*\([0-9.]+h\)$/, "");

      events.push({
        name: eventName,
        hours: hours,
        originalLine: trimmedLine,
      });
    }
  });

  // Categorize events
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

    Object.entries(interpersonalGroupingConfig).forEach(([key, config]) => {
      if (config.keywords) {
        const matches = config.keywords.filter((keyword) => {
          const keywordLower = keyword.toLowerCase();
          if (keywordLower === "ft" || keywordLower === "fam") {
            const wordRegex = new RegExp(`\\b${keywordLower}\\b`, "i");
            return wordRegex.test(event.name);
          }
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

    if (matchedKeywords.length > 0) {
      matchedKeywords.sort((a, b) => b.precedence - a.precedence);
      assignedCategory = matchedKeywords[0].category;
      categorizedEvents[assignedCategory].push(event);
    } else {
      categorizedEvents.general.push(event);
    }
  });

  // Build output
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

      const evaluation = calSummaryConfig.find(
        (c) => c.key === "interpersonalEvents"
      )?.evaluation;
      const categoryStatus = evaluation
        ? evaluation(categoryEvents.length)
        : "☑️";

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
  if (!eventData || !eventData.trim()) {
    return null; // Return null if no data, let caller handle display
  }

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
  if (!eventData || !eventData.trim()) {
    return null; // Return null if no data, let caller handle display
  }

  const appsCount = extractAppsCount(eventData);
  const commitsCount = extractCommitsCount(eventData);

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
    // Interactive mode
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

    rl.close();
  }

  await processAllWeeks();
  process.exit(0);
}

// Run the script
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
