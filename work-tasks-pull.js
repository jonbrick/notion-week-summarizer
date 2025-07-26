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
            property: "Event Type",
            select: {
              equals: "💼 Work",
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

// Format rocks for Notion with evaluation-style format
function formatRocksForNotion(rocks) {
  if (rocks.length === 0) {
    return "No work rocks this week.";
  }

  let output = `Work Rocks (${rocks.length}):\n`;
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

// Format events for Notion
function formatEventsForNotion(events) {
  if (events.length === 0) {
    return "No work events this week.";
  }

  let output = `Work Events (${events.length}):\n`;
  output += "------\n";

  events.forEach((event) => {
    const eventName =
      event.properties["Event Name"]?.title
        ?.map((t) => t.plain_text)
        .join("") || "Untitled Event";
    const eventStatus = event.properties["Status"]?.status?.name || "No Status";
    const eventType = event.properties["Event Type"]?.select?.name || "";
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
          line.includes("🥊")
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

    // Create simplified summary format
    summary = `WORK TASK SUMMARY:\n`;
    summary += `Total: ${totalTasks} tasks (${totalUniqueTasks} unique)\n`;

    // Add category breakdown
    allCategories.forEach((category) => {
      const tasks = tasksByCategory[category];
      const taskCount = tasks.length;
      if (taskCount > 0) {
        summary += `- ${category}: ${taskCount} tasks\n`;
      }
    });

    // Remove trailing newline
    summary = summary.trim();

    console.log(
      `\n📝 Generated summary with ${tasksResponse.results.length} tasks`
    );

    // 6. Fetch rocks and events
    console.log(`\n🪨 Fetching work rocks...`);
    const rocks = await fetchWeekRocks(startDate, endDate, weekPageId);
    const rocksFormatted = formatRocksForNotion(rocks);

    console.log(`\n🎟️ Fetching work events...`);
    const events = await fetchWeekEvents(startDate, endDate);
    const eventsFormatted = formatEventsForNotion(events);

    // 7. Generate evaluation (excluding rocks since they're in their own summary)
    const evaluations = generateTaskEvaluation(
      tasksByCategory,
      [], // Empty array since rocks are handled separately
      eventsFormatted
    );

    // Add evaluation section to summary
    summary += "\n\n===== EVALUATION =====\n";

    // Add rocks content to evaluation first (excluding header)
    if (rocksFormatted && !rocksFormatted.includes("No work rocks")) {
      // Extract content after the "------" line
      const rocksContent = rocksFormatted.split("------\n")[1];
      if (rocksContent) {
        summary += rocksContent;
      }
    }

    // Add task evaluations after rocks
    if (evaluations.length > 0) {
      if (rocksFormatted && !rocksFormatted.includes("No work rocks")) {
        summary += "\n"; // Add separator between rocks and task evaluations
      }
      summary += evaluations.join("\n");
    }

    // 8. Update Notion
    const summaryUpdates = {
      "Work Task Summary": summary,
      "Work Rocks Summary": rocksFormatted,
      "Work Events Summary": eventsFormatted,
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
