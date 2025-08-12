// data-pulls/pull-personal-tasks.js
const { Client } = require("@notionhq/client");
require("dotenv").config();

// Initialize Notion client
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;

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

// Format tasks for a specific category
function formatTasksForCategory(tasks, categoryName) {
  if (tasks.length === 0) {
    return `${categoryName.toUpperCase()} TASKS (0):\nNo ${categoryName.toLowerCase()} tasks completed this week`;
  }

  const formattedTasks = tasks.map((task) => {
    const title = task.properties.Task?.title?.[0]?.plain_text || "Untitled";
    const dueDate = task.properties["Due Date"]?.date?.start;
    const dateStr = dueDate ? ` (${formatTaskDate(dueDate)})` : "";
    return `• ${title}${dateStr}`;
  });

  let output = `${categoryName.toUpperCase()} TASKS (${tasks.length}):\n`;
  output += formattedTasks.join("\n");

  return output;
}

/**
 * Pull personal tasks for a specific week
 * @param {number} weekNumber - The week number to pull tasks for
 * @returns {Object} Object containing formatted task data for each category
 */
async function pullPersonalTasks(weekNumber) {
  console.log(`\n📋 Fetching personal tasks for Week ${weekNumber}...`);

  try {
    // Find the week recap page
    const recapPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!recapPage) {
      throw new Error(`Week ${weekNumber} recap page not found`);
    }

    // Get the linked Weeks database entry to find date range
    const weeksRelation = recapPage.properties["⌛ Weeks"]?.relation;
    if (!weeksRelation || weeksRelation.length === 0) {
      throw new Error(`Week ${weekNumber} has no linked Weeks database entry`);
    }

    const weekPageId = weeksRelation[0].id;
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });

    const dateRange = weekPage.properties["Date Range (SET)"]?.date;
    if (!dateRange || !dateRange.start || !dateRange.end) {
      throw new Error(`Week ${weekNumber} has no valid date range`);
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;

    console.log(`   📅 Date range: ${startDate} to ${endDate}`);

    // Validate the date range makes sense
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const now = new Date();

    if (startDateObj > now) {
      console.warn(
        `   ⚠️  Warning: Week ${weekNumber} is in the future (${startDate})`
      );
    }

    // Debug: Let's see what the actual filter is doing
    console.log(
      `   🔍 Filtering tasks with Status='🟢 Done' and dates between ${startDate} and ${endDate}`
    );

    // Fetch completed tasks for this week
    const response = await notion.databases.query({
      database_id: TASKS_DATABASE_ID,
      filter: {
        and: [
          {
            property: "Status",
            status: { equals: "🟢 Done" },
          },
          {
            property: "Due Date",
            date: {
              on_or_after: startDate,
              on_or_before: endDate,
            },
          },
          {
            or: [
              { property: "Type", select: { equals: "🌱 Personal" } },
              { property: "Type", select: { equals: "🏃‍♂️ Physical Health" } },
              { property: "Type", select: { equals: "🍻 Interpersonal" } },
              { property: "Type", select: { equals: "❤️ Mental Health" } },
              { property: "Type", select: { equals: "🏠 Home" } },
            ],
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

    const tasks = response.results;
    console.log(`   ✅ Found ${tasks.length} completed personal tasks`);

    // Debug: Show date range of tasks actually found
    if (tasks.length > 0) {
      const taskDates = tasks
        .map((t) => t.properties["Due Date"]?.date?.start)
        .filter(Boolean)
        .sort();
      if (taskDates.length > 0) {
        console.log(
          `   📆 Actual task date range: ${taskDates[0]} to ${
            taskDates[taskDates.length - 1]
          }`
        );
      }
    }

    // Categorize tasks by Type
    const categorizedTasks = {
      personal: [],
      physicalHealth: [],
      interpersonal: [],
      mentalHealth: [],
      home: [],
    };

    tasks.forEach((task) => {
      const type = task.properties.Type?.select?.name;

      switch (type) {
        case "🌱 Personal":
          categorizedTasks.personal.push(task);
          break;
        case "🏃‍♂️ Physical Health":
          categorizedTasks.physicalHealth.push(task);
          break;
        case "🍻 Interpersonal":
          categorizedTasks.interpersonal.push(task);
          break;
        case "❤️ Mental Health":
          categorizedTasks.mentalHealth.push(task);
          break;
        case "🏠 Home":
          categorizedTasks.home.push(task);
          break;
      }
    });

    // Format all tasks into a single "Personal Tasks" column
    const totalTasks = tasks.length;

    // Count unique tasks (you might need to adjust this logic based on how duplicates are identified)
    const uniqueTitles = new Set(
      tasks.map(
        (task) => task.properties.Task?.title?.[0]?.plain_text || "Untitled"
      )
    );
    const uniqueCount = uniqueTitles.size;

    // Create summary header
    let personalTasksOutput = `Total: ${totalTasks} tasks${
      totalTasks !== uniqueCount ? ` (${uniqueCount} unique)` : ""
    }\n`;
    personalTasksOutput += `${
      categorizedTasks.personal.length > 0 ? "✅" : "☑️"
    } Personal: ${categorizedTasks.personal.length} tasks\n`;
    personalTasksOutput += `${
      categorizedTasks.physicalHealth.length > 0 ? "✅" : "☑️"
    } Physical Health: ${categorizedTasks.physicalHealth.length} tasks\n`;
    personalTasksOutput += `${
      categorizedTasks.interpersonal.length > 0 ? "✅" : "☑️"
    } Interpersonal: ${categorizedTasks.interpersonal.length} tasks\n`;
    personalTasksOutput += `${
      categorizedTasks.mentalHealth.length > 0 ? "✅" : "☑️"
    } Mental Health: ${categorizedTasks.mentalHealth.length} tasks\n`;
    personalTasksOutput += `${
      categorizedTasks.home.length > 0 ? "✅" : "☑️"
    } Home: ${categorizedTasks.home.length} tasks\n\n`;

    // Add detailed task lists for each category that has tasks
    const addCategoryDetails = (tasks, categoryName) => {
      if (tasks.length > 0) {
        personalTasksOutput += `${categoryName.toUpperCase()} (${
          tasks.length
        }):\n`;
        tasks.forEach((task) => {
          const title =
            task.properties.Task?.title?.[0]?.plain_text || "Untitled";
          const dueDate = task.properties["Due Date"]?.date?.start;
          const dateStr = dueDate ? ` (${formatTaskDate(dueDate)})` : "";
          personalTasksOutput += `• ${title}${dateStr}\n`;
        });
        personalTasksOutput += "\n";
      }
    };

    addCategoryDetails(categorizedTasks.personal, "Personal");
    addCategoryDetails(categorizedTasks.physicalHealth, "Physical Health");
    addCategoryDetails(categorizedTasks.interpersonal, "Interpersonal");
    addCategoryDetails(categorizedTasks.mentalHealth, "Mental Health");
    addCategoryDetails(categorizedTasks.home, "Home");

    // Trim final output
    personalTasksOutput = personalTasksOutput.trim();

    // Handle 2000 character limit for Notion
    if (personalTasksOutput.length > 2000) {
      // Truncate but keep the summary at the top
      const summaryEnd = personalTasksOutput.indexOf("\n\n");
      const summary = personalTasksOutput.substring(0, summaryEnd);
      const remaining = 2000 - summary.length - 20; // Leave room for truncation message
      personalTasksOutput =
        summary +
        personalTasksOutput.substring(summaryEnd, summaryEnd + remaining) +
        "\n... (truncated)";
    }

    const formattedData = {
      "Personal Tasks": personalTasksOutput,
    };

    // Log summary
    console.log(`   📊 Tasks by category:`);
    console.log(`      Personal: ${categorizedTasks.personal.length}`);
    console.log(
      `      Physical Health: ${categorizedTasks.physicalHealth.length}`
    );
    console.log(
      `      Interpersonal: ${categorizedTasks.interpersonal.length}`
    );
    console.log(`      Mental Health: ${categorizedTasks.mentalHealth.length}`);
    console.log(`      Home: ${categorizedTasks.home.length}`);

    return formattedData;
  } catch (error) {
    console.error(`❌ Error fetching personal tasks:`, error.message);
    throw error;
  }
}

// Export the function
module.exports = { pullPersonalTasks };

// Allow running standalone for testing
if (require.main === module) {
  const weekNumber = process.argv[2] ? parseInt(process.argv[2]) : 1;

  pullPersonalTasks(weekNumber)
    .then((data) => {
      console.log("\n📄 Formatted task data:");
      Object.entries(data).forEach(([key, value]) => {
        console.log(`\n${key}:`);
        console.log(value);
      });
    })
    .catch((error) => {
      console.error("Failed to pull personal tasks:", error);
      process.exit(1);
    });
}
