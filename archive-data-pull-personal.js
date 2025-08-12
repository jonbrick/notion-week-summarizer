const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const { findWeekRecapPage } = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
const { extractEventDuration } = require("./src/utils/time-utils");
const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("./src/utils/auth-utils");
const {
  processPersonalProjectEvents,
} = require("./src/utils/personal-pr-processor");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const TASKS_DATABASE_ID = process.env.TASKS_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("📥 Personal Data Fetcher - Clean Pull");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Initialize personal auth instance
let personalAuth = null;

// Fetch calendar events with enhanced error handling
async function fetchCalendarEvents(
  calendarId,
  startDate,
  endDate,
  includeAllDay = false
) {
  try {
    if (!personalAuth) {
      if (!validateAuthConfig("personal")) {
        console.error(
          "❌ Personal calendar authentication not configured properly"
        );
        return [];
      }
      personalAuth = createPersonalAuth();
    }

    const allEvents = await fetchCalendarEventsWithAuth(
      personalAuth,
      calendarId,
      startDate,
      endDate
    );

    // Filter to only include events that START within the week range
    // AND exclude all-day events (unless includeAllDay is true)
    const filteredEvents = allEvents.filter((event) => {
      // Check if it's an all-day event
      if (!includeAllDay && event.start?.date && !event.start?.dateTime) {
        return false; // Skip all-day events unless we want them
      }

      let eventStartDate;
      if (event.start?.date) {
        eventStartDate = event.start.date;
      } else if (event.start?.dateTime) {
        eventStartDate = event.start.dateTime.split("T")[0];
      } else {
        return false; // No valid start time
      }

      return eventStartDate >= startDate && eventStartDate <= endDate;
    });

    return filteredEvents;
  } catch (error) {
    console.error(`❌ Error fetching calendar events:`, error.message);
    return [];
  }
}

// Format events for a column (simple list with hours)
function formatEventsColumn(events, columnName, eventType = "events") {
  if (!events || events.length === 0) {
    return `${columnName.toUpperCase()} (0 ${eventType}, 0 hours):\nNo ${columnName.toLowerCase()} this week`;
  }

  // Calculate total hours
  let totalMinutes = 0;
  const formattedEvents = [];

  events.forEach((event) => {
    const duration = extractEventDuration(event);
    const minutes = duration?.minutes || 0;
    totalMinutes += minutes;

    const hours = (minutes / 60).toFixed(1);
    const summary = event.summary || "Untitled";

    formattedEvents.push(`• ${summary} (${hours}h)`);
  });

  const totalHours = (totalMinutes / 60).toFixed(1);

  let output = `${columnName.toUpperCase()} (${events.length} ${eventType}`;
  if (events.length !== 1) output += "s";
  output += `, ${totalHours} hour`;
  if (totalHours !== "1.0") output += "s";
  output += "):\n";

  output += formattedEvents.join("\n");

  return output;
}

// Format personal PR events (with commit details like work PRs)
async function formatPREvents(prEvents) {
  if (!prEvents || prEvents.length === 0) {
    return "PERSONAL PR EVENTS (0 apps, 0 commits):\nNo personal PR events this week";
  }

  // Use the existing personal PR processor to get the full formatted output
  const prSummary = await processPersonalProjectEvents(prEvents);

  // Extract counts from the header
  const headerMatch = prSummary.match(
    /PERSONAL PRs \((\d+) apps?, (\d+) commits?\)/
  );
  if (!headerMatch) {
    return "PERSONAL PR EVENTS (0 apps, 0 commits):\nNo personal PR events this week";
  }

  const appCount = parseInt(headerMatch[1]);
  const commitCount = parseInt(headerMatch[2]);

  // Extract the content after the divider
  const contentParts = prSummary.split("------\n");
  if (contentParts.length < 2) {
    return `PERSONAL PR EVENTS (${appCount} apps, ${commitCount} commits):\nNo personal PR events this week`;
  }

  // Format output with full commit details
  let output = `PERSONAL PR EVENTS (${appCount} app${
    appCount !== 1 ? "s" : ""
  }, ${commitCount} commit${commitCount !== 1 ? "s" : ""}):\n`;

  // Parse the content and format it properly
  const projectContent = contentParts[1].trim();
  const projectSections = projectContent.split("\n\n");

  projectSections.forEach((projectSection, index) => {
    if (index > 0) {
      output += "---\n"; // Add separator between projects
    }

    const lines = projectSection.split("\n");
    if (lines.length > 0) {
      // First line is the project header
      const projectHeader = lines[0];
      const match = projectHeader.match(/(.+?)\s*\((\d+) commits?\):/);
      if (match) {
        // Project name with commit count
        output += `${match[1]} [${match[2]} commits]\n`;

        // Add commit messages (lines after the header)
        const commitLines = lines.slice(1);
        if (commitLines.length > 0) {
          // Join commit messages, but limit to first 5-6 commits
          const commits = commitLines
            .filter((line) => line.startsWith("• "))
            .map((line) => line.replace("• ", "").trim())
            .slice(0, 5); // Limit to first 5 commits

          if (commits.length > 0) {
            output += commits.join(", ");

            // Add truncation notice if there are more commits
            if (
              commitLines.filter((line) => line.startsWith("• ")).length > 5
            ) {
              output += ", ... (additional commits truncated)";
            }
            output += "\n";
          }
        }
      }
    }
  });

  return output.trim();
}

// Format tasks for a column (grouped by Type)
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

    if (taskType && tasksByType[taskType] !== undefined) {
      tasksByType[taskType].push(taskTitle);
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

      output += `${typeName} (${tasksByType[type].length})\n`;
      tasksByType[type].forEach((taskTitle) => {
        output += `• ${taskTitle}\n`;
      });
    }
  });

  return output.trim();
}

// Categorize event by color
function categorizeEventByColor(event) {
  const colorId = event.colorId || "default";

  // Personal Calendar Color Mappings
  const colorMapping = {
    2: "personal", // Sage/Green
    3: "interpersonal", // Purple
    5: "home", // Yellow
    8: "physicalHealth", // Gray
    11: "mentalHealth", // Red
  };

  return colorMapping[colorId] || "personal"; // Default to personal
}

// Process a single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

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

    // Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      console.log(`❌ Week ${weekNumber} has no week relation`);
      return;
    }

    const weekPageId = weekRelation[0].id;

    // Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
    const dateRange = weekPage.properties["Date Range (SET)"].date;

    if (!dateRange) {
      console.log(`❌ Week ${weekNumber} has no date range`);
      return;
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // Object to store all column updates
    const columnUpdates = {};

    // 1. Fetch and categorize Personal Calendar events
    console.log("\n📥 Fetching Personal Calendar events...");
    if (process.env.PERSONAL_CALENDAR_ID) {
      const personalCalEvents = await fetchCalendarEvents(
        process.env.PERSONAL_CALENDAR_ID,
        startDate,
        endDate
      );

      // Categorize by color
      const categorizedEvents = {
        personal: [],
        interpersonal: [],
        home: [],
        mentalHealth: [],
        physicalHealth: [],
      };

      personalCalEvents.forEach((event) => {
        const category = categorizeEventByColor(event);
        if (categorizedEvents[category]) {
          categorizedEvents[category].push(event);
        }
      });

      // Format each category
      columnUpdates["Personal Events"] = formatEventsColumn(
        categorizedEvents.personal,
        "Personal Events"
      );
      columnUpdates["Interpersonal Events"] = formatEventsColumn(
        categorizedEvents.interpersonal,
        "Interpersonal Events"
      );
      columnUpdates["Home Events"] = formatEventsColumn(
        categorizedEvents.home,
        "Home Events"
      );
      columnUpdates["Mental Health Events"] = formatEventsColumn(
        categorizedEvents.mentalHealth,
        "Mental Health Events"
      );
      columnUpdates["Physical Health Events"] = formatEventsColumn(
        categorizedEvents.physicalHealth,
        "Physical Health Events"
      );

      console.log(`   Personal: ${categorizedEvents.personal.length} events`);
      console.log(
        `   Interpersonal: ${categorizedEvents.interpersonal.length} events`
      );
      console.log(`   Home: ${categorizedEvents.home.length} events`);
      console.log(
        `   Mental Health: ${categorizedEvents.mentalHealth.length} events`
      );
      console.log(
        `   Physical Health: ${categorizedEvents.physicalHealth.length} events`
      );
    }

    // 2. Fetch Workout Calendar
    console.log("\n📥 Fetching Workout Calendar events...");
    if (process.env.WORKOUT_CALENDAR_ID) {
      const workoutEvents = await fetchCalendarEvents(
        process.env.WORKOUT_CALENDAR_ID,
        startDate,
        endDate
      );
      columnUpdates["Workout Events"] = formatEventsColumn(
        workoutEvents,
        "Workout Events"
      );
      console.log(`   Workouts: ${workoutEvents.length} events`);
    }

    // 3. Fetch Reading Calendar
    console.log("\n📥 Fetching Reading Calendar events...");
    if (process.env.READ_CALENDAR_ID) {
      const readingEvents = await fetchCalendarEvents(
        process.env.READ_CALENDAR_ID,
        startDate,
        endDate
      );
      columnUpdates["Reading Events"] = formatEventsColumn(
        readingEvents,
        "Reading Events"
      );
      console.log(`   Reading: ${readingEvents.length} events`);
    }

    // 4. Fetch Video Games Calendar
    console.log("\n📥 Fetching Video Games Calendar events...");
    if (process.env.VIDEO_GAMES_CALENDAR_ID) {
      const videoGameEvents = await fetchCalendarEvents(
        process.env.VIDEO_GAMES_CALENDAR_ID,
        startDate,
        endDate
      );
      columnUpdates["Video Game Events"] = formatEventsColumn(
        videoGameEvents,
        "Video Game Events"
      );
      console.log(`   Video Games: ${videoGameEvents.length} events`);
    }

    // 5. Fetch Personal PR Events (include all-day events for PRs)
    console.log("\n📥 Fetching Personal PR events...");
    if (process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID) {
      console.log(
        `   Calendar ID: ${process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID}`
      );
      const prEvents = await fetchCalendarEvents(
        process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID,
        startDate,
        endDate,
        true // Include all-day events for PRs
      );
      console.log(`   PRs: ${prEvents.length} events`);

      // Debug: Show what events we found
      if (prEvents.length > 0) {
        console.log("   Found PR events:");
        prEvents.forEach((event, idx) => {
          console.log(
            `     ${idx + 1}. ${event.summary} - ${
              event.start?.dateTime || event.start?.date
            }`
          );
        });
      }

      // Note: formatPREvents is async, so we need to await it
      columnUpdates["Personal PR Events"] = await formatPREvents(prEvents);
    } else {
      console.log("   ⚠️  PERSONAL_GITHUB_DATA_CALENDAR_ID not configured");
      columnUpdates["Personal PR Events"] =
        "PERSONAL PR EVENTS (0 apps, 0 commits):\nNo personal PR events this week";
    }

    // 6. Fetch Personal Tasks from Notion
    console.log("\n📥 Fetching Personal Tasks...");
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

    columnUpdates["Personal Tasks"] = formatTasksColumn(
      tasksResponse.results,
      "Personal Tasks"
    );
    console.log(`   Tasks: ${tasksResponse.results.length} tasks`);

    // Update Notion with all columns
    console.log("\n📝 Updating Notion columns...");
    const properties = {};

    for (const [fieldName, content] of Object.entries(columnUpdates)) {
      // Ensure content is a string
      const contentStr =
        typeof content === "string" ? content : String(content);

      properties[fieldName] = {
        rich_text: [
          {
            text: {
              content: contentStr.substring(0, 2000), // Notion limit
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
      `✅ Successfully updated Week ${paddedWeek} with all personal data!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
}

// Process all selected weeks
async function processAllWeeks() {
  console.log(`\n🚀 Processing ${TARGET_WEEKS.length} week(s)...`);

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
