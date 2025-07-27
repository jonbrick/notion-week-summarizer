const { Client } = require("@notionhq/client");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default week (will be overridden by user input)
let TARGET_WEEK = 1;

console.log("📊 Work Summary Generator (Parsing Only)");

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n🎯 Work Summary Generator");

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
    `\n📊 Generating work summary for Week${
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

  // Extract work data
  const weekData = {
    id: page.id,
    weekRecap: page.properties["Week Recap"]?.title?.[0]?.plain_text || "",
    workTaskSummary:
      page.properties["Work Task Summary"]?.rich_text?.[0]?.plain_text || "",
    workCalSummary:
      page.properties["Work Cal Summary"]?.rich_text?.[0]?.plain_text || "",
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
    // Also capture bullet points under main items (for meetings, PRs, etc.)
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

// Clean meeting name by removing Jon references and formatting
function cleanMeetingName(meetingName) {
  // Remove time/duration info and (all day)
  let cleaned = meetingName
    .replace(/\s*\(\d+(?:\.\d+)?\s*hours?\)\s*$/, "")
    .replace(/\s*\(\d+(?:\.\d+)?\s*minutes?\)\s*$/, "")
    .replace(/\s*\(\d+:\d+(?::\d+)?\)\s*$/, "")
    .replace(/\s*\(\d+:\d+\)\s*$/, "")
    .replace(/\s*\(\d+(?:\.\d+)?\s*h\)\s*$/, "")
    .replace(/\s*\(\d+(?:\.\d+)?\s*m\)\s*$/, "")
    .replace(/\s*\(all day\)\s*$/i, "")
    .trim();

  // Handle "Jon <> Doug" or "Jon <> Zac" patterns
  const jonPattern = /^Jon\s*<>\s*([^:]+)(?:\s*::\s*(.+))?$/;
  const jonMatch = cleaned.match(jonPattern);
  if (jonMatch) {
    const person = jonMatch[1].trim();
    const topic = jonMatch[2] ? jonMatch[2].trim() : "";
    return topic ? `Met with ${person} (${topic})` : `Met with ${person}`;
  }

  // Handle "Jon/Christine" patterns
  const jonSlashPattern = /^Jon\s*\/\s*([^:]+)(?:\s*::\s*(.+))?$/;
  const jonSlashMatch = cleaned.match(jonSlashPattern);
  if (jonSlashMatch) {
    const person = jonSlashMatch[1].trim();
    const topic = jonSlashMatch[2] ? jonSlashMatch[2].trim() : "";
    return topic ? `Met with ${person} (${topic})` : `Met with ${person}`;
  }

  // Handle "Christine/Jon" patterns (reverse order)
  const reverseSlashPattern = /^([^\/]+)\s*\/\s*Jon(?:\s*::\s*(.+))?$/;
  const reverseSlashMatch = cleaned.match(reverseSlashPattern);
  if (reverseSlashMatch) {
    const person = reverseSlashMatch[1].trim();
    const topic = reverseSlashMatch[2] ? reverseSlashMatch[2].trim() : "";
    return topic ? `Met with ${person} (${topic})` : `Met with ${person}`;
  }

  // Convert present tense to past tense for meeting names
  cleaned = cleaned
    .replace(/\bPresent\b/g, "Presented")
    .replace(/\bDemo\b/g, "Demoed")
    .replace(/\bMap\b/g, "Mapped");

  return cleaned;
}

// Clean PR title by removing hash numbers and formatting
function cleanPRTitle(prTitle) {
  return prTitle
    .replace(/\s*\(#\d+\)\s*$/, "") // Remove (#123) at end
    .replace(/\s*\[\d+\s+commits?\]\s*$/, "") // Remove [X commits] at end
    .replace(/\s*\[[^\]]*\]\s*/g, "") // Remove anything in brackets
    .replace(/\s*(?:CET|DSN)-\d+\s*/g, "") // Remove CET-Number and DSN-Number
    .replace(/\s*&\s*(?:CET|DSN)-\d+\s*/g, "") // Remove & CET-Number and & DSN-Number
    .replace(/\s*&\s*/g, "") // Remove any remaining ampersands
    .trim();
}

// Clean warning messages for better readability
function cleanWarningMessage(warningText) {
  // Handle meeting time warnings
  if (warningText.includes("MEETING TIME:")) {
    // Extract hours and percentage from "⚠️ MEETING TIME: 23.5 hours (51%) [above 20% threshold]"
    const match = warningText.match(
      /MEETING TIME:\s*([\d.]+)\s*hours?\s*\((\d+)%\)/
    );
    if (match) {
      const hours = match[1];
      const percentage = match[2];
      return `${hours} hours of meetings (${percentage}%)`;
    }
  }

  // Handle other warning patterns
  if (warningText.includes("NO CODING TIME:")) {
    return "No coding time this week";
  }

  if (warningText.includes("NO DESIGN TIME:")) {
    return "No design time this week";
  }

  // For other warnings, just remove the ⚠️ and clean up
  return warningText
    .replace(/^⚠️\s*/, "") // Remove warning emoji
    .replace(/\s*\[.*?\]\s*$/, "") // Remove bracketed explanations
    .trim();
}

// Convert task names to past tense
function makePastTense(taskNames) {
  return taskNames
    .replace(/\bStart\b/g, "Started")
    .replace(/\bFinish\b/g, "Finished")
    .replace(/\bClean\b/g, "Cleaned")
    .replace(/\bSend\b/g, "Sent")
    .replace(/\bCreate\b/g, "Created")
    .replace(/\bUpdate\b/g, "Updated")
    .replace(/\bFix\b/g, "Fixed")
    .replace(/\bAdd\b/g, "Added")
    .replace(/\bRemove\b/g, "Removed")
    .replace(/\bImplement\b/g, "Implemented")
    .replace(/\bDesign\b/g, "Designed")
    .replace(/\bBuild\b/g, "Built")
    .replace(/\bReview\b/g, "Reviewed")
    .replace(/\bTest\b/g, "Tested")
    .replace(/\bDeploy\b/g, "Deployed")
    .replace(/\bSetup\b/g, "Set up")
    .replace(/\bConfigure\b/g, "Configured")
    .replace(/\bPresent\b/g, "Presented")
    .replace(/\bMap\b/g, "Mapped")
    .replace(/\bDemo\b/g, "Demoed")
    .replace(/\bMapping\b/g, "Mapped");
}

// Extract specific care-abouts from evaluations
function extractCareAbouts(taskEvals, calEvals) {
  const careAbouts = {
    good: [],
    bad: [],
  };

  // NEW: Look for warning signs (⚠️) in both task and calendar evaluations
  const allWarnings = [];

  // Check task evaluations for warnings
  taskEvals.forEach((eval) => {
    if (eval.rawLine && eval.rawLine.includes("⚠️")) {
      allWarnings.push(cleanWarningMessage(eval.text));
    }
  });

  // Check calendar evaluations for warnings
  calEvals.forEach((eval) => {
    if (eval.rawLine && eval.rawLine.includes("⚠️")) {
      allWarnings.push(cleanWarningMessage(eval.text));
    }
  });

  // Add all warnings to bad items
  careAbouts.bad.push(...allWarnings);

  // 1. Rock status (from tasks) - TOP PRIORITY
  const rockEvals = taskEvals.filter(
    (e) =>
      e.text.includes("ROCK ACHIEVED") ||
      e.text.includes("ROCK PROGRESS") ||
      e.text.includes("ROCK FAILED") ||
      e.text.includes("ROCK LITTLE PROGRESS")
  );

  let rockText = "";
  rockEvals.forEach((rock) => {
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
      // Add rock failures to bad column (will be reordered later)
      careAbouts.bad.push(rock.text);
    }
  });

  // 2. OOO Days (from cal) - HIGH PRIORITY
  const oooEval = calEvals.find((e) => e.text.includes("OOO:"));
  let oooDays = 0;
  if (oooEval) {
    // Extract the number of days from the OOO text
    const dayMatch = oooEval.text.match(/OOO: (\d+) Days?/);
    if (dayMatch) {
      oooDays = parseInt(dayMatch[1]);
      const oooText = `🏝️ Out of office ${oooDays} day${
        oooDays === 1 ? "" : "s"
      } this week`;

      if (oooDays === 1) {
        // 1 day OOO goes in "what went well" at the top
        careAbouts.good.unshift(oooText);
      } else {
        // Multiple days OOO goes in both columns at the top
        careAbouts.good.unshift(oooText);
        careAbouts.bad.unshift(oooText);
      }
    }
  }

  // 3. Design Tasks (from tasks) - Format as "Designed [task name]"
  const designTaskEval = taskEvals.find(
    (e) => e.text.includes("DESIGN TASKS") || e.text.includes("NO DESIGN TASKS")
  );
  let designTasksText = "";
  if (designTaskEval) {
    if (designTaskEval.type === "good") {
      // Extract task names
      const taskMatch = designTaskEval.text.match(
        /DESIGN TASKS:\s*\d+\s+completed\s*\(([^)]+)\)/
      );
      const taskNames = taskMatch ? taskMatch[1] : "";
      if (taskNames) {
        // Format as "Designed [first task]… [other tasks]"
        const designTaskNames = taskNames.split(", ");
        if (designTaskNames.length > 0) {
          const firstTask = `Designed ${designTaskNames[0].trim()}`;
          const otherTasks = designTaskNames
            .slice(1)
            .map((task) => task.trim());
          designTasksText = [firstTask, ...otherTasks].join("… ");
        }
      }
    } else {
      // Clean up "NO DESIGN TASKS: 0 completed" to "No design tasks this week"
      const cleanText = designTaskEval.text
        .replace(
          /^NO\s+DESIGN\s+TASKS:\s*\d+\s+completed$/i,
          "No design tasks this week"
        )
        .replace(/^NO\s+DESIGN\s+TASKS$/i, "No design tasks this week");
      careAbouts.bad.push(cleanText);
    }
  }

  // 4. Misc Meetings (from cal) - ALL meetings, condensed format in one paragraph
  const meetingEval = calEvals.find((e) => e.text.includes("MEETINGS"));
  let meetingsText = "";
  if (meetingEval && meetingEval.type === "good" && meetingEval.bullets) {
    // Clean and format meeting names, ensure they're in one paragraph
    const cleanMeetingBullets = meetingEval.bullets.map(cleanMeetingName);
    meetingsText = cleanMeetingBullets.join("… ");
  }

  // 5. Feedback Tasks (from tasks) - Format as "Feedback on [task name]"
  const feedbackTaskEval = taskEvals.find(
    (e) =>
      e.text.includes("FEEDBACK TASKS") || e.text.includes("NO FEEDBACK TASKS")
  );
  let feedbackTasksText = "";
  if (feedbackTaskEval) {
    if (feedbackTaskEval.type === "good") {
      // Extract task names
      const taskMatch = feedbackTaskEval.text.match(
        /FEEDBACK TASKS:\s*\d+\s+completed\s*\(([^)]+)\)/
      );
      const taskNames = taskMatch ? taskMatch[1] : "";
      if (taskNames) {
        // Format as "Feedback on [first task]… [other tasks]"
        const feedbackTaskNames = taskNames.split(", ");
        if (feedbackTaskNames.length > 0) {
          const firstTask = `Feedback on ${feedbackTaskNames[0].trim()}`;
          const otherTasks = feedbackTaskNames
            .slice(1)
            .map((task) => task.trim());
          feedbackTasksText = [firstTask, ...otherTasks].join("… ");
        }
      }
    } else {
      // Clean up "NO FEEDBACK TASKS: 0 completed" to "No feedback tasks this week"
      const cleanText = feedbackTaskEval.text
        .replace(
          /^NO\s+FEEDBACK\s+TASKS:\s*\d+\s+completed$/i,
          "No feedback tasks this week"
        )
        .replace(/^NO\s+FEEDBACK\s+TASKS$/i, "No feedback tasks this week");
      careAbouts.bad.push(cleanText);
    }
  }

  // 6. Research Tasks (from tasks) - Format as "Researched [task name]"
  const researchTaskEval = taskEvals.find(
    (e) =>
      e.text.includes("RESEARCH TASKS") || e.text.includes("NO RESEARCH TASKS")
  );
  let researchTasksText = "";
  if (researchTaskEval) {
    if (researchTaskEval.type === "good") {
      // Extract task names
      const taskMatch = researchTaskEval.text.match(
        /RESEARCH TASKS:\s*\d+\s+completed\s*\(([^)]+)\)/
      );
      const taskNames = taskMatch ? taskMatch[1] : "";
      if (taskNames) {
        // Format as "Researched [first task]… [other tasks]"
        const researchTaskNames = taskNames.split(", ");
        if (researchTaskNames.length > 0) {
          const firstTask = `Researched ${researchTaskNames[0].trim()}`;
          const otherTasks = researchTaskNames
            .slice(1)
            .map((task) => task.trim());
          researchTasksText = [firstTask, ...otherTasks].join("… ");
        }
      }
    } else {
      // Clean up "NO RESEARCH TASKS: 0 completed" to "No research tasks this week"
      const cleanText = researchTaskEval.text
        .replace(
          /^NO\s+RESEARCH\s+TASKS:\s*\d+\s+completed$/i,
          "No research tasks this week"
        )
        .replace(/^NO\s+RESEARCH\s+TASKS$/i, "No research tasks this week");
      careAbouts.bad.push(cleanText);
    }
  }

  // 7. QA Tasks (from tasks) - Format as "QA'd [task name]"
  const qaTaskEval = taskEvals.find(
    (e) => e.text.includes("QA TASKS") || e.text.includes("NO QA TASKS")
  );
  let qaTasksText = "";
  if (qaTaskEval) {
    if (qaTaskEval.type === "good") {
      // Extract task names
      const taskMatch = qaTaskEval.text.match(
        /QA TASKS:\s*\d+\s+completed\s*\(([^)]+)\)/
      );
      const taskNames = taskMatch ? taskMatch[1] : "";
      if (taskNames) {
        // Format as "QA'd [first task]… [other tasks]"
        const qaTaskNames = taskNames.split(", ");
        if (qaTaskNames.length > 0) {
          const firstTask = `QA'd ${qaTaskNames[0].trim()}`;
          const otherTasks = qaTaskNames.slice(1).map((task) => task.trim());
          qaTasksText = [firstTask, ...otherTasks].join("… ");
        }
      }
    } else {
      // Clean up "NO QA TASKS: 0 completed" to "No qa tasks this week"
      const cleanText = qaTaskEval.text
        .replace(
          /^NO\s+QA\s+TASKS:\s*\d+\s+completed$/i,
          "No qa tasks this week"
        )
        .replace(/^NO\s+QA\s+TASKS$/i, "No qa tasks this week");
      careAbouts.bad.push(cleanText);
    }
  }

  // 6. PRs shipped (from cal) - LAST, condensed format
  const prEval = calEvals.find((e) => e.text.includes("PRs SHIPPED"));
  let prsText = "";
  if (prEval && prEval.type === "good" && prEval.bullets) {
    // Extract PR count from header
    const prCountMatch = prEval.text.match(/(\d+)\s+PRs?\s+SHIPPED/);
    const prCount = prCountMatch ? prCountMatch[1] : "0";

    // Clean PR titles
    const cleanPRBullets = prEval.bullets.map(cleanPRTitle);

    prsText = `${prCount} PRs SHIPPED (${cleanPRBullets.join("… ")})`;
  } else if (prEval && prEval.type === "bad") {
    // Clean up "NO PRs SHIPPED: 0 PRs this week" to "No PRs this week"
    const cleanText = prEval.text
      .replace(
        /^NO\s+PRs?\s+SHIPPED:\s*0\s+PRs?\s+this\s+week$/i,
        "No PRs this week"
      )
      .replace(
        /^NO\s+PRs?\s+SHIPPED:\s*\d+\s+PRs?\s+this\s+week$/i,
        "No PRs this week"
      );
    careAbouts.bad.push(cleanText);
  }

  // 7. Build the summary in the correct order: ROCK -> TASKS -> EVENTS -> PRS
  const summaryItems = [];

  // 1. ROCK (first!)
  if (rockText) {
    summaryItems.push(rockText + "…");
  }

  // 2. TASK SUMMARY - Each task type gets its own paragraph
  // Add design tasks
  if (designTasksText) {
    summaryItems.push(designTasksText + "…");
  }

  // Add feedback tasks
  if (feedbackTasksText) {
    summaryItems.push(feedbackTasksText + "…");
  }

  // Add research tasks
  if (researchTasksText) {
    summaryItems.push(researchTasksText + "…");
  }

  // Add QA tasks
  if (qaTasksText) {
    summaryItems.push(qaTasksText + "…");
  }

  // 3. CAL EVENTS (meetings only) - All meetings in one paragraph
  if (meetingsText) {
    summaryItems.push(meetingsText + "…");
  }

  // 7. PRS SHIPPED
  if (prsText) {
    summaryItems.push(prsText);
  }

  // Combine everything with proper spacing
  if (summaryItems.length > 0) {
    careAbouts.good.unshift(summaryItems.join("\n\n"));
  }

  // 8. OOO Cleanup - If 5+ days OOO, remove all bad items except OOO itself
  if (oooDays >= 5) {
    // Keep only the OOO entry in bad items
    const oooBadItem = careAbouts.bad.find((item) =>
      item.includes("Out of office")
    );
    careAbouts.bad = oooBadItem ? [oooBadItem] : [];
  }

  // 9. Ensure OOO is always at the top of both columns
  if (oooDays > 0) {
    const oooText = `🏝️ Out of office ${oooDays} day${
      oooDays === 1 ? "" : "s"
    } this week`;

    // Remove any existing OOO entries
    careAbouts.good = careAbouts.good.filter(
      (item) => !item.includes("Out of office")
    );
    careAbouts.bad = careAbouts.bad.filter(
      (item) => !item.includes("Out of office")
    );

    // Add OOO at the top of both columns
    careAbouts.good.unshift(oooText);
    careAbouts.bad.unshift(oooText);
  }

  // 10. Handle empty bad items
  if (careAbouts.bad.length === 0) {
    careAbouts.bad.push("(Nothing of note)");
  }

  return careAbouts;
}

// Update Notion with parsed summaries
async function updateNotionSummary(pageId, goodItems, badItems) {
  const properties = {
    "Work - What went well?": {
      rich_text: [
        {
          text: { content: goodItems.join("\n\n") },
        },
      ],
    },
    "Work - What didn't go so well?": {
      rich_text: [
        {
          text: { content: badItems.join("\n\n") },
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
    const taskEvaluations = parseEvaluationSection(weekData.workTaskSummary);
    const calEvaluations = parseEvaluationSection(weekData.workCalSummary);

    console.log(`   Task evaluations found: ${taskEvaluations.length}`);
    console.log(`   Calendar evaluations found: ${calEvaluations.length}`);

    // Extract care-abouts
    console.log("🎯 Extracting care-abouts...");
    const careAbouts = extractCareAbouts(taskEvaluations, calEvaluations);

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
