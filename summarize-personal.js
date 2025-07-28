const { Client } = require("@notionhq/client");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default week (will be overridden by user input)
let TARGET_WEEK = 1;

console.log("📊 Personal Summary Generator (Parsing Only)");

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n🎯 Personal Summary Generator");

  // Ask for weeks
  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );
  let targetWeeks = [TARGET_WEEK]; // default
  if (weekInput.trim()) {
    targetWeeks = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(
    `\n📊 Generating personal summary for Week${
      targetWeeks.length > 1 ? "s" : ""
    }: ${targetWeeks.join(", ")}`
  );
  const confirm = await askQuestion("Continue? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  return targetWeeks;
}

async function fetchWeekData(weekNumber) {
  const paddedWeek = weekNumber.toString().padStart(2, "0");

  // Query for the specific week
  const response = await notion.databases.query({
    database_id: RECAP_DATABASE_ID,
    filter: {
      property: "Week Recap",
      title: {
        contains: `Week ${paddedWeek} Recap`,
      },
    },
  });

  if (response.results.length === 0) {
    throw new Error(`Week ${weekNumber} not found`);
  }

  const page = response.results[0];

  // Extract personal data
  const weekData = {
    id: page.id,
    weekRecap: page.properties["Week Recap"]?.title?.[0]?.plain_text || "",
    personalTaskSummary:
      page.properties["Personal Task Summary"]?.rich_text?.[0]?.plain_text ||
      "",
    personalCalSummary:
      page.properties["Personal Cal Summary"]?.rich_text?.[0]?.plain_text || "",
    personalRocksSummary:
      page.properties["Personal Rocks Summary"]?.rich_text?.[0]?.plain_text ||
      "",
    personalEventsSummary:
      page.properties["Personal Events Summary"]?.rich_text?.[0]?.plain_text ||
      "",
    physicalHealthCal:
      page.properties["Physical Health Cal"]?.rich_text?.[0]?.plain_text || "",
    interpersonalCal:
      page.properties["Interpersonal Cal"]?.rich_text?.[0]?.plain_text || "",
    homeCal: page.properties["Home Cal"]?.rich_text?.[0]?.plain_text || "",
    mentalHealthCal:
      page.properties["Mental Health Cal"]?.rich_text?.[0]?.plain_text || "",
  };

  return weekData;
}

// Parse evaluation section from summary text
function parseEvaluationSection(summaryText) {
  if (!summaryText.includes("===== EVALUATION =====")) {
    return [];
  }

  const evaluationSection = summaryText.split("===== EVALUATION =====")[1];
  if (!evaluationSection) {
    return [];
  }

  const lines = evaluationSection.split("\n");
  const evaluations = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (
      trimmedLine.startsWith("✅") ||
      trimmedLine.startsWith("❌") ||
      trimmedLine.startsWith("⚠️") ||
      trimmedLine.startsWith("🏝️")
    ) {
      evaluations.push({
        type: trimmedLine.startsWith("✅") ? "good" : "bad",
        text: trimmedLine.substring(2).trim(), // Remove the emoji and space
        rawLine: trimmedLine,
      });
    }
    // Also capture bullet points under main items
    else if (trimmedLine.startsWith("•") && evaluations.length > 0) {
      const lastEval = evaluations[evaluations.length - 1];
      if (!lastEval.bullets) {
        lastEval.bullets = [];
      }
      lastEval.bullets.push(trimmedLine.substring(1).trim()); // Remove bullet and space
    }
  }

  return evaluations;
}

// Extract health habits from evaluation sections
function extractHealthHabits(taskEvals, calEvals) {
  const habits = {
    earlyWakeups: 0,
    sleepIns: 0,
    workouts: 0,
    soberDays: 0,
    drinkingDays: 0,
    bodyWeight: null,
    goodHabits: [],
    badHabits: [],
  };

  // Look for health habit evaluations in both task and calendar evaluations
  const allEvals = [...taskEvals, ...calEvals];

  for (const eval of allEvals) {
    const text = eval.text.toUpperCase();

    // Early wakeups
    if (text.includes("EARLY WAKE-UPS") || text.includes("EARLY WAKEUPS")) {
      const match = eval.text.match(/(\d+) days?/);
      if (match) {
        habits.earlyWakeups = parseInt(match[1]);
      }
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Sleep-ins
    else if (text.includes("SLEEP-INS") || text.includes("SLEEPINS")) {
      const match = eval.text.match(/(\d+) days?/);
      if (match) {
        habits.sleepIns = parseInt(match[1]);
      }
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Workouts
    else if (text.includes("WORKOUTS")) {
      const match = eval.text.match(/(\d+) sessions?/);
      if (match) {
        habits.workouts = parseInt(match[1]);
      }
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Sober days
    else if (text.includes("SOBER DAYS")) {
      const match = eval.text.match(/(\d+) days?/);
      if (match) {
        habits.soberDays = parseInt(match[1]);
      }
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Drinking days
    else if (text.includes("DRINKING DAYS")) {
      const match = eval.text.match(/(\d+) days?/);
      if (match) {
        habits.drinkingDays = parseInt(match[1]);
      }
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Body weight
    else if (text.includes("BODY WEIGHT")) {
      const match = eval.text.match(/([\d.]+) lbs/);
      if (match) {
        habits.bodyWeight = parseFloat(match[1]);
      }
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Video games
    else if (text.includes("VIDEO GAMES")) {
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }

    // Reading
    else if (text.includes("NO READING")) {
      if (eval.type === "good") {
        habits.goodHabits.push(eval.text);
      } else {
        habits.badHabits.push(eval.text);
      }
    }
    // Note: Non-health evaluations are ignored (not added to goodHabits/badHabits)
  }

  return habits;
}

// Extract events from Personal Events Summary
function extractEvents(personalEventsSummary) {
  const events = {
    good: [],
    bad: [],
  };

  if (
    !personalEventsSummary ||
    personalEventsSummary.includes("No personal events")
  ) {
    return events;
  }

  // Extract events from the formatted string (after the "------" line)
  const eventsContent = personalEventsSummary.split("------\n")[1];
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
          return `${eventName} (${eventType})`;
        } else {
          // Fallback if no type found
          const eventName = cleanLine.trim();
          return eventName;
        }
      });

    if (eventLines.length > 0) {
      events.good.push(`${eventLines.join(", ")} this week`);
    }
  }

  return events;
}

// Extract specific care-abouts from evaluations
function extractCareAbouts(
  taskEvals,
  calEvals,
  healthHabits,
  personalEventsSummary
) {
  const careAbouts = {
    good: [],
    bad: [],
  };

  // 1. EVENTS (from personal events summary) - TOP PRIORITY
  const events = extractEvents(personalEventsSummary);
  careAbouts.good.unshift(...events.good);
  careAbouts.bad.unshift(...events.bad);

  // 2. Rock status (from tasks) - SECOND PRIORITY (add right after events)
  const rockEvals = taskEvals.filter(
    (e) =>
      e.text.includes("ROCK ACHIEVED") ||
      e.text.includes("ROCK PROGRESS") ||
      e.text.includes("ROCK FAILED") ||
      e.text.includes("ROCK LITTLE PROGRESS")
  );

  let rockText = "";
  rockEvals.forEach((rock) => {
    // Skip any rock evaluation that contains "No plan"
    if (rock.text.includes("No plan")) {
      return;
    }

    if (rock.type === "good" && rock.text.includes("ROCK ACHIEVED")) {
      // Extract the goal text from "ROCK ACHIEVED: [goal text]"
      const goalMatch = rock.text.match(/ROCK ACHIEVED:\s*(.+)/);
      if (goalMatch) {
        rockText = `Achieved goal of "${goalMatch[1].trim()}"`;
      }
    } else if (rock.type === "good" && rock.text.includes("ROCK PROGRESS")) {
      // Extract the goal text from "ROCK PROGRESS: [goal text]"
      const goalMatch = rock.text.match(/ROCK PROGRESS:\s*(.+)/);
      if (goalMatch) {
        rockText = `Made progress on ${goalMatch[1].trim()}`;
      }
    } else if (rock.type === "good") {
      rockText = rock.text;
    } else {
      // Add rock failures to bad column
      careAbouts.bad.push(rock.text);
    }
  });

  // Add rock text right after events if it exists
  if (rockText) {
    careAbouts.good.splice(1, 0, rockText + "…");
  }

  // 4. Interpersonal events (from cal) - Format as separate paragraphs
  const interpersonalEval = calEvals.find((e) =>
    e.text.includes("INTERPERSONAL")
  );
  if (interpersonalEval && interpersonalEval.type === "good") {
    // Extract events from the parentheses in the evaluation text - capture everything inside outermost parentheses
    const eventMatch = interpersonalEval.text.match(/\((.+)\)$/);
    if (eventMatch) {
      const eventsText = eventMatch[1];
      // Split by "..." to get individual events
      const events = eventsText
        .split("...")
        .map((event) => event.trim())
        .filter((event) => event.length > 0);

      // Separate events by type
      const jenEvents = [];
      const callEvents = [];
      const otherEvents = [];

      events.forEach((event) => {
        const lowerEvent = event.toLowerCase();
        if (lowerEvent.includes("jen")) {
          jenEvents.push(event);
        } else if (lowerEvent.includes("call")) {
          callEvents.push(event);
        } else {
          otherEvents.push(event);
        }
      });

      // Add Jen events as distinct paragraph
      if (jenEvents.length > 0) {
        careAbouts.good.push(jenEvents.join(", "));
      }

      // Add call events as distinct paragraph
      if (callEvents.length > 0) {
        careAbouts.good.push(callEvents.join(", "));
      }

      // Add other events as ellipsis-separated paragraph
      if (otherEvents.length > 0) {
        careAbouts.good.push(otherEvents.join("… "));
      }
    }
  }

  // 5. Home tasks (from tasks) - Format as "Worked on apartment… [task name]"
  const homeTaskEval = taskEvals.find(
    (e) => e.text.includes("HOME TASKS") || e.text.includes("NO HOME TASKS")
  );
  let homeTasksText = "";
  if (homeTaskEval) {
    if (homeTaskEval.type === "good") {
      // Extract task names
      const taskMatch = homeTaskEval.text.match(
        /HOME TASKS:\s*\d+\s+completed\s*\(([^)]+)\)/
      );
      const taskNames = taskMatch ? taskMatch[1] : "";
      if (taskNames) {
        // Format as "Worked on apartment… [first task]… [other tasks]"
        const homeTaskNames = taskNames.split(", ");
        if (homeTaskNames.length > 0) {
          const firstTask = `Worked on apartment… ${homeTaskNames[0].trim()}`;
          homeTasksText = [firstTask, ...homeTaskNames.slice(1)].join("… ");
        }
      }
    } else {
      // Clean up "NO HOME TASKS: 0 completed" to "No home tasks this week"
      const cleanText = homeTaskEval.text
        .replace(
          /^NO\s+HOME\s+TASKS:\s*\d+\s+completed$/i,
          "No home tasks this week"
        )
        .replace(/^NO\s+HOME\s+TASKS$/i, "No home tasks this week");
      careAbouts.bad.push(cleanText);
    }
  }

  // 6. Physical tasks (from tasks) - SPECIAL RULE: NO workouts from tasks!
  const physicalTaskEval = taskEvals.find(
    (e) =>
      e.text.includes("PHYSICAL HEALTH TASKS") ||
      e.text.includes("NO PHYSICAL HEALTH TASKS")
  );
  let physicalTasksText = "";
  if (physicalTaskEval) {
    if (physicalTaskEval.type === "good") {
      // Extract task names
      const taskMatch = physicalTaskEval.text.match(
        /PHYSICAL HEALTH TASKS:\s*\d+\s+completed\s*\(([^)]+)\)/
      );
      const taskNames = taskMatch ? taskMatch[1] : "";
      if (taskNames) {
        // Filter out workout-related tasks
        const physicalTaskNames = taskNames.split(", ").filter((task) => {
          const lowerTask = task.toLowerCase();
          return (
            !lowerTask.includes("workout") &&
            !lowerTask.includes("run") &&
            !lowerTask.includes("yoga") &&
            !lowerTask.includes("exercise") &&
            !lowerTask.includes("gym")
          );
        });

        if (physicalTaskNames.length > 0) {
          const firstTask = `Completed ${physicalTaskNames[0].trim()}`;
          physicalTasksText = [firstTask, ...physicalTaskNames.slice(1)].join(
            "… "
          );
        }
      }
    } else {
      // Clean up "NO PHYSICAL HEALTH TASKS: 0 completed" to "No physical health tasks this week"
      const cleanText = physicalTaskEval.text
        .replace(
          /^NO\s+PHYSICAL\s+HEALTH\s+TASKS:\s*\d+\s+completed$/i,
          "No physical health tasks this week"
        )
        .replace(
          /^NO\s+PHYSICAL\s+HEALTH\s+TASKS$/i,
          "No physical health tasks this week"
        );
      careAbouts.bad.push(cleanText);
    }
  }

  // 7. Build the summary in the correct order: EVENTS -> ROCKS -> INTERPERSONAL -> APARTMENT
  const summaryItems = [];

  // Note: ROCKS are now added right after events above

  // 2. INTERPERSONAL EVENTS (already added above, but need to ensure they come after rocks)
  // Note: Interpersonal events are already added to careAbouts.good above

  // 3. APARTMENT TASKS (home tasks)
  if (homeTasksText) {
    summaryItems.push(homeTasksText + "…");
  }

  // Combine everything with proper spacing (events are already at the top from earlier)
  if (summaryItems.length > 0) {
    // Add summary items to the end, after events and interpersonal
    careAbouts.good.push(summaryItems.join("\n\n"));
  }

  // 8. Health habits evaluation - ADD AT THE BOTTOM
  // Format good habits as distinct paragraphs with emojis
  if (healthHabits.goodHabits.length > 0) {
    healthHabits.goodHabits.forEach((habit) => {
      // EARLY WAKE-UPS: 1 days -> 🌅 1 early wakeup
      if (habit.includes("EARLY WAKE-UPS")) {
        const match = habit.match(/(\d+) days?/);
        if (match) {
          careAbouts.good.push(
            `🌅 ${match[1]} early wakeup${match[1] === "1" ? "" : "s"}`
          );
        }
      }
      // WORKOUTS: 1 sessions, 0.6 hours (Morning Workout) -> 🏋️‍♀️ 1 workout (0.6 hours)
      else if (habit.includes("WORKOUTS")) {
        const match = habit.match(/(\d+) sessions?, ([\d.]+) hours/);
        if (match) {
          careAbouts.good.push(
            `🏋️‍♀️ ${match[1]} workout${match[1] === "1" ? "" : "s"} (${
              match[2]
            } hours)`
          );
        } else {
          const sessionMatch = habit.match(/(\d+) sessions?/);
          if (sessionMatch) {
            careAbouts.good.push(
              `🏋️‍♀️ ${sessionMatch[1]} workout${
                sessionMatch[1] === "1" ? "" : "s"
              }`
            );
          }
        }
      }
      // NO VIDEO GAMES: 0 hours -> 🎮 No video games
      else if (habit.includes("NO VIDEO GAMES")) {
        careAbouts.good.push("🎮 No video games");
      }
      // SOBER DAYS: 2 days -> 💧 2 days sober
      else if (habit.includes("SOBER DAYS")) {
        const match = habit.match(/(\d+) days?/);
        if (match) {
          careAbouts.good.push(
            `💧 ${match[1]} day${match[1] === "1" ? "" : "s"} sober`
          );
        }
      }
      // BODY WEIGHT: 196.7 lbs tracked -> ⚖️ 196.7 lbs
      else if (habit.includes("BODY WEIGHT")) {
        const match = habit.match(/([\d.]+) lbs/);
        if (match) {
          careAbouts.good.push(`⚖️ ${match[1]} lbs`);
        }
      }
      // Default fallback
      else {
        careAbouts.good.push(habit);
      }
    });
  }

  // Format bad habits as distinct paragraphs with emojis
  if (healthHabits.badHabits.length > 0) {
    healthHabits.badHabits.forEach((habit) => {
      // SLEEP-INS: 6 days -> 🛌 6 sleep-ins
      if (habit.includes("SLEEP-INS")) {
        const match = habit.match(/(\d+) days?/);
        if (match) {
          careAbouts.bad.push(
            `🛌 ${match[1]} sleep-in${match[1] === "1" ? "" : "s"}`
          );
        }
      }
      // NO READING: 0 sessions -> 📖 No reading
      else if (habit.includes("NO READING")) {
        careAbouts.bad.push("📖 No reading");
      }
      // DRINKING DAYS: 5 days -> 🍻 5 days drinking
      else if (habit.includes("DRINKING DAYS")) {
        const match = habit.match(/(\d+) days?/);
        if (match) {
          careAbouts.bad.push(
            `🍻 ${match[1]} day${match[1] === "1" ? "" : "s"} drinking`
          );
        }
      }
      // VIDEO GAMES: 4 sessions, 11.8 hours -> 🎮 Video games: 4 sessions, 11.8 hours
      else if (habit.includes("VIDEO GAMES")) {
        const match = habit.match(
          /VIDEO GAMES:\s*(\d+)\s*sessions?,\s*([\d.]+)\s*hours?/
        );
        if (match) {
          careAbouts.bad.push(
            `🎮 Video games: ${match[1]} sessions, ${match[2]} hours`
          );
        } else {
          careAbouts.bad.push(`🎮 ${habit}`);
        }
      }
      // Default fallback
      else {
        careAbouts.bad.push(habit);
      }
    });
  }

  // 9. Handle empty bad items
  if (careAbouts.bad.length === 0) {
    careAbouts.bad.push("(Nothing of note)");
  }

  return careAbouts;
}

// Update Notion with parsed summaries
async function updateNotionSummary(pageId, goodItems, badItems) {
  // Group health habits together with single line breaks
  const healthEmojis = ["🌅", "🏋️‍♀️", "💧", "⚖️", "🎮", "🛌", "📖", "🍻"];

  const formatItems = (items) => {
    const formattedItems = [];
    let currentGroup = [];

    for (const item of items) {
      const isHealthHabit = healthEmojis.some((emoji) =>
        item.startsWith(emoji)
      );

      if (isHealthHabit) {
        currentGroup.push(item);
      } else {
        // If we have a group of health habits, join them with single line breaks
        if (currentGroup.length > 0) {
          formattedItems.push(currentGroup.join("\n"));
          currentGroup = [];
        }
        // Add non-health items with double line breaks
        formattedItems.push(item);
      }
    }

    // Don't forget the last group of health habits
    if (currentGroup.length > 0) {
      formattedItems.push(currentGroup.join("\n"));
    }

    return formattedItems.join("\n\n");
  };

  const properties = {
    "Personal - What went well?": {
      rich_text: [
        {
          text: { content: formatItems(goodItems) },
        },
      ],
    },
    "Personal - What didn't go so well?": {
      rich_text: [
        {
          text: { content: formatItems(badItems) },
        },
      ],
    },
  };

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
}

async function processSummary(weekNumber) {
  try {
    console.log(`\n📥 Fetching Week ${weekNumber} data...`);

    // Fetch the week data
    const weekData = await fetchWeekData(weekNumber);
    console.log(`✅ Found Week ${weekNumber} data!`);

    // Parse evaluation sections
    console.log("📊 Parsing evaluation sections...");
    const taskEvaluations = parseEvaluationSection(
      weekData.personalTaskSummary
    );
    const calEvaluations = parseEvaluationSection(weekData.personalCalSummary);

    console.log(`   Task evaluations found: ${taskEvaluations.length}`);
    console.log(`   Calendar evaluations found: ${calEvaluations.length}`);

    // Extract health habits from evaluation sections
    console.log("🏃 Extracting health habits...");
    const healthHabits = extractHealthHabits(taskEvaluations, calEvaluations);
    console.log(
      `   Exercise: ${healthHabits.workouts}x, Early wakeups: ${healthHabits.earlyWakeups}x, Sober: ${healthHabits.soberDays}x`
    );
    console.log(
      `   Good habits: ${healthHabits.goodHabits.length}, Bad habits: ${healthHabits.badHabits.length}`
    );

    // Extract care-abouts
    console.log("🎯 Extracting care-abouts...");
    const careAbouts = extractCareAbouts(
      taskEvaluations,
      calEvaluations,
      healthHabits,
      weekData.personalEventsSummary
    );

    console.log(`   Good items: ${careAbouts.good.length}`);
    console.log(`   Bad items: ${careAbouts.bad.length}`);

    // Show preview
    console.log("\n📄 Summary Preview:");
    console.log("================");
    console.log("What went well:");
    careAbouts.good.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item.split("\n")[0]}...`);
    });
    console.log("\nWhat didn't go well:");
    careAbouts.bad.forEach((item, idx) => {
      console.log(`${idx + 1}. ${item}`);
    });

    // Update Notion
    console.log("\n📝 Updating Notion...");
    await updateNotionSummary(weekData.id, careAbouts.good, careAbouts.bad);
    console.log(`✅ Successfully updated Week ${weekNumber} summary!`);
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    console.error(error.stack);
  }
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);
  let targetWeeks = [TARGET_WEEK]; // default

  // Check for --week or --weeks argument
  const weekIndex =
    args.indexOf("--week") !== -1
      ? args.indexOf("--week")
      : args.indexOf("--weeks");
  if (weekIndex !== -1 && args[weekIndex + 1]) {
    targetWeeks = args[weekIndex + 1]
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  // If no args, run interactive mode
  if (args.length === 0) {
    targetWeeks = await runInteractiveMode();
  }

  // Run the summary generation for each week
  console.log(
    `\n🚀 Processing ${targetWeeks.length} week${
      targetWeeks.length > 1 ? "s" : ""
    }...\n`
  );

  for (let i = 0; i < targetWeeks.length; i++) {
    const week = targetWeeks[i];
    console.log(`📍 [${i + 1}/${targetWeeks.length}] Starting Week ${week}...`);
    await processSummary(week);

    // Add a separator between weeks (except for the last one)
    if (i < targetWeeks.length - 1) {
      console.log("\n" + "=".repeat(50) + "\n");
    }
  }

  console.log(
    `\n🎉 All ${targetWeeks.length} week${
      targetWeeks.length > 1 ? "s" : ""
    } completed!`
  );

  // Explicitly exit the process to ensure clean shutdown
  process.exit(0);
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
