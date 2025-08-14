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

console.log("📊 Personal Task Summary Generator");

// Task Summary Configuration
const taskSummaryConfig = [
  {
    type: "single",
    key: "tripDetails",
    include: true,
    order: 1,
    title: "TRIPS",
  },
  {
    type: "single",
    key: "eventDetails",
    include: true,
    order: 2,
    title: "EVENTS",
  },
  {
    type: "single",
    key: "habitsDetails",
    include: true,
    order: 3,
    title: "HABITS",
  },
  {
    type: "single",
    key: "rockDetails",
    include: true,
    order: 4,
    title: "ROCKS",
  },
  {
    type: "taskBreakdown",
    key: "personalTasks",
    include: true,
    order: 5,
    title: "SUMMARY",
  },
];

// Task Categories Configuration
const taskCategoriesConfig = [
  { category: "Personal Tasks", include: true, order: 1 },
  { category: "Physical Health Tasks", include: true, order: 2 },
  { category: "Interpersonal Tasks", include: false, order: 3 }, // DISABLED
  { category: "Mental Health Tasks", include: false, order: 4 },
  { category: "Home Tasks", include: true, order: 5 },
];

/**
 * Process a single week
 */
async function processWeek(weekNumber) {
  try {
    console.log(`\n📊 === PROCESSING WEEK ${weekNumber} ===`);

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
      personalTasks:
        targetWeekPage.properties["Personal Tasks"]?.rich_text?.[0]
          ?.plain_text || "",
      habitsDetails:
        targetWeekPage.properties["Habits Details"]?.formula?.string || "",
      tripDetails:
        targetWeekPage.properties["Trip Details"]?.formula?.string || "",
      eventDetails:
        targetWeekPage.properties["Event Details"]?.formula?.string || "",
      rockDetails:
        targetWeekPage.properties["Rock Details"]?.formula?.string || "",
      // Habit number columns (for reference if needed)
      earlyWakeup: targetWeekPage.properties["Early Wakeup"]?.number || 0,
      sleepIn: targetWeekPage.properties["Sleep In"]?.number || 0,
      workout: targetWeekPage.properties["Workout"]?.number || 0,
      soberDays: targetWeekPage.properties["Sober Days"]?.number || 0,
      drinkingDays: targetWeekPage.properties["Drinking Days"]?.number || 0,
      bodyWeight: targetWeekPage.properties["Body Weight"]?.number || null,
    };

    // Generate Personal Task Summary
    console.log("📝 Generating Personal Task Summary...");
    const taskSummary = generatePersonalTaskSummary(existingData);

    // Update Notion with generated summary
    console.log("📤 Updating Notion with summary...");
    const properties = {
      "Personal Task Summary": {
        rich_text: [
          {
            text: {
              content: taskSummary.substring(0, 2000), // Notion limit
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
      `✅ Successfully updated Week ${paddedWeek} with Personal Task Summary!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
  }
}

/**
 * Generate Personal Task Summary using config
 */
function generatePersonalTaskSummary(data) {
  let summary = "";

  const enabledSections = taskSummaryConfig
    .filter((section) => section.include)
    .sort((a, b) => a.order - b.order);

  enabledSections.forEach((section) => {
    summary += `===== ${section.title} =====\n`;

    if (section.type === "single") {
      const content = data[section.key];
      if (content && content.trim()) {
        // Check if this section needs special formatting
        if (section.key === "habitsDetails") {
          summary += formatHabits(content) + "\n";
        } else if (section.key === "rockDetails") {
          summary += formatRocks(content) + "\n";
        } else if (section.key === "eventDetails") {
          summary += formatEvents(content) + "\n";
        } else {
          // For trips, just use raw content
          summary += content + "\n";
        }
      } else {
        summary += `No ${section.title.toLowerCase()} this week\n`;
      }
    } else if (section.type === "taskBreakdown") {
      const content = data[section.key];
      if (content && content.trim()) {
        summary += formatPersonalTasksSummary(content);
      } else {
        summary += "No personal tasks this week";
      }
    }

    summary += "\n";
  });

  return summary.trim();
}

/**
 * Helper functions for formatting
 */
function formatPersonalTasksSummary(personalTasks) {
  // Task exemption arrays (case-insensitive matching)
  const exemptions = {
    "Home Tasks": ["laundry", "fold", "list", "scrub", "change"],
    "Personal Tasks": ["shave", "groceries", "grocery"],
    "Physical Health Tasks": ["workout", "run"],
  };

  const lines = personalTasks.split("\n");
  const enabledCategories = taskCategoriesConfig
    .filter((cat) => cat.include)
    .map((cat) => cat.category);

  let output = "";
  let currentCategory = "";
  let isInEnabledCategory = false;
  let totalTasks = 0;
  let currentCategoryTasks = 0;
  let currentCategorySection = ""; // Build category section separately

  for (const line of lines) {
    // Check if this line is a category header
    const categoryMatch = line.match(/^(.+?)\s+\((\d+)\)$/);
    if (categoryMatch) {
      // If we were processing a previous category, add it to output if it has tasks
      if (isInEnabledCategory && currentCategory && currentCategoryTasks > 0) {
        // Add newline before category header (except first)
        if (output.includes("✅")) {
          output += "\n";
        }
        output += `✅ ${currentCategory} (${currentCategoryTasks})\n`;
        output += currentCategorySection;
      }

      currentCategory = categoryMatch[1];
      currentCategoryTasks = 0;
      currentCategorySection = "";
      isInEnabledCategory = enabledCategories.includes(currentCategory);
    } else if (isInEnabledCategory && line.trim().startsWith("•")) {
      // Check if task should be exempted
      const shouldExempt =
        exemptions[currentCategory]?.some((exemption) =>
          line.toLowerCase().includes(exemption.toLowerCase())
        ) || false;

      if (!shouldExempt) {
        // Remove dates from task lines using regex
        const cleanedLine = line.replace(
          /\s*\([A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\)$/,
          ""
        );
        currentCategorySection += cleanedLine + "\n";
        currentCategoryTasks++;
        totalTasks++;
      }
    }
  }

  // Handle the last category
  if (isInEnabledCategory && currentCategory && currentCategoryTasks > 0) {
    if (output.includes("✅")) {
      output += "\n";
    }
    output += `✅ ${currentCategory} (${currentCategoryTasks})\n`;
    output += currentCategorySection;
  }

  // Add header with total count
  const header = `PERSONAL TASKS (${totalTasks} tasks):\n`;
  output = header + output;

  return output.trim();
}

function formatRocks(rockDetails) {
  if (!rockDetails || !rockDetails.trim()) {
    return "";
  }

  // Split on ), then add ) back to each part (except the last)
  const parts = rockDetails.split("),");
  const rockLines = parts
    .map((part, index) => {
      // Add ) back to all parts except the last one
      return index < parts.length - 1 ? part.trim() + ")" : part.trim();
    })
    .filter((rock) => rock.length > 0);

  // Sort by status text, keeping original format intact
  const sortedRocks = rockLines.sort((a, b) => {
    let priorityA = 5,
      priorityB = 5;

    if (a.includes("Went well")) priorityA = 1;
    else if (a.includes("Made progress")) priorityA = 2;
    else if (a.includes("Didn't go so well")) priorityA = 3;
    else if (a.includes("Went bad")) priorityA = 4;

    if (b.includes("Went well")) priorityB = 1;
    else if (b.includes("Made progress")) priorityB = 2;
    else if (b.includes("Didn't go so well")) priorityB = 3;
    else if (b.includes("Went bad")) priorityB = 4;

    return priorityA - priorityB;
  });

  return sortedRocks.join("\n");
}

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
    // ✅ 🛌 Good sleeping habits (X early wake ups, Y days sleeping in)
    // ⚠️ 🛌 Not great sleeping habits (X early wake ups, Y days sleeping in)
    // ❌ 🛌 Bad sleeping habits (X early wake ups, Y days sleeping in)
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
    // ✅ 🍻 Good drinking habits (X days sober, Y days drinking)
    // ⚠️ 🍻 Not great drinking habits (X days sober, Y days drinking)
    // ❌ 🍻 Bad drinking habits (X days sober, Y days drinking)
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

    // 3. Workouts (standalone)
    // ✅ 💪 Good workout habits (X workouts)
    // ⚠️ 💪 Not great workout habits (X workouts)
    // ❌ 💪 Bad workout habits (X workouts)
    else if (line.includes("workouts")) {
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

    // 4. Reading vs gaming
    // ✅ 📖 Good hobby habits (X days reading, Y days gaming)
    // ⚠️ 📖 Not great hobby habits (X days reading, Y days gaming)
    // ❌ 📖 Bad hobby habits (X days reading, Y days gaming)
    else if (line.includes("reading") && line.includes("gaming")) {
      const readingMatch = line.match(/(\d+)\s*days reading/);
      const gamingMatch = line.match(/(\d+)\s*days gaming/);

      if (readingMatch && gamingMatch) {
        const readingDays = parseInt(readingMatch[1]);
        const gamingDays = parseInt(gamingMatch[1]);
        emoji = "📖";
        originalValues = cleanedLine;

        if (readingDays >= gamingDays) {
          status = "✅";
          habitDescription = "Good hobby habits";
        } else if (readingDays < gamingDays && gamingDays <= 2) {
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
    // ✅ ⚖️ Good body weight (X avg body weight)
    // ⚠️ ⚖️ Not great body weight (X avg body weight)
    // ❌ ⚖️ Bad body weight (X avg body weight)
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

function formatEvents(eventDetails) {
  if (!eventDetails || !eventDetails.trim()) {
    return "";
  }

  // Day priority for sorting
  const dayPriority = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // Split on commas like we did with rocks
  const eventLines = eventDetails
    .split(",")
    .map((event) => event.trim())
    .filter((event) => event.length > 0);

  // Sort by first day mentioned in each event
  const sortedEvents = eventLines.sort((a, b) => {
    const dayMatchA = a.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);
    const dayMatchB = b.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat)/);

    const dayA = dayMatchA ? dayMatchA[1] : "Sun";
    const dayB = dayMatchB ? dayMatchB[1] : "Sun";

    return dayPriority[dayA] - dayPriority[dayB];
  });

  return sortedEvents.join("\n");
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
