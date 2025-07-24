const { Client } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const { askQuestion, rl } = require("./src/utils/cli-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

// Default week (will be overridden by user input)
let TARGET_WEEK = 1;

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n🎯 Retrospective Generator");

  // Ask for retro type
  console.log("\n? Which retrospective to generate?");
  console.log("  1 - Work Retrospective");
  console.log("  2 - Personal Retrospective");

  const typeInput = await askQuestion("\n? Enter choice (1 or 2): ");
  const retroType = typeInput.trim() === "2" ? "personal" : "work";

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
    `\n📊 Generating ${retroType} retrospective for Week${
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
  return { retroType, targetWeeks };
}

async function fetchWeekData(weekNumber, retroType) {
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

  // Extract common data
  const weekData = {
    id: page.id,
    weekRecap: page.properties["Week Recap"]?.title?.[0]?.plain_text || "",
    // Try both rich_text and date for the Date field
    date:
      page.properties["Date"]?.rich_text?.[0]?.plain_text ||
      page.properties["Date"]?.date?.start ||
      "",
  };

  // Add type-specific fields
  if (retroType === "work") {
    weekData.workTaskSummary =
      page.properties["Work Task Summary"]?.rich_text?.[0]?.plain_text || "";
    weekData.workPRSummary =
      page.properties["Work PR Summary"]?.rich_text?.[0]?.plain_text || "";
    weekData.defaultWorkCal =
      page.properties["Default Work Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.codingTicketsCal =
      page.properties["Coding & Tickets Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.designWorkCal =
      page.properties["Design Work Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.reviewFeedbackCal =
      page.properties["Review, Feedback, Crit Cal"]?.rich_text?.[0]
        ?.plain_text || "";
    weekData.designDevQACal =
      page.properties["Design & Dev QA Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.ritualsCal =
      page.properties["Rituals Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.researchCal =
      page.properties["Research Cal"]?.rich_text?.[0]?.plain_text || "";
  } else {
    // Personal retro fields
    weekData.personalTaskSummary =
      page.properties["Personal Task Summary"]?.rich_text?.[0]?.plain_text ||
      "";
    weekData.personalPRSummary =
      page.properties["Personal PR Summary"]?.rich_text?.[0]?.plain_text || "";
    weekData.personalCal =
      page.properties["Personal Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.interpersonalCal =
      page.properties["Interpersonal Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.familyCal =
      page.properties["Family Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.developmentCal =
      page.properties["Development Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.hobbiesCal =
      page.properties["Hobbies Cal"]?.rich_text?.[0]?.plain_text || "";
    weekData.exerciseCal =
      page.properties["Exercise Cal"]?.rich_text?.[0]?.plain_text || "";
  }

  return weekData;
}

// Parse calendar entries to extract hours
function parseCalendarHours(calendarText) {
  if (!calendarText || calendarText.includes("No ")) {
    return { hours: 0, events: 0, isEmpty: true };
  }

  // Extract total from header like "CODING (1 events, 1.5 hours):"
  const headerMatch = calendarText.match(/\((\d+) events?, ([\d.]+) hours?\)/);
  if (headerMatch) {
    return {
      events: parseInt(headerMatch[1]),
      hours: parseFloat(headerMatch[2]),
      isEmpty: false,
    };
  }

  return { hours: 0, events: 0, isEmpty: true };
}

// Parse task summary to get counts
function parseTaskCounts(taskSummary) {
  const counts = {
    total: 0,
    research: 0,
    design: 0,
    coding: 0,
    feedback: 0,
    qa: 0,
    admin: 0,
    social: 0,
    ooo: 0,
  };

  // Extract total from header
  const totalMatch = taskSummary.match(/Work Tasks \((\d+)\)/);
  if (totalMatch) {
    counts.total = parseInt(totalMatch[1]);
  }

  // Extract individual counts
  const categories = [
    "Research",
    "Design",
    "Coding",
    "Feedback",
    "QA",
    "Admin",
    "Social",
    "OOO",
  ];
  categories.forEach((cat) => {
    const regex = new RegExp(`${cat} Tasks \\((\\d+)\\)`);
    const match = taskSummary.match(regex);
    if (match) {
      counts[cat.toLowerCase()] = parseInt(match[1]);
    }
  });

  return counts;
}

// Parse PR summary into structured format
function parsePRSummary(prSummary) {
  if (!prSummary) return [];

  const prs = [];
  const prSections = prSummary.split("---").filter((s) => s.trim());

  prSections.forEach((section) => {
    const lines = section.trim().split("\n");
    if (lines.length === 0) return;

    // First line has PR title and commit count
    const firstLine = lines[0];
    const titleMatch = firstLine.match(
      /(.+?)\s*\(#(\d+)\)\s*\[(\d+)\s*commits?\]/
    );

    if (titleMatch) {
      const title = titleMatch[1].trim();
      const prNumber = titleMatch[2];
      const commitCount = titleMatch[3];

      // Rest of the lines are commit messages
      const commitMessages = lines.slice(1).join(", ").trim();

      prs.push({
        title,
        prNumber,
        commitCount: parseInt(commitCount),
        commitMessages,
      });
    }
  });

  return prs;
}

// Extract PR count and commit count from header
function parsePRHeader(prSummary) {
  const headerMatch = prSummary.match(/PRs \((\d+) PRs?, (\d+) commits?\)/);
  if (headerMatch) {
    return {
      prCount: parseInt(headerMatch[1]),
      commitCount: parseInt(headerMatch[2]),
    };
  }
  return { prCount: 0, commitCount: 0 };
}

// Calculate all statistics
function calculateStats(weekData, retroType) {
  let calendars;
  let taskSummary;
  let prSummary;

  if (retroType === "work") {
    // Parse all work calendar data
    calendars = {
      default: parseCalendarHours(weekData.defaultWorkCal),
      coding: parseCalendarHours(weekData.codingTicketsCal),
      design: parseCalendarHours(weekData.designWorkCal),
      review: parseCalendarHours(weekData.reviewFeedbackCal),
      qa: parseCalendarHours(weekData.designDevQACal),
      rituals: parseCalendarHours(weekData.ritualsCal),
      research: parseCalendarHours(weekData.researchCal),
    };
    taskSummary = weekData.workTaskSummary;
    prSummary = weekData.workPRSummary;
  } else {
    // Parse all personal calendar data
    calendars = {
      personal: parseCalendarHours(weekData.personalCal),
      interpersonal: parseCalendarHours(weekData.interpersonalCal),
      family: parseCalendarHours(weekData.familyCal),
      development: parseCalendarHours(weekData.developmentCal),
      hobbies: parseCalendarHours(weekData.hobbiesCal),
      exercise: parseCalendarHours(weekData.exerciseCal),
    };
    taskSummary = weekData.personalTaskSummary;
    prSummary = weekData.personalPRSummary;
  }

  // Calculate totals
  const totalHours = Object.values(calendars).reduce(
    (sum, cal) => sum + cal.hours,
    0
  );
  const totalEvents = Object.values(calendars).reduce(
    (sum, cal) => sum + cal.events,
    0
  );

  // Calculate percentages
  const percentages = {};
  Object.entries(calendars).forEach(([key, cal]) => {
    percentages[key] =
      totalHours > 0 ? Math.round((cal.hours / totalHours) * 100) : 0;
  });

  // Parse task counts
  const taskCounts = parseTaskCounts(taskSummary);

  // Parse PR data
  const prData = parsePRHeader(prSummary);

  return {
    totalHours,
    totalEvents,
    totalTasks: taskCounts.total,
    calendars,
    percentages,
    taskCounts,
    prData,
  };
}

function buildCombinedDocument(weekData, stats, retroType) {
  let doc = "";

  // Header
  doc += `Week Recap: ${weekData.weekRecap}\n`;
  doc += `Date: ${weekData.date}\n\n`;

  // What I did section with total in header
  doc += `What I did (${stats.totalTasks} tasks completed):\n`;
  doc += `======\n`;

  // Get the appropriate task summary and PR summary based on retro type
  const taskSummary =
    retroType === "work"
      ? weekData.workTaskSummary
      : weekData.personalTaskSummary;
  const prSummary =
    retroType === "work" ? weekData.workPRSummary : weekData.personalPRSummary;

  // Process task summary with PR insertion
  const taskLines = taskSummary.split("\n");
  let skipNext = false;
  let foundCodingTasks = false;

  for (let i = 0; i < taskLines.length; i++) {
    const line = taskLines[i];

    // Skip the main header line
    if (line.startsWith("Work Tasks") || line.startsWith("Personal Tasks"))
      continue;

    // Convert bullets to dashes
    let processedLine = line.replace(/•/g, "-");

    // Check if we're at the Coding Tasks section
    if (line.includes("Coding Tasks")) {
      foundCodingTasks = true;
      doc += processedLine + "\n";

      // Add coding tasks
      let j = i + 1;
      while (j < taskLines.length && !taskLines[j].includes("------")) {
        if (taskLines[j].trim()) {
          doc += taskLines[j].replace(/•/g, "-") + "\n";
        }
        j++;
      }

      // Add the divider
      doc += "------\n";

      // Now add PR Data section if we have PR summary
      if (prSummary) {
        const prs = parsePRSummary(prSummary);
        const prHeader = parsePRHeader(prSummary);

        doc += `PR Data (${prHeader.prCount} PRs, ${prHeader.commitCount} commits):\n`;

        prs.forEach((pr) => {
          doc += `- ${pr.title} (#${pr.prNumber}) [${pr.commitCount} commit${
            pr.commitCount !== 1 ? "s" : ""
          }]`;
          if (pr.commitMessages) {
            doc += ` (${pr.commitMessages})`;
          }
          doc += "\n";
        });
      }

      // Skip to after the original divider
      i = j;
      continue;
    }

    // Skip the header section
    if (line.includes("======") && i < 5) {
      continue;
    }

    doc += processedLine + "\n";
  }

  doc += "\n";

  // Where I spent my time section with totals in header
  doc += `Where I spent my time (${stats.totalHours} hours, ${stats.totalEvents} events):\n`;
  doc += `======\n`;

  // Calendar data with different structures based on retro type
  let calendarInfo;

  if (retroType === "work") {
    calendarInfo = [
      {
        key: "default",
        name: "General/Meetings",
        data: weekData.defaultWorkCal,
      },
      { key: "coding", name: "Coding", data: weekData.codingTicketsCal },
      { key: "design", name: "Design", data: weekData.designWorkCal },
      {
        key: "review",
        name: "Review/Feedback",
        data: weekData.reviewFeedbackCal,
      },
      { key: "qa", name: "QA", data: weekData.designDevQACal },
      { key: "rituals", name: "Rituals", data: weekData.ritualsCal },
      { key: "research", name: "Research", data: weekData.researchCal },
    ];
  } else {
    calendarInfo = [
      { key: "personal", name: "Personal", data: weekData.personalCal },
      {
        key: "interpersonal",
        name: "Interpersonal",
        data: weekData.interpersonalCal,
      },
      { key: "family", name: "Family", data: weekData.familyCal },
      {
        key: "development",
        name: "Development",
        data: weekData.developmentCal,
      },
      { key: "hobbies", name: "Hobbies", data: weekData.hobbiesCal },
      { key: "exercise", name: "Exercise", data: weekData.exerciseCal },
    ];
  }

  calendarInfo.forEach((cal) => {
    const calStats = stats.calendars[cal.key];

    if (calStats.isEmpty) {
      doc += `${cal.name} (0 events, 0 hours, 0%):\n`;
      doc += `No ${cal.name.toLowerCase()} events this week.\n`;
    } else {
      // Add header with stats
      doc += `${cal.name} (${calStats.events} event${
        calStats.events !== 1 ? "s" : ""
      }, ${calStats.hours} hour${calStats.hours !== 1 ? "s" : ""}, ${
        stats.percentages[cal.key]
      }%):\n`;

      // Extract and format the event list
      const lines = cal.data.split("\n");
      let foundEvents = false;

      lines.forEach((line) => {
        // Skip the original header line
        if (line.includes(" events,") && line.includes(" hours)")) return;
        if (line.includes("------")) return;

        // Convert bullets to dashes and add events
        if (line.trim() && line.includes("•")) {
          doc += line.replace(/•/g, "-") + "\n";
          foundEvents = true;
        }
      });
    }

    doc += "------\n";
  });

  // Remove trailing divider
  doc = doc.trim() + "\n";

  return doc;
}

// Load prompt template from file
function loadPrompt(promptName) {
  try {
    return fs.readFileSync(`./src/prompts/${promptName}.txt`, "utf8");
  } catch (error) {
    throw new Error(`Failed to load prompt ${promptName}: ${error.message}`);
  }
}

// Load context from file
function loadContext(contextFile) {
  try {
    return fs.readFileSync(`./${contextFile}.md`, "utf8");
  } catch (error) {
    console.warn(`No ${contextFile}.md found, continuing without context`);
    return "";
  }
}

// Generate retrospective using AI
async function generateRetrospective(combinedDoc, retroType) {
  console.log("\n🤖 Generating retrospective with AI...");

  // Load prompt and context based on retro type
  const promptName =
    retroType === "personal"
      ? "retro-generation-personal"
      : "retro-generation-work";

  const contextFile =
    retroType === "personal" ? "context-personal" : "context-work";

  const promptTemplate = loadPrompt(promptName);
  const context = loadContext(contextFile);

  // Replace placeholders
  let prompt = promptTemplate
    .replace("{{CONTEXT}}", context)
    .replace("{{WEEK_DATA}}", combinedDoc);

  // Call Claude
  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }],
  });

  const retroText = message.content[0].text.trim();
  console.log("✅ Retrospective generated!");

  // Parse the response to extract the three sections
  const sections = retroText.split(
    /what didn't go so well\?|what didn't go well\?/i
  );

  if (sections.length < 2) {
    throw new Error("AI response did not include both sections");
  }

  // Extract only bullet points from "What went well?" section
  const wentWellSection = sections[0].replace(/what went well\?/i, "");
  const bulletPoints = wentWellSection
    .split("\n")
    .filter(
      (line) => line.trim().startsWith("-") || line.trim().startsWith("•")
    )
    .map((line) => line.trim())
    .join("\n");

  const wentWell = bulletPoints;

  // Split the second part to get "didn't go well" and "overall"
  const remainingSections = sections[1].split(/overall\?/i);

  const didntGoWell = remainingSections[0].trim();
  const overall =
    remainingSections.length > 1 ? remainingSections[1].trim() : "";

  return {
    wentWell,
    didntGoWell,
    overall,
    fullResponse: retroText,
  };
}

// Update Notion with retrospective
async function updateNotionRetro(pageId, retro, retroType) {
  console.log("\n📝 Updating Notion with retrospective...");

  const prefix = retroType === "personal" ? "Personal" : "Work";

  const properties = {
    [`${prefix} - What went well?`]: {
      rich_text: [
        {
          text: { content: retro.wentWell },
        },
      ],
    },
    [`${prefix} - What didn't go so well?`]: {
      rich_text: [
        {
          text: { content: retro.didntGoWell },
        },
      ],
    },
  };

  // Add overall section if it exists
  if (retro.overall) {
    properties[`${prefix} - Overall?`] = {
      rich_text: [
        {
          text: { content: retro.overall },
        },
      ],
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });

  console.log("✅ Notion updated successfully!");
}

async function generateRetro(retroType, weekNumber) {
  try {
    console.log(`📥 Fetching Week ${weekNumber} data...`);

    // Fetch the week data
    const weekData = await fetchWeekData(weekNumber, retroType);
    console.log(`✅ Found Week ${weekNumber} data!`);

    // Calculate statistics
    console.log("📊 Calculating statistics...");
    const stats = calculateStats(weekData, retroType);
    console.log(`   Total hours: ${stats.totalHours}`);
    console.log(`   Total events: ${stats.totalEvents}`);
    console.log(`   Total tasks: ${stats.totalTasks}`);

    // Build the combined document
    console.log("📝 Building combined document...");
    const combinedDoc = buildCombinedDocument(weekData, stats, retroType);

    // Save to file for review
    const filename = `week-${weekNumber}-${retroType}-combined.txt`;
    fs.writeFileSync(filename, combinedDoc);
    console.log(`\n✅ Combined document saved to ${filename}`);

    // Generate retrospective with AI
    const retro = await generateRetrospective(combinedDoc, retroType);

    // Save retro to file for review
    const retroFilename = `week-${weekNumber}-${retroType}-retro.txt`;
    fs.writeFileSync(retroFilename, retro.fullResponse);
    console.log(`\n✅ Retrospective saved to ${retroFilename}`);

    // Show preview
    console.log("\n📄 Retrospective Preview:");
    console.log("================");
    console.log("What went well:");
    console.log(retro.wentWell.substring(0, 200) + "...");
    console.log("\nWhat didn't go well:");
    console.log(retro.didntGoWell.substring(0, 200) + "...");
    if (retro.overall) {
      console.log("\nOverall:");
      console.log(retro.overall.substring(0, 200) + "...");
    }

    // Update Notion
    await updateNotionRetro(weekData.id, retro, retroType);

    console.log(`\n🎉 Week ${weekNumber} ${retroType} retrospective complete!`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error.stack);
  }
}

// Main function with CLI support
async function main() {
  const args = process.argv.slice(2);
  let retroType = "work";
  let targetWeeks = [TARGET_WEEK]; // default

  // Check for command line args
  if (args.includes("--personal")) {
    retroType = "personal";
  }

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
    const result = await runInteractiveMode();
    retroType = result.retroType;
    targetWeeks = result.targetWeeks;
  }

  // Run the retrospective generation for each week
  console.log(
    `\n🚀 Processing ${targetWeeks.length} week${
      targetWeeks.length > 1 ? "s" : ""
    }...\n`
  );

  for (let i = 0; i < targetWeeks.length; i++) {
    const week = targetWeeks[i];
    console.log(`📍 [${i + 1}/${targetWeeks.length}] Starting Week ${week}...`);
    await generateRetro(retroType, week);

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
