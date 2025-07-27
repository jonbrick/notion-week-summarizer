const { Client } = require("@notionhq/client");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
require("dotenv").config();

// Configuration - using environment variables
const NOTION_TOKEN = process.env.NOTION_TOKEN;

// Initialize clients
const notion = new Client({ auth: NOTION_TOKEN });

// Database IDs - using environment variables
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Helper function to format date nicely
function formatTaskDate(dateString) {
  // Parse the date string as local time to avoid timezone issues
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day); // month is 0-indexed

  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  const dayName = days[date.getDay()];
  const monthName = months[date.getMonth()];
  const dateDay = date.getDate();
  const dateYear = date.getFullYear();

  return `${dayName} ${monthName} ${dateDay}, ${dateYear}`;
}

// Fetch rocks for the week
async function fetchWeekRocks(startDate, endDate, weekPageId) {
  try {
    const rocksResponse = await notion.databases.query({
      database_id: process.env.ROCKS_DATABASE_ID,
      filter: {
        and: [
          {
            property: "⌛ Weeks",
            relation: {
              contains: weekPageId,
            },
          },
          {
            property: "Type",
            select: {
              does_not_equal: "💼 Work",
            },
          },
        ],
      },
    });

    return rocksResponse.results;
  } catch (error) {
    console.error("Error fetching rocks:", error);
    return [];
  }
}

// Fetch events for the week
async function fetchWeekEvents(startDate, endDate) {
  try {
    const eventsResponse = await notion.databases.query({
      database_id: process.env.EVENTS_DATABASE_ID,
      filter: {
        and: [
          {
            property: "Date",
            date: {
              on_or_after: startDate,
            },
          },
          {
            property: "Date",
            date: {
              on_or_before: endDate,
            },
          },
          {
            property: "Event Type",
            select: {
              does_not_equal: "💼 Work",
            },
          },
        ],
      },
    });

    return eventsResponse.results;
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}

// Event type to emoji mapping for personal events
const PERSONAL_EVENT_TYPE_MAPPING = {
  MSG: "🍻 Friend Events",
  "Friend Events": "🍻 Friend Events",
  "Family Events": "👨‍👩‍👧‍👦 Family Events",
  Travel: "✈️ Travel",
  Holiday: "🎉 Holiday",
  Birthday: "🎂 Birthday",
  Anniversary: "💕 Anniversary",
  Dinner: "🍽️ Dinner",
  Lunch: "🍽️ Lunch",
  Party: "🎉 Party",
  Concert: "🎵 Concert",
  Movie: "🎬 Movie",
  Game: "🎮 Game",
  Sports: "⚽ Sports",
  Exercise: "💪 Exercise",
  Health: "❤️ Health",
  Home: "🏠 Home",
  Personal: "🌱 Personal",
  "Mental Health": "🧠 Mental Health",
  "Physical Health": "💪 Physical Health",
};

// Format events for Notion (same as work version but "Personal Events")
function formatEventsForNotion(events) {
  if (events.length === 0) {
    return "No personal events this week.";
  }

  let output = `Personal Events (${events.length}):\n`;
  output += "------\n";

  events.forEach((event) => {
    const eventName =
      event.properties["Event Name"]?.title
        ?.map((t) => t.plain_text)
        .join("") || "Untitled Event";
    const eventStatus = event.properties["Status"]?.status?.name || "No Status";
    const rawEventType = event.properties["Event Type"]?.select?.name || "";

    // Map event type to emoji version
    const eventType = PERSONAL_EVENT_TYPE_MAPPING[rawEventType] || rawEventType;

    const notes =
      event.properties.Notes?.rich_text?.map((t) => t.plain_text).join("") ||
      "";
    const startDate = event.properties["date:Date:start"]?.date?.start || "";

    output += `${eventStatus} ${eventName}`;
    if (eventType) {
      output += ` (${eventType})`;
    }
    if (startDate) {
      output += ` - ${formatTaskDate(startDate)}`;
    }
    output += "\n";

    if (notes) {
      output += `  Notes: ${notes}\n`;
    }
    output += "\n";
  });

  return output.trim();
}

// Format rocks for Notion with evaluation-style format
function formatRocksForNotion(rocks) {
  if (rocks.length === 0) {
    return "No personal rocks this week.";
  }

  let output = `Personal Rocks (${rocks.length}):\n`;
  output += "------\n";

  rocks.forEach((rock) => {
    let rockTitle =
      rock.properties.Rock?.title?.map((t) => t.plain_text).join("") ||
      "Untitled Rock";

    // Remove number prefixes like "02. " from rock titles
    rockTitle = rockTitle.replace(/^\d+\.\s*/, "");

    const status = rock.properties.Status?.status?.name || "No Status";
    const description =
      rock.properties.Description?.rich_text
        ?.map((t) => t.plain_text)
        .join("") || "";

    // Map status to evaluation format
    if (status.includes("Achieved")) {
      output += `✅ ROCK ACHIEVED: ${rockTitle}${
        description ? ` (${description.trim()})` : ""
      }\n`;
    } else if (status.includes("Good Progress")) {
      output += `✅ ROCK PROGRESS: ${rockTitle}${
        description ? ` (${description.trim()})` : ""
      }\n`;
    } else if (status.includes("Failed")) {
      output += `❌ ROCK FAILED: ${rockTitle}${
        description ? ` (${description.trim()})` : ""
      }\n`;
    } else if (status.includes("Little Progress")) {
      output += `❌ ROCK LITTLE PROGRESS: ${rockTitle}${
        description ? ` (${description.trim()})` : ""
      }\n`;
    }
  });

  return output.trim();
}

// Process a single week
async function processWeek(weekNumber) {
  try {
    const paddedWeek = weekNumber.toString().padStart(2, "0");
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

    // 1. Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      console.log(`❌ Could not find Week ${weekNumber} Recap`);
      return;
    }

    console.log(`✅ Found Week ${paddedWeek} Recap!`);

    // 2. Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      console.log(`❌ Week ${weekNumber} has no week relation`);
      return;
    }

    const weekPageId = weekRelation[0].id;

    // 3. Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
    const dateRange = weekPage.properties["Date Range (SET)"].date;

    if (!dateRange) {
      console.log(`❌ Week ${weekNumber} has no date range`);
      return;
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;
    console.log(`📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}`);

    // 4. Query ALL non-work tasks for this week
    console.log(`\n🔄 Fetching personal tasks...`);

    const tasksResponse = await notion.databases.query({
      database_id: TASKS_DATABASE_ID,
      filter: {
        and: [
          {
            property: "Due Date",
            date: {
              on_or_after: startDate,
            },
          },
          {
            property: "Due Date",
            date: {
              on_or_before: endDate,
            },
          },
          {
            property: "Type",
            select: {
              does_not_equal: "💼 Work",
            },
          },
          {
            property: "Status",
            status: {
              equals: "🟢 Done",
            },
          },
        ],
      },
      sorts: [
        {
          property: "Due Date",
          direction: "ascending",
        },
      ],
    });

    console.log(`📋 Found ${tasksResponse.results.length} personal tasks`);

    // 5. Format tasks for Notion with simplified format
    let summary = "";

    // Define personal task categories in order
    const personalCategories = [
      "🌱 Personal",
      "🍻 Interpersonal",
      "🏠 Home",
      "💪 Physical Health",
      "❤️ Mental Health",
    ];

    // Group tasks by Type with smart matching
    const tasksByCategory = {};

    // Initialize all categories with empty arrays
    personalCategories.forEach((category) => {
      tasksByCategory[category] = [];
    });

    // First, group tasks by title to deduplicate
    const taskGroups = {};

    tasksResponse.results.forEach((task) => {
      const taskType = task.properties["Type"]?.select?.name;

      if (taskType && personalCategories.includes(taskType)) {
        const taskTitle = task.properties.Task.title
          .map((t) => t.plain_text)
          .join("");

        // Create a unique key for each task title + category combination
        const taskKey = `${taskType}:${taskTitle}`;

        if (!taskGroups[taskKey]) {
          taskGroups[taskKey] = {
            title: taskTitle,
            category: taskType,
            count: 0,
          };
        }

        taskGroups[taskKey].count += 1;
      }
    });

    // Now organize deduplicated tasks by category
    Object.values(taskGroups).forEach((taskGroup) => {
      const category = taskGroup.category;
      const title = taskGroup.title;

      tasksByCategory[category].push({
        title: title,
        count: taskGroup.count,
      });
    });

    // 6. Fetch rocks and events first (needed for summary)
    console.log(`\n🪨 Fetching personal rocks...`);
    const rocks = await fetchWeekRocks(startDate, endDate, weekPageId);
    const rocksFormatted = formatRocksForNotion(rocks);

    console.log(`\n🎟️ Fetching personal events...`);
    const events = await fetchWeekEvents(startDate, endDate);
    console.log(`📋 Found ${events.length} personal events`);

    // Debug: Log event details
    events.forEach((event, index) => {
      const eventName =
        event.properties["Event Name"]?.title
          ?.map((t) => t.plain_text)
          .join("") || "Untitled Event";
      const eventStatus =
        event.properties["Status"]?.status?.name || "No Status";
      const eventType = event.properties["Event Type"]?.select?.name || "";
      console.log(
        `  Event ${
          index + 1
        }: "${eventName}" (Status: ${eventStatus}, Type: ${eventType})`
      );
    });

    const eventsFormatted = formatEventsForNotion(events);

    // Calculate totals for summary
    const totalTasks = tasksResponse.results.length;
    const totalUniqueTasks = Object.values(taskGroups).length;

    // Create simplified summary format
    summary = `PERSONAL TASK SUMMARY:\n`;
    summary += `Total: ${totalTasks} tasks (${totalUniqueTasks} unique)\n`;

    // Add events count to summary
    const eventsCount = events.length;
    summary += `- Events: ${eventsCount} event${
      eventsCount !== 1 ? "s" : ""
    }\n`;

    // Add category breakdown
    personalCategories.forEach((category) => {
      const tasks = tasksByCategory[category];
      const taskCount = tasks.length;
      // Get display name without emoji
      const categoryName = category.split(" ").slice(1).join(" ");
      summary += `- ${categoryName}: ${taskCount} tasks\n`;
    });

    // Remove trailing newline
    summary = summary.trim();

    console.log(
      `\n📝 Generated summary with ${tasksResponse.results.length} tasks`
    );

    // 7. Generate evaluation
    const evaluations = generatePersonalTaskEvaluation(
      tasksByCategory,
      rocks,
      eventsFormatted
    );

    // Add evaluation section to summary
    summary += "\n\n===== EVALUATION =====\n";

    // Add events evaluation first
    if (eventsFormatted && !eventsFormatted.includes("No personal events")) {
      // Extract events from the formatted string (after the "------" line)
      const eventsContent = eventsFormatted.split("------\n")[1];
      if (eventsContent) {
        const eventLines = eventsContent
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("Notes:"))
          .map((line) => {
            // Remove "Done" from the beginning of the line
            const cleanLine = line.replace(/^.*?Done\s+/, "");

            // Extract event name and type from "EventName (EventType) - Date"
            const eventMatch = cleanLine.match(/^(.+?)\s*\(([^)]+)\)/);
            if (eventMatch) {
              const eventName = eventMatch[1].trim();
              const eventType = eventMatch[2].trim();
              return `✅ EVENT: ${eventName} (${eventType})`;
            } else {
              // Fallback if no type found
              const eventName = cleanLine.trim();
              return `✅ EVENT: ${eventName}`;
            }
          });

        if (eventLines.length > 0) {
          summary += eventLines.join("\n") + "\n";
          // Print events to console
          console.log(`\n📅 EVENTS EVALUATION:`);
          eventLines.forEach((line) => console.log(`  ${line}`));
        }
      }
    }

    // Add rocks content to evaluation (excluding header)
    if (rocksFormatted && !rocksFormatted.includes("No personal rocks")) {
      // Extract content after the "------" line
      const rocksContent = rocksFormatted.split("------\n")[1];
      if (rocksContent) {
        summary += rocksContent;
      }
    }

    // Add task evaluations after rocks
    if (evaluations.length > 0) {
      if (rocksFormatted && !rocksFormatted.includes("No personal rocks")) {
        summary += "\n"; // Add separator between rocks and task evaluations
      }
      summary += evaluations.join("\n");
    }

    // 8. Update Notion
    const summaryUpdates = {
      "Personal Task Summary": summary,
      "Personal Rocks Summary": rocksFormatted,
      "Personal Events Summary": eventsFormatted,
    };

    await updateAllSummaries(notion, targetWeekPage.id, summaryUpdates);
    console.log(
      `✅ Successfully updated Week ${paddedWeek} recap with tasks, rocks, and events!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error);
  }
}

// Generate personal task evaluation
function generatePersonalTaskEvaluation(
  tasksByCategory,
  rocks,
  eventsFormatted
) {
  const evaluations = [];

  // Check for personal tasks (good when present, bad when 0)
  const personalCount = tasksByCategory["🌱 Personal"]?.length || 0;
  if (personalCount > 0) {
    const taskNames = tasksByCategory["🌱 Personal"]
      .map((t) => t.title)
      .join(", ");
    evaluations.push(
      `✅ PERSONAL TASKS: ${personalCount} completed (${taskNames})`
    );
  } else {
    evaluations.push(`❌ NO PERSONAL TASKS: 0 completed`);
  }

  // Check for home tasks (good when present, bad when 0)
  const homeCount = tasksByCategory["🏠 Home"]?.length || 0;
  if (homeCount > 0) {
    const taskNames = tasksByCategory["🏠 Home"].map((t) => t.title).join(", ");
    evaluations.push(`✅ HOME TASKS: ${homeCount} completed (${taskNames})`);
  } else {
    evaluations.push(`❌ NO HOME TASKS: 0 completed`);
  }

  // Check for physical health tasks (good when present, neutral when 0)
  const physicalHealthCount =
    tasksByCategory["💪 Physical Health"]?.length || 0;
  if (physicalHealthCount > 0) {
    const taskNames = tasksByCategory["💪 Physical Health"]
      .map((t) => t.title)
      .join(", ");
    evaluations.push(
      `✅ PHYSICAL HEALTH TASKS: ${physicalHealthCount} completed (${taskNames})`
    );
  }
  // Note: No evaluation added when physical health tasks count is 0 (not considered bad)

  return evaluations;
}

// Parse personal rocks data directly to extract rock evaluations
function parsePersonalRockEvaluations(rocks) {
  const evaluations = [];

  rocks.forEach((rock) => {
    let rockTitle =
      rock.properties.Rock?.title?.map((t) => t.plain_text).join("") ||
      "Untitled Rock";
    // Remove number prefixes like "02. " from rock titles
    rockTitle = rockTitle.replace(/^\d+\.\s*/, "");

    const status = rock.properties.Status?.status?.name || "No Status";
    const description =
      rock.properties.Description?.rich_text
        ?.map((t) => t.plain_text)
        .join("") || "";

    if (status.includes("Achieved")) {
      evaluations.push({
        type: "good",
        text: `✅ ROCK ACHIEVED: ${rockTitle}${
          description ? ` (${description.trim()})` : ""
        }`,
      });
    } else if (status.includes("Good Progress")) {
      evaluations.push({
        type: "good",
        text: `✅ ROCK PROGRESS: ${rockTitle}${
          description ? ` (${description.trim()})` : ""
        }`,
      });
    } else if (status.includes("Failed")) {
      evaluations.push({
        type: "bad",
        text: `❌ ROCK FAILED: ${rockTitle}${
          description ? ` (${description.trim()})` : ""
        }`,
      });
    } else if (status.includes("Little Progress")) {
      evaluations.push({
        type: "bad",
        text: `❌ ROCK LITTLE PROGRESS: ${rockTitle}${
          description ? ` (${description.trim()})` : ""
        }`,
      });
    }
  });

  return evaluations;
}

// Process all selected weeks
async function processAllWeeks() {
  console.log(`🚀 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
  console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...\n`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log(
    `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
  );
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Check for week shortcuts (--1, --2, etc.)
  const weekShortcut = args.find(
    (arg) => arg.startsWith("--") && /^\d+$/.test(arg.slice(2))
  );
  if (weekShortcut) {
    const weekNumber = parseInt(weekShortcut.slice(2));
    TARGET_WEEKS = [weekNumber];
    console.log(`📋 Personal Task Pull\n`);
    console.log(`🚀 Processing week ${weekNumber}...\n`);
    await processAllWeeks();
    return;
  }

  // Check if running in interactive mode
  const result = await checkInteractiveMode(
    args,
    [], // No categories for this script
    DEFAULT_TARGET_WEEKS,
    [] // No active categories
  );

  if (result.isInteractive) {
    console.log("📋 Personal Task Pull\n");
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

    // Show confirmation
    console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);

    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }

    console.log(""); // Empty line before processing
  } else {
    TARGET_WEEKS = result.targetWeeks;
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
