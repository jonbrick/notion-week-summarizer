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
      database_id: process.env.ROCKS_DATABASE_ID, // You'll need to add this to .env
      filter: {
        and: [
          {
            property: "⌛ Weeks",
            relation: {
              contains: weekPageId, // We'll need to pass this in
            },
          },
          {
            or: [
              {
                property: "Type",
                select: {
                  equals: "💼 Work",
                },
              },
              {
                property: "Work Category",
                select: {
                  is_not_empty: true,
                },
              },
            ],
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
    console.log(
      `🔍 Fetching events from database: ${process.env.EVENTS_DATABASE_ID}`
    );
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    const eventsResponse = await notion.databases.query({
      database_id: process.env.EVENTS_DATABASE_ID, // You'll need to add this to .env
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
            or: [
              {
                property: "Event Type",
                select: {
                  equals: "💼 Work Event",
                },
              },
              {
                property: "Event Type",
                select: {
                  equals: "🍸 Work Social",
                },
              },
              {
                property: "Event Type",
                select: {
                  equals: "🏝️ Work OOO",
                },
              },
            ],
          },
        ],
      },
    });

    console.log(`📊 Found ${eventsResponse.results.length} work events`);

    // Log the first few events to debug
    if (eventsResponse.results.length > 0) {
      console.log("📋 Sample events:");
      eventsResponse.results.slice(0, 3).forEach((event, index) => {
        const eventName =
          event.properties["Event Name"]?.title
            ?.map((t) => t.plain_text)
            .join("") || "Untitled";
        const eventType =
          event.properties["Event Type"]?.select?.name || "No Type";
        const status = event.properties["Status"]?.status?.name || "No Status";
        console.log(`  ${index + 1}. ${eventName} (${eventType}) - ${status}`);
      });
    }

    return eventsResponse.results;
  } catch (error) {
    console.error("Error fetching events:", error);
    return [];
  }
}

// Format rocks for Notion with simplified format
function formatRocksForNotion(rocks) {
  if (rocks.length === 0) {
    return "WORK ROCKS (0):\nNo work rocks this week";
  }

  let output = `WORK ROCKS (${rocks.length}):\n`;

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

    // Use the actual status from the database
    output += `${status}: ${rockTitle}${
      description ? ` (${description.trim()})` : ""
    }\n`;
  });

  return output.trim();
}

// Format events for Notion with evaluation-style format (similar to rocks)
function formatEventsForNotion(events) {
  if (events.length === 0) {
    return "WORK EVENTS (0):\nNo work events this week";
  }

  // Sort events by actual date (more accurate than day of week string)
  const sortedEvents = events.sort((a, b) => {
    const dateA = a.properties["Date"]?.date?.start || "";
    const dateB = b.properties["Date"]?.date?.start || "";

    // If both have dates, sort chronologically
    if (dateA && dateB) {
      return new Date(dateA) - new Date(dateB);
    }
    // If only one has a date, prioritize the one with a date
    if (dateA) return -1;
    if (dateB) return 1;
    // If neither has a date, keep original order
    return 0;
  });

  let output = `WORK EVENTS (${events.length}):\n`;

  sortedEvents.forEach((event) => {
    const eventName =
      event.properties["Event Name"]?.title
        ?.map((t) => t.plain_text)
        .join("") || "Untitled Event";
    const eventStatus = event.properties["Status"]?.status?.name || "No Status";
    const eventType = event.properties["Event Type"]?.select?.name || "";
    const dayOfWeek = event.properties["Day of week"]?.formula?.string || "";
    const notes =
      event.properties.Notes?.rich_text?.map((t) => t.plain_text).join("") ||
      "";
    const startDate = event.properties["date:Date:start"]?.date?.start || "";

    // Use the actual Status value directly (like rocks do)
    if (dayOfWeek) {
      output += `${eventStatus} ${dayOfWeek}: ${eventName}`;
      if (eventType) {
        output += ` (${eventType})`;
      }
    } else {
      output += `${eventStatus}: ${eventName}`;
      if (eventType) {
        output += ` (${eventType})`;
      }
      if (startDate) {
        output += ` - ${formatTaskDate(startDate)}`;
      }
    }
    output += "\n";

    if (notes) {
      output += `  Notes: ${notes}\n`;
    }
  });

  return output.trim();
}

// Parse rocks data directly to extract rock evaluations
function parseRockEvaluations(rocks) {
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

// Generate task evaluation
function generateTaskEvaluation(tasksByType, rocks, eventsFormatted) {
  const evaluations = [];

  // Parse rock evaluations first (they go at top) - only if rocks are provided
  if (rocks.length > 0) {
    const rockEvals = parseRockEvaluations(rocks);

    // Add good evaluations first
    rockEvals
      .filter((r) => r.type === "good")
      .forEach((r) => evaluations.push(r.text));
  }

  // Check for research tasks (good when present, not bad when absent)
  const researchCount = tasksByType["Research"]?.length || 0;
  if (researchCount > 0) {
    const taskNames = tasksByType["Research"].map((t) => t.title).join(", ");
    evaluations.push(
      `✅ RESEARCH TASKS: ${researchCount} completed (${taskNames})`
    );
  }

  // Check for QA tasks (good when present, not bad when absent)
  const qaCount = tasksByType["QA"]?.length || 0;
  if (qaCount > 0) {
    const taskNames = tasksByType["QA"].map((t) => t.title).join(", ");
    evaluations.push(`✅ QA TASKS: ${qaCount} completed (${taskNames})`);
  }

  // Check for feedback tasks (good when present, not bad when absent)
  const feedbackCount = tasksByType["Feedback"]?.length || 0;
  if (feedbackCount > 0) {
    const taskNames = tasksByType["Feedback"].map((t) => t.title).join(", ");
    evaluations.push(
      `✅ FEEDBACK TASKS: ${feedbackCount} completed (${taskNames})`
    );
  }

  // Check for coding tasks (good when present)
  const codingTasksCount = tasksByType["Coding"]?.length || 0;
  if (codingTasksCount > 0) {
    const taskNames = tasksByType["Coding"].map((t) => t.title).join(", ");
    evaluations.push(
      `✅ CODING TASKS: ${codingTasksCount} completed (${taskNames})`
    );
  }

  // Check for design tasks (good when present)
  const designTasksCount = tasksByType["Design"]?.length || 0;
  if (designTasksCount > 0) {
    const taskNames = tasksByType["Design"].map((t) => t.title).join(", ");
    evaluations.push(
      `✅ DESIGN TASKS: ${designTasksCount} completed (${taskNames})`
    );
  }

  // Check for work events (good when present)
  if (eventsFormatted && !eventsFormatted.includes("No work events")) {
    const eventLines = eventsFormatted
      .split("\n")
      .filter(
        (line) =>
          line.includes("✅") ||
          line.includes("👾") ||
          line.includes("🚧") ||
          line.includes("🥊") ||
          line.includes("Attended") ||
          line.includes("Completed") ||
          line.includes("Done")
      );
    if (eventLines.length > 0) {
      const eventCount = eventLines.length;
      evaluations.push(`✅ WORK EVENTS: ${eventCount} attended`);
    }
  }

  // Add bad rock evaluations - only if rocks are provided
  if (rocks.length > 0) {
    const rockEvals = parseRockEvaluations(rocks);
    rockEvals
      .filter((r) => r.type === "bad")
      .forEach((r) => evaluations.push(r.text));
  }

  // Check for missing design tasks (always bad when 0)
  const designCount = tasksByType["Design"]?.length || 0;
  if (designCount === 0) {
    evaluations.push(`❌ NO DESIGN TASKS: 0 completed`);
  }

  // Check for missing coding tasks (always bad when 0)
  const codingCount = tasksByType["Coding"]?.length || 0;
  if (codingCount === 0) {
    evaluations.push(`❌ NO CODING TASKS: 0 completed`);
  }

  return evaluations;
}

// Helper function to filter out OOO tasks from work activity summary
function filterOutOOOTasks(workActivitySummary) {
  if (!workActivitySummary || workActivitySummary.includes("No work tasks")) {
    return workActivitySummary;
  }

  const lines = workActivitySummary.split("\n");
  const filteredLines = [];
  let skipOOOSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip the header line (WORK ACTIVITY SUMMARY)
    if (line.startsWith("WORK ACTIVITY SUMMARY")) {
      filteredLines.push(line);
      continue;
    }

    // If we encounter an OOO section, mark it to skip
    if (line.trim().startsWith("OOO (")) {
      skipOOOSection = true;
      continue;
    }

    // If we're in an OOO section, skip all lines until we find the next category
    if (skipOOOSection) {
      // Check if this line starts a new category (ends with "(")
      if (line.trim().endsWith("(") && !line.trim().startsWith("OOO")) {
        skipOOOSection = false;
        filteredLines.push(line);
      }
      // If it's a task line (starts with "•"), skip it
      else if (line.trim().startsWith("•")) {
        continue;
      }
      // If it's the end of the OOO section (empty line or end of file), stop skipping
      else if (line.trim() === "" || i === lines.length - 1) {
        skipOOOSection = false;
      }
      continue;
    }

    // Add the line if we're not skipping
    filteredLines.push(line);
  }

  return filteredLines.join("\n");
}

// Helper function to clean events content for Work Task Summary
function cleanEventsForWorkTaskSummary(eventsFormatted) {
  if (!eventsFormatted || eventsFormatted.includes("No work events")) {
    return eventsFormatted;
  }

  const lines = eventsFormatted.split("\n");
  const cleanedLines = [];

  lines.forEach((line) => {
    // Remove "Done " from the beginning of lines that start with status + day
    const cleanedLine = line.replace(/^(✅|👾|🚧|🥊)\s+Done\s+/, "$1 ");
    cleanedLines.push(cleanedLine);
  });

  return cleanedLines.join("\n");
}

// Helper function to clean rocks content for Work Task Summary
function cleanRocksForWorkTaskSummary(rocksFormatted) {
  if (!rocksFormatted || rocksFormatted.includes("No work rocks")) {
    return rocksFormatted;
  }

  const lines = rocksFormatted.split("\n");
  const cleanedLines = [];

  lines.forEach((line) => {
    // Remove content in parentheses at the end of the line
    const cleanedLine = line.replace(/\s*\([^)]*\)$/, "");
    cleanedLines.push(cleanedLine);
  });

  return cleanedLines.join("\n");
}

// Generate new Work Task Summary structure
function generateWorkTaskSummary(
  tasksByCategory,
  totalTasks,
  totalUniqueTasks,
  rocksFormatted,
  eventsFormatted,
  workActivitySummary
) {
  let summary = "";

  // Add EVENTS section first (if there are events) - similar to work-cal-pull.js
  if (eventsFormatted && !eventsFormatted.includes("No work events")) {
    // Clean events content for Work Task Summary
    const cleanedEvents = cleanEventsForWorkTaskSummary(eventsFormatted);
    // Extract content after the header line
    const lines = cleanedEvents.split("\n");
    const eventsContent = lines.slice(1).join("\n"); // Skip the header line
    if (eventsContent) {
      summary += "===== EVENTS =====\n";
      summary += eventsContent;
      summary += "\n\n";
    }
  }

  // Add SUMMARY section
  summary += "===== SUMMARY =====\n";
  summary += `Total: ${totalTasks} tasks (${totalUniqueTasks} unique)\n`;

  // Add category breakdown with emojis (excluding OOO and Undefined)
  const allCategories = [
    "Design",
    "Coding",
    "Research",
    "Feedback",
    "QA",
    "Admin",
    "Social",
  ];

  allCategories.forEach((category) => {
    const tasks = tasksByCategory[category] || [];
    const taskCount = tasks.reduce((sum, task) => sum + task.count, 0);

    // Admin, Social always get ☑️ (even when 0)
    if (category === "Admin" || category === "Social") {
      summary += `☑️ ${category}: ${taskCount} tasks\n`;
    } else if (taskCount > 0) {
      summary += `✅ ${category}: ${taskCount} tasks\n`;
    } else {
      summary += `❌ ${category}: 0 tasks\n`;
    }
  });

  // Add OOO separately since it's not in the main categories
  const oooTasks = tasksByCategory["OOO"] || [];
  const oooCount = oooTasks.reduce((sum, task) => sum + task.count, 0);
  summary += `☑️ OOO: ${oooCount} tasks\n`;

  // Add Undefined separately (only if it has tasks) - positioned after OOO
  const undefinedTasks = tasksByCategory["Undefined"] || [];
  const undefinedCount = undefinedTasks.reduce(
    (sum, task) => sum + task.count,
    0
  );
  if (undefinedCount > 0) {
    summary += `☑️ Undefined: ${undefinedCount} tasks\n`;
  }

  // Add ROCKS section (from Work Rocks Summary)
  summary += "\n===== ROCKS =====\n";
  if (rocksFormatted && !rocksFormatted.includes("No work rocks")) {
    // Clean rocks content for Work Task Summary
    const cleanedRocks = cleanRocksForWorkTaskSummary(rocksFormatted);
    // Extract content after the header line
    const lines = cleanedRocks.split("\n");
    const rocksContent = lines.slice(1).join("\n"); // Skip the header line
    if (rocksContent) {
      summary += rocksContent;
    }
  } else {
    summary += "No rocks this week\n";
  }

  // Add TASKS section (from Work Activity Summary) - filtered to exclude OOO
  summary += "\n\n===== TASKS =====\n";
  if (workActivitySummary && !workActivitySummary.includes("No work tasks")) {
    // Filter out OOO tasks from the work activity summary
    const filteredWorkActivitySummary = filterOutOOOTasks(workActivitySummary);

    // Extract content after the header line
    const lines = filteredWorkActivitySummary.split("\n");
    const tasksContent = lines.slice(1).join("\n"); // Skip the header line
    if (tasksContent) {
      summary += tasksContent;
    }
  } else {
    summary += "No tasks completed this week\n";
  }

  return summary.trim();
}

// Format work activity summary
function formatWorkActivitySummary(tasks) {
  if (tasks.length === 0) {
    return "WORK ACTIVITY SUMMARY (0):\nNo work tasks completed this week";
  }

  // Define categories in order (including OOO for Work Activity Summary)
  const categories = [
    "Design",
    "Coding",
    "Review",
    "QA",
    "Research",
    "Social",
    "Undefined",
    "OOO",
  ];

  // Group tasks by category with deduplication
  const tasksByCategory = {};
  categories.forEach((category) => {
    tasksByCategory[category] = {};
  });

  tasks.forEach((task) => {
    const taskTitle = task.properties.Task.title
      .map((t) => t.plain_text)
      .join("")
      .trim(); // Trim whitespace to prevent duplicates
    let category =
      task.properties["Work Category"]?.select?.name || "Undefined";

    // Smart matching for categories
    if (category.includes("Admin")) {
      category = "Admin";
    } else if (category.includes("Crit") || category.includes("Feedback")) {
      category = "Review";
    }

    // Only include predefined categories (including OOO for Work Activity Summary)
    if (categories.includes(category)) {
      if (!tasksByCategory[category][taskTitle]) {
        tasksByCategory[category][taskTitle] = 0;
      }
      tasksByCategory[category][taskTitle]++;
    }
  });

  let output = `WORK ACTIVITY SUMMARY (${tasks.length}):`;

  // Add each category section
  categories.forEach((category) => {
    const categoryTasks = tasksByCategory[category];
    const taskEntries = Object.entries(categoryTasks);

    if (taskEntries.length > 0) {
      // Calculate total tasks in this category
      const totalTasks = taskEntries.reduce(
        (sum, [_, count]) => sum + count,
        0
      );
      output += `\n${category} (${totalTasks})\n`;

      taskEntries.forEach(([taskTitle, count]) => {
        if (count === 1) {
          output += `• ${taskTitle}\n`;
        } else {
          output += `• ${taskTitle} (x${count})\n`;
        }
      });
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

    // 4. Query work tasks for this week
    console.log(`\n🔄 Fetching work tasks...`);

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
              equals: "💼 Work",
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

    console.log(`📋 Found ${tasksResponse.results.length} work tasks`);

    // 5. Format tasks for Notion with simplified format
    let summary = "";

    // Define all work categories in custom order
    const allCategories = [
      "Research",
      "Design",
      "Coding",
      "Feedback",
      "QA",
      "Admin",
      "Social",
      "OOO",
    ];

    // Group tasks by Work Category with smart matching
    const tasksByCategory = {};

    // Initialize all categories with empty arrays
    allCategories.forEach((category) => {
      tasksByCategory[category] = [];
    });

    // First, group tasks by title to deduplicate
    const taskGroups = {};

    tasksResponse.results.forEach((task) => {
      let category =
        task.properties["Work Category"]?.select?.name || "No Category";

      // Smart matching for Admin and Feedback
      if (category.includes("Admin")) {
        category = "Admin";
      } else if (category.includes("Crit")) {
        category = "Feedback";
      }

      // Only add to predefined categories, ignore others
      if (allCategories.includes(category)) {
        const taskTitle = task.properties.Task.title
          .map((t) => t.plain_text)
          .join("");

        // Create a unique key for each task title + category combination
        const taskKey = `${category}:${taskTitle}`;

        if (!taskGroups[taskKey]) {
          taskGroups[taskKey] = {
            title: taskTitle,
            category: category,
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

    // Calculate totals for summary
    const totalTasks = tasksResponse.results.length;
    const totalUniqueTasks = Object.values(taskGroups).length;

    console.log(
      `\n📝 Generated summary with ${tasksResponse.results.length} tasks`
    );

    // Create Work Activity Summary
    const workActivitySummary = formatWorkActivitySummary(
      tasksResponse.results
    );

    // 6. Fetch rocks and events
    console.log(`\n🪨 Fetching work rocks...`);
    const rocks = await fetchWeekRocks(startDate, endDate, weekPageId);
    const rocksFormatted = formatRocksForNotion(rocks);

    console.log(`\n🎟️ Fetching work events...`);
    const events = await fetchWeekEvents(startDate, endDate);
    const eventsFormatted = formatEventsForNotion(events);

    // 7. Generate new Work Task Summary structure
    const workTaskSummary = generateWorkTaskSummary(
      tasksByCategory,
      totalTasks,
      totalUniqueTasks,
      rocksFormatted,
      eventsFormatted,
      workActivitySummary
    );

    // 8. Update Notion
    const summaryUpdates = {
      "Work Task Summary": workTaskSummary,
      "Work Rocks Summary": rocksFormatted,
      "Work Events Summary": eventsFormatted,
      "Work Activity Summary": workActivitySummary,
    };

    await updateAllSummaries(notion, targetWeekPage.id, summaryUpdates);
    console.log(
      `✅ Successfully updated Week ${paddedWeek} recap with tasks, rocks, and events!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error);
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

  // Check if running in interactive mode
  const result = await checkInteractiveMode(
    args,
    [], // No categories for this script
    DEFAULT_TARGET_WEEKS,
    [] // No active categories
  );

  if (result.isInteractive) {
    console.log("📋 Work Task Pull\n");
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
