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
    displayName: "Workout Events",
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

// Mental Health Events Grouping Configuration
const mentalHealthGroupingConfig = {
  general: {
    displayName: "Mental Health Time",
    include: true,
    order: 7,
    precedence: 0,
  },
  awake: {
    displayName: "Awake",
    include: true,
    order: 8,
    keywords: ["awake", "leg pain", "anxiety"],
    precedence: 2,
    evaluation: () => "❌",
  },
  wastedDays: {
    displayName: "Wasted Days",
    include: true,
    order: 9,
    keywords: ["wasted day"],
    precedence: 3,
    evaluation: () => "❌",
    countType: "days", // Special flag for day counting
  },
};

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
      "family",
      "lynne",
      "victor",
      "vick",
      "vicki",
      "lb",
      "vb",
      "vbz",
      "ez",
      "mom",
      "dad",
      "evan",
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

    // Move any lines with (0 events) or (0 apps) from CAL EVENTS to CAL SUMMARY
    const moveZeroItemsRegex =
      /(===== CAL EVENTS =====\n)((?:.*\n)*?)(^[☑️✅❌⚠️] .+? \(0 (?:events|apps).+?\):$)/gm;
    let match;
    while ((match = moveZeroItemsRegex.exec(calSummary)) !== null) {
      const zeroItem = match[3];
      // Insert before CAL SUMMARY section ends
      calSummary = calSummary.replace(
        /(===== CAL SUMMARY =====\n(?:.*\n)*?)(===== CAL EVENTS =====)/,
        `$1${zeroItem}\n$2`
      );
      // Remove from CAL EVENTS section
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
/**
 * Generate Personal Cal Summary using structured arrays
 */
function generatePersonalCalSummary(data) {
  const output = {
    habits: [],
    calSummary: [],
    summary: [],
  };

  // 1. HABITS section
  if (data.habitsDetails && data.habitsDetails.trim()) {
    const habitsFormatted = formatHabits(data.habitsDetails);
    if (habitsFormatted) {
      output.habits.push(habitsFormatted);
    }
  }

  // 2. Process all calendar events
  const allEvents = calSummaryConfig.sort((a, b) => a.order - b.order);

  allEvents.forEach((eventConfig) => {
    const eventData = data[eventConfig.key];

    // Extract counts
    const count =
      eventConfig.key === "personalPREvents"
        ? extractAppsCount(eventData)
        : extractEventCount(eventData);
    const hours = extractHours(eventData);

    // Get status emoji
    const status = eventConfig.evaluation
      ? eventConfig.evaluation(parseInt(count))
      : "☑️";

    // Handle special cases
    if (eventConfig.key === "interpersonalEvents") {
      // Special interpersonal grouping
      const interpersonalOutput = formatInterpersonalEvents(eventData);
      if (interpersonalOutput) {
        // Split into sections by status emoji lines
        const sections = [];
        const lines = interpersonalOutput.split("\n");
        let currentSection = [];

        lines.forEach((line) => {
          if (line.match(/^[☑️✅❌⚠️]/)) {
            // New section header - save previous section if exists
            if (currentSection.length > 0) {
              sections.push(currentSection.join("\n"));
            }
            currentSection = [line];
          } else if (currentSection.length > 0) {
            // Add line to current section
            currentSection.push(line);
          }
        });

        // Add final section
        if (currentSection.length > 0) {
          sections.push(currentSection.join("\n"));
        }

        // Categorize each complete section
        sections.forEach((section) => {
          const hasEvents = !section.includes("(0 events");
          if (hasEvents) {
            // Trim any trailing newlines from interpersonal sections to prevent double spacing
            output.summary.push(section.trim());
          } else {
            output.calSummary.push(section.trim());
          }
        });
      }
    } else if (eventConfig.key === "mentalHealthEvents") {
      // Special mental health grouping
      const mentalHealthOutput = formatMentalHealthEvents(eventData);
      if (mentalHealthOutput) {
        // Split into sections by status emoji lines
        const sections = [];
        const lines = mentalHealthOutput.split("\n");
        let currentSection = [];

        lines.forEach((line) => {
          if (line.match(/^[☑️✅❌⚠️]/)) {
            // New section header - save previous section if exists
            if (currentSection.length > 0) {
              sections.push(currentSection.join("\n"));
            }
            currentSection = [line];
          } else if (currentSection.length > 0) {
            // Add line to current section
            currentSection.push(line);
          }
        });

        // Add final section
        if (currentSection.length > 0) {
          sections.push(currentSection.join("\n"));
        }

        // Categorize each complete section
        sections.forEach((section) => {
          const hasEvents = !section.includes("(0 events");
          if (hasEvents) {
            // Trim any trailing newlines from mental health sections to prevent double spacing
            output.summary.push(section.trim());
          } else {
            output.calSummary.push(section.trim());
          }
        });
      }
    } else {
      // Standard event processing
      let eventLine;

      if (eventConfig.key === "personalPREvents") {
        const appsCount = extractAppsCount(eventData);
        const commitsCount = extractCommitsCount(eventData);
        eventLine = `${status} ${eventConfig.displayName} (${appsCount} apps, ${commitsCount} commits):`;

        // Add event details if available
        const prDetails = formatPersonalPREvents(eventData, "");
        if (prDetails) {
          eventLine += "\n" + prDetails.split("\n").slice(1).join("\n"); // Remove title line
        }
      } else {
        const days = extractDays(eventData);
        eventLine = `${status} ${eventConfig.displayName} (${count} events, ${hours} hours, ${days} days):`;

        // Add event details only if include is true
        if (eventConfig.include) {
          const eventDetails = formatCalendarEvents(eventData, "");
          if (eventDetails) {
            eventLine += "\n" + eventDetails.split("\n").slice(1).join("\n"); // Remove title line
          }
        }
      }

      // Categorize based on include flag and count
      if (!eventConfig.include) {
        output.calSummary.push(eventLine);
      } else if (
        parseInt(count) === 0 ||
        (eventConfig.key === "personalPREvents" &&
          extractAppsCount(eventData) === "0")
      ) {
        output.calSummary.push(eventLine);
      } else {
        output.summary.push(eventLine);
      }
    }
  });

  // 3. Build final output
  let result = "";

  if (output.habits.length > 0) {
    result += "===== HABITS =====\n" + output.habits.join("\n") + "\n\n";
  }

  if (output.calSummary.length > 0) {
    result +=
      "===== CAL SUMMARY =====\n" + output.calSummary.join("\n") + "\n\n";
  }

  if (output.summary.length > 0) {
    result += "===== CAL EVENTS =====\n" + output.summary.join("\n\n");
  }

  return result.trim();
}

/**
 * Format interpersonal events with grouping
 */
function formatInterpersonalEvents(eventData, eventType) {
  if (!eventData || !eventData.trim()) {
    return "";
  }

  // Use header event count for reliability
  const headerCount = extractEventCount(eventData);
  if (parseInt(headerCount) === 0) {
    return "";
  }

  const lines = eventData.split("\n");
  const contentLines = lines.filter((line) => {
    const cleaned = line.trim().replace(/^•\s*/, "");
    const isHeader = cleaned.includes("Events (");
    const isEmpty = cleaned === "";
    const isNoEventsLine = /^No .* events this week$/i.test(cleaned);
    return !isHeader && !isNoEventsLine && !isEmpty;
  });

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
          const boundaryRegex = new RegExp(
            `(^|\\s|[^a-zA-Z])${keywordLower}(\\s|[^a-zA-Z]|$)`,
            "i"
          );
          return boundaryRegex.test(event.name);
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

      // Extract unique days from "on Day" pattern
      const uniqueDays = new Set();
      categoryEvents.forEach((event) => {
        const dayMatch = event.originalLine.match(
          /on (Sun|Mon|Tue|Wed|Thu|Fri|Sat)/
        );
        if (dayMatch) {
          uniqueDays.add(dayMatch[1]);
        }
      });
      const dayCount = uniqueDays.size;

      output += `${categoryStatus} ${config.displayName} (${
        categoryEvents.length
      } event${
        categoryEvents.length !== 1 ? "s" : ""
      }, ${formattedHours} hours, ${dayCount} day${
        dayCount !== 1 ? "s" : ""
      }):\n`;

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
/**
 * Format mental health events with grouping
 */
function formatMentalHealthEvents(eventData, eventType) {
  if (!eventData || !eventData.trim()) {
    return "";
  }

  // Use header event count for reliability
  const headerCount = extractEventCount(eventData);
  if (parseInt(headerCount) === 0) {
    return "";
  }

  const lines = eventData.split("\n");
  const contentLines = lines.filter((line) => {
    const cleaned = line.trim().replace(/^•\s*/, "");
    const isHeader = cleaned.includes("Events (");
    const isEmpty = cleaned === "";
    const isNoEventsLine = /^No .* events this week$/i.test(cleaned);
    return !isHeader && !isNoEventsLine && !isEmpty;
  });

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
    awake: [],
    wastedDays: [],
  };

  events.forEach((event) => {
    let assignedCategory = null;
    let matchedKeywords = [];

    Object.entries(mentalHealthGroupingConfig).forEach(([key, config]) => {
      if (config.keywords) {
        const matches = config.keywords.filter((keyword) => {
          const keywordLower = keyword.toLowerCase();
          const boundaryRegex = new RegExp(
            `(^|\\s|[^a-zA-Z])${keywordLower}(\\s|[^a-zA-Z]|$)`,
            "i"
          );
          return boundaryRegex.test(event.name);
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
  const displayOrder = Object.entries(mentalHealthGroupingConfig)
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

      // Get status emoji from config or use evaluation function
      const categoryStatus = config.evaluation
        ? config.evaluation(categoryEvents.length)
        : "✅";

      if (output) output += "\n";

      // Special handling for Wasted Days - count days instead of events/hours
      if (config.countType === "days") {
        // Extract unique days from "on Day" pattern
        const uniqueDays = new Set();
        categoryEvents.forEach((event) => {
          const dayMatch = event.originalLine.match(
            /on (Sun|Mon|Tue|Wed|Thu|Fri|Sat)/
          );
          if (dayMatch) {
            uniqueDays.add(dayMatch[1]);
          }
        });
        const dayCount = uniqueDays.size || categoryEvents.length; // fallback to event count

        output += `${categoryStatus} ${config.displayName} (${dayCount} day${
          dayCount !== 1 ? "s" : ""
        }):\n`;
      } else {
        // Standard format for other categories (include day count)
        const uniqueDays = new Set();
        categoryEvents.forEach((event) => {
          const dayMatch = event.originalLine.match(
            /on (Sun|Mon|Tue|Wed|Thu|Fri|Sat)/
          );
          if (dayMatch) {
            uniqueDays.add(dayMatch[1]);
          }
        });
        const dayCount = uniqueDays.size;

        output += `${categoryStatus} ${config.displayName} (${
          categoryEvents.length
        } event${
          categoryEvents.length !== 1 ? "s" : ""
        }, ${formattedHours} hours, ${dayCount} day${
          dayCount !== 1 ? "s" : ""
        }):\n`;
      }

      categoryEvents.forEach((event) => {
        output += `• ${event.originalLine}\n`;
      });
    }
  });

  return output.trim();
}
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
function extractDays(eventData) {
  const daysMatch = eventData?.match(/(\d+)\s*days?/);
  return daysMatch ? daysMatch[1] : "0";
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
