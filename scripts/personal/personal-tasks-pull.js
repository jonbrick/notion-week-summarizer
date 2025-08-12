const { Client } = require("@notionhq/client");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
  askQuestion,
} = require("../../src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("../../src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("../../src/config/task-config");
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

console.log("🌱 Personal Task Pull (Simplified)");

// Helper function to format date nicely
function formatTaskDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);

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

  return `${dayName} ${monthName} ${dateDay}`;
}

// Helper function to format trips and events with proper line breaks and day sorting
function formatTripsAndEvents(rawText) {
  if (!rawText || rawText.trim() === "") {
    return "No trips/events this week";
  }

  // Split by commas and clean up each item
  const items = rawText
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    return "No trips/events this week";
  }

  // Sort by day of week (Sun, Mon, Tue, Wed, Thu, Fri, Sat)
  const dayOrder = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  items.sort((a, b) => {
    const dayA = dayOrder.find((day) => a.includes(day)) || "Unknown";
    const dayB = dayOrder.find((day) => b.includes(day)) || "Unknown";
    return dayOrder.indexOf(dayA) - dayOrder.indexOf(dayB);
  });

  // Join with line breaks
  return items.join("\n");
}

// Fetch rocks for the week
async function fetchWeekRocks(startDate, endDate, weekPageId) {
  try {
    if (!process.env.ROCKS_DATABASE_ID) {
      console.log("   ⚠️  No ROCKS_DATABASE_ID configured, skipping rocks");
      return [];
    }

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
    console.error("   ❌ Error fetching rocks:", error.message);
    return [];
  }
}

// Format rocks for Notion
function formatRocksForNotion(rocks) {
  if (rocks.length === 0) {
    return "No rocks this week";
  }

  let output = "";

  rocks.forEach((rock, index) => {
    if (index > 0) output += "\n";

    let rockTitle =
      rock.properties.Rock?.title?.map((t) => t.plain_text).join("") ||
      "Untitled Rock";
    rockTitle = rockTitle.replace(/^\d+\.\s*/, "");

    const status = rock.properties.Status?.status?.name || "No Status";
    const description =
      rock.properties.Description?.rich_text
        ?.map((t) => t.plain_text)
        .join("") || "";

    output += `${status}: ${rockTitle}`;
    if (description) {
      output += ` (${description.trim()})`;
    }
  });

  return output;
}

// Generate Personal Task Summary
function generatePersonalTaskSummary(
  tasksByCategory,
  totalTasks,
  totalUniqueTasks,
  rocksFormatted,
  tripsData,
  eventsData
) {
  let summary = "";

  // TRIPS section - only show if there are trips
  if (
    tripsData &&
    tripsData.length > 0 &&
    tripsData[0] &&
    tripsData[0].trim() !== ""
  ) {
    summary += "===== TRIPS =====\n";
    tripsData.forEach((trip) => {
      summary += `${formatTripsAndEvents(trip)}\n`;
    });
  }

  // EVENTS section - only show if there are events
  if (
    eventsData &&
    eventsData.length > 0 &&
    eventsData[0] &&
    eventsData[0].trim() !== ""
  ) {
    summary += "\n===== EVENTS =====\n";
    eventsData.forEach((event) => {
      summary += `${formatTripsAndEvents(event)}\n`;
    });
  }

  // SUMMARY section
  summary += "\n===== SUMMARY =====\n";
  summary += `Total: ${totalTasks} tasks (${totalUniqueTasks} unique)\n`;

  // Personal categories order
  const categoryOrder = [
    { key: "🌱 Personal", name: "Personal" },
    { key: "💪 Physical Health", name: "Physical Health" },
    { key: "🍻 Interpersonal", name: "Interpersonal" },
    { key: "❤️ Mental Health", name: "Mental Health" },
    { key: "🏠 Home", name: "Home" },
  ];

  categoryOrder.forEach(({ key, name }) => {
    const tasks = tasksByCategory[key] || [];
    const taskCount = tasks.reduce((sum, task) => sum + task.count, 0);

    // Special rules:
    // - Interpersonal is ALWAYS ☑️ (even if > 0)
    // - Physical Health: ✅ if tasks > 0, ☑️ if 0
    // - Other categories: ✅ if tasks > 0, ☑️ if 0
    let emoji;
    if (name === "Interpersonal") {
      emoji = "☑️"; // Always silver for Interpersonal
    } else if (name === "Physical Health") {
      emoji = taskCount > 0 ? "✅" : "☑️"; // Always follow standard rule for Physical Health
    } else {
      emoji = taskCount > 0 ? "✅" : "☑️";
    }

    summary += `${emoji} ${name}: ${taskCount} tasks\n`;
  });

  // ROCKS section
  summary += "\n===== ROCKS =====\n";
  summary += rocksFormatted || "No rocks this week";

  // TASKS section
  summary += "\n\n===== TASKS =====\n";

  let hasAnyTasks = false;
  categoryOrder.forEach(({ key, name }) => {
    const tasks = tasksByCategory[key] || [];

    // Skip Interpersonal tasks in the TASKS section
    if (name === "Interpersonal") {
      return;
    }

    if (tasks.length > 0) {
      hasAnyTasks = true;
      const totalInCategory = tasks.reduce((sum, task) => sum + task.count, 0);
      summary += `${name} (${totalInCategory})\n`;

      tasks.forEach((task) => {
        if (task.count === 1) {
          summary += `• ${task.title}\n`;
        } else {
          summary += `• ${task.title} (x${task.count})\n`;
        }
      });
      summary += "\n";
    }
  });

  if (!hasAnyTasks) {
    summary += "No tasks completed this week\n";
  }

  return summary.trim();
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

    // 4. Query personal tasks for this week
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

    // 5. Group tasks by Type with deduplication
    const tasksByCategory = {};
    const taskGroups = {};

    // Personal categories
    const personalCategories = [
      "🌱 Personal",
      "💪 Physical Health",
      "🍻 Interpersonal",
      "❤️ Mental Health",
      "🏠 Home",
    ];

    // Tasks to exclude from Home category (case-insensitive)
    const excludedHomeTasks = [
      "Laundry",
      "Basha clean",
      "Basha clean apartment",
      "Basha clean up",
      // Add more excluded tasks here as needed
    ];

    // Tasks to exclude from Personal category (case-insensitive)
    const excludedPersonalTasks = [
      "shower",
      "shave",
      "groceries",
      "grocery store",
      // Add more excluded personal tasks here as needed
    ];

    // Tasks to exclude from Physical Health category (case-insensitive)
    const excludedPhysicalHealthTasks = [
      "run",
      "workout",
      // Add more excluded physical health tasks here as needed
    ];

    // Initialize categories
    personalCategories.forEach((category) => {
      tasksByCategory[category] = [];
    });

    // Group and deduplicate tasks
    tasksResponse.results.forEach((task) => {
      const taskType = task.properties["Type"]?.select?.name;

      if (taskType && personalCategories.includes(taskType)) {
        const taskTitle = task.properties.Task.title
          .map((t) => t.plain_text)
          .join("")
          .trim();

        // Skip excluded Home tasks
        if (
          taskType === "🏠 Home" &&
          excludedHomeTasks.some(
            (excluded) => taskTitle.toLowerCase() === excluded.toLowerCase()
          )
        ) {
          return;
        }

        // Skip excluded Personal tasks
        if (
          taskType === "🌱 Personal" &&
          excludedPersonalTasks.some(
            (excluded) => taskTitle.toLowerCase() === excluded.toLowerCase()
          )
        ) {
          return;
        }

        // Skip excluded Physical Health tasks
        if (
          taskType === "💪 Physical Health" &&
          excludedPhysicalHealthTasks.some((excluded) =>
            taskTitle.toLowerCase().includes(excluded.toLowerCase())
          )
        ) {
          return;
        }

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

    // Organize by category
    Object.values(taskGroups).forEach((taskGroup) => {
      tasksByCategory[taskGroup.category].push({
        title: taskGroup.title,
        count: taskGroup.count,
      });
    });

    // Calculate totals
    const totalTasks = tasksResponse.results.length;
    const totalUniqueTasks = Object.values(taskGroups).length;

    // 6. Fetch rocks
    console.log(`\n🪨 Fetching personal rocks...`);
    const rocks = await fetchWeekRocks(startDate, endDate, weekPageId);
    const rocksFormatted = formatRocksForNotion(rocks);
    console.log(`   Found ${rocks.length} rocks`);

    // 7. Fetch trips and events
    console.log(`\n🚗 Fetching trips and events...`);

    // Get trips and events directly from the week recap page
    const weekRecapPage = await notion.pages.retrieve({
      page_id: targetWeekPage.id,
    });

    // Extract Trip Details
    const tripDetails =
      weekRecapPage.properties["Trip Details"]?.formula?.string;
    const tripsData = tripDetails ? [tripDetails] : [];
    console.log(`   Found ${tripsData.length} trips`);

    // Extract Event Details
    const eventDetails =
      weekRecapPage.properties["Event Details"]?.formula?.string;
    const eventsData = eventDetails ? [eventDetails] : [];
    console.log(`   Found ${eventsData.length} events`);

    // 8. Generate Personal Task Summary
    const personalTaskSummary = generatePersonalTaskSummary(
      tasksByCategory,
      totalTasks,
      totalUniqueTasks,
      rocksFormatted,
      tripsData,
      eventsData
    );

    // 9. Update Notion
    console.log(`\n📝 Updating Notion...`);
    const summaryUpdates = {
      "Personal Task Summary": personalTaskSummary,
    };

    console.log(`📊 Summary preview:`);
    console.log(`   Total tasks: ${totalTasks} (${totalUniqueTasks} unique)`);
    personalCategories.forEach((category) => {
      const count = tasksByCategory[category].reduce(
        (sum, t) => sum + t.count,
        0
      );
      if (count > 0) {
        console.log(`   ${category}: ${count} tasks`);
      }
    });
    console.log(`   Rocks: ${rocks.length}`);
    console.log(`   Trips: ${tripsData.length}`);
    console.log(`   Events: ${eventsData.length}`);

    await updateAllSummaries(notion, targetWeekPage.id, summaryUpdates);
    console.log(
      `✅ Successfully updated Week ${paddedWeek} Personal Task Summary!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
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
    console.log(`🚀 Processing week ${weekNumber}...\n`);
    await processAllWeeks();
    return;
  }

  // Check if running in interactive mode
  const result = await checkInteractiveMode(args, [], DEFAULT_TARGET_WEEKS, []);

  if (result.isInteractive) {
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
      process.exit(0);
    }

    console.log("");
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
