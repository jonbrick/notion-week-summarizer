const { Client } = require("@notionhq/client");
const { findWeekRecapPage } = require("../src/utils/notion-utils");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

/**
 * Get week date range from Notion (same pattern as existing scripts)
 */
async function getWeekDateRange(weekNumber) {
  // Find the week recap page
  const targetWeekPage = await findWeekRecapPage(
    notion,
    RECAP_DATABASE_ID,
    weekNumber
  );

  if (!targetWeekPage) {
    throw new Error(`Could not find Week ${weekNumber} Recap`);
  }

  // Get the week relation
  const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
  if (!weekRelation || weekRelation.length === 0) {
    throw new Error(`Week ${weekNumber} has no week relation`);
  }

  const weekPageId = weekRelation[0].id;

  // Get the week details for date range
  const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
  const dateRange = weekPage.properties["Date Range (SET)"].date;

  if (!dateRange) {
    throw new Error(`Week ${weekNumber} has no date range`);
  }

  return {
    startDate: dateRange.start,
    endDate: dateRange.end,
  };
}

/**
 * Format tasks for a column (grouped by Type)
 * Copied exactly from archive script with chronological sorting added
 */
function formatTasksColumn(tasks, columnName) {
  if (!tasks || tasks.length === 0) {
    return `${columnName.toUpperCase()} (0 tasks):\nNo ${columnName.toLowerCase()} this week`;
  }

  // Group tasks by Type
  const tasksByType = {};
  const typeOrder = [
    "🌱 Personal",
    "💪 Physical Health",
    "🍻 Interpersonal",
    "❤️ Mental Health",
    "🏠 Home",
  ];

  // Initialize all types
  typeOrder.forEach((type) => {
    tasksByType[type] = [];
  });

  // Group tasks
  tasks.forEach((task) => {
    const taskType = task.properties["Type"]?.select?.name;
    const taskTitle = task.properties.Task.title
      .map((t) => t.plain_text)
      .join("")
      .trim();
    const dueDate = task.properties["Due Date"]?.date?.start;

    if (taskType && tasksByType[taskType] !== undefined) {
      tasksByType[taskType].push({
        title: taskTitle,
        dueDate: dueDate,
      });
    }
  });

  // Sort tasks within each category by due date (Sunday -> Saturday)
  typeOrder.forEach((type) => {
    if (tasksByType[type].length > 0) {
      tasksByType[type].sort((a, b) => {
        // Handle missing dates by putting them at the end
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;

        return a.dueDate.localeCompare(b.dueDate);
      });
    }
  });

  // Build output
  let output = `${columnName.toUpperCase()} (${tasks.length} task`;
  if (tasks.length !== 1) output += "s";
  output += "):\n";

  // Add each type that has tasks
  let firstSection = true;
  typeOrder.forEach((type) => {
    if (tasksByType[type].length > 0) {
      if (!firstSection) {
        output += "\n"; // Add blank line between sections
      }
      firstSection = false;

      // Get clean type name (remove emoji)
      const typeName = type.split(" ").slice(1).join(" ");

      output += `${typeName} Tasks (${tasksByType[type].length})\n`;
      tasksByType[type].forEach((task) => {
        const dateStr = task.dueDate
          ? ` (${formatTaskDate(task.dueDate)})`
          : "";
        output += `• ${task.title}${dateStr}\n`;
      });
    }
  });

  return output.trim();
}

/**
 * Format date with day of week
 */
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

/**
 * Pull personal tasks for a given week
 * @param {number} weekNumber - Week number (1-52)
 * @returns {Object} - Object with "Personal Tasks" key containing formatted string
 */
async function pullPersonalTasks(weekNumber) {
  try {
    console.log(`📥 Fetching Personal Tasks for Week ${weekNumber}...`);

    const { startDate, endDate } = await getWeekDateRange(weekNumber);
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // Fetch Personal Tasks from Notion - copied exactly from archive script
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

    const formattedTasks = formatTasksColumn(
      tasksResponse.results,
      "Personal Tasks"
    );

    console.log(`   Tasks: ${tasksResponse.results.length} tasks`);

    return {
      "Personal Tasks": formattedTasks,
    };
  } catch (error) {
    console.error(
      `❌ Error pulling personal tasks for Week ${weekNumber}:`,
      error.message
    );
    return {
      "Personal Tasks":
        "PERSONAL TASKS (0 tasks):\nError fetching tasks this week",
    };
  }
}

module.exports = {
  pullPersonalTasks,
  getWeekDateRange,
};
