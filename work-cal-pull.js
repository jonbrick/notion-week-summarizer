const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const readline = require("readline");
const { processPREvents } = require("./src/utils/pr-processor");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("🗓️ Work Calendar Summary Generator");

// Google Auth
function getGoogleAuth(authType) {
  if (authType === "work") {
    const oauth2Client = new google.auth.OAuth2(
      process.env.WORK_GOOGLE_CLIENT_ID,
      process.env.WORK_GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.WORK_GOOGLE_REFRESH_TOKEN,
    });
    return oauth2Client;
  }
}

// Fetch calendar events
async function fetchCalendarEvents(calendarId, authType, startDate, endDate) {
  try {
    const auth = getGoogleAuth(authType);
    const calendar = google.calendar({ version: "v3", auth });

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: `${startDate}T00:00:00Z`,
      timeMax: `${endDate}T23:59:59Z`,
      singleEvents: true,
      orderBy: "startTime",
    });

    return response.data.items || [];
  } catch (error) {
    console.error(`❌ Error fetching calendar events:`, error.message);
    return [];
  }
}

// Duration calculation
function calculateDuration(startDateTime, endDateTime) {
  if (!startDateTime || !endDateTime) {
    return null;
  }

  try {
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return null;
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));

    return diffMinutes > 0 ? diffMinutes : null;
  } catch (error) {
    return null;
  }
}

// Format duration
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) {
    return "0 minutes";
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = minutes / 60;

  if (hours % 1 === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  if (hours % 0.5 === 0) {
    return `${hours} hours`;
  }

  const roundedHours = Math.round(hours * 4) / 4;
  return `${roundedHours} hours`;
}

function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

// Categorize event by color
function categorizeEventByColor(rawEvent) {
  const colorId = rawEvent.colorId || "default";
  const eventType = rawEvent.eventType || "default";
  const responseStatus = getMyResponseStatus(rawEvent.attendees);

  // 1. EventType trumps everything
  if (eventType === "outOfOffice") {
    return createEventObject(rawEvent, "ignored", "Out of Office");
  }
  if (eventType === "workingLocation") {
    return createEventObject(rawEvent, "ignored", "Working Location");
  }

  // 2. RSVP filter - declined meetings go to ignored
  if (responseStatus === "declined") {
    return createEventObject(rawEvent, "ignored", "Declined Meeting");
  }

  // 3. JB OOO/PTO filter - track all-day JB OOO/PTO events
  const eventTitle = rawEvent.summary || "";
  const isAllDay =
    rawEvent.start && rawEvent.start.date && !rawEvent.start.dateTime;

  if (
    isAllDay &&
    eventTitle.includes("JB") &&
    (eventTitle.includes("OOO") || eventTitle.includes("PTO"))
  ) {
    return createEventObject(rawEvent, "ooo", "JB OOO/PTO");
  }

  // 4. Color mapping for default eventType events
  const colorMapping = {
    8: { category: "personal", name: "Personal Event Cal" }, // Gray
    3: { category: "coding", name: "Coding & Tickets Cal" }, // Purple
    2: { category: "design", name: "Design Work Cal" }, // Green
    5: { category: "review", name: "Review, Feedback, Crit Cal" }, // Yellow
    11: { category: "qa", name: "Design & Dev QA Cal" }, // Red
    9: { category: "rituals", name: "Rituals Cal" }, // New color
    1: { category: "research", name: "Research Cal" }, // Research color
  };

  const colorInfo = colorMapping[colorId];
  if (colorInfo) {
    return createEventObject(rawEvent, colorInfo.category, colorInfo.name);
  }

  // Default fallback for unmapped colors
  return createEventObject(rawEvent, "unknown", "Unknown Color");
}

// Create event object
function createEventObject(rawEvent, category, categoryName) {
  const isAllDay =
    rawEvent.start && rawEvent.start.date && !rawEvent.start.dateTime;
  const duration = isAllDay
    ? null
    : calculateDuration(rawEvent.start?.dateTime, rawEvent.end?.dateTime);

  return {
    title: rawEvent.summary || "Untitled",
    duration: duration,
    durationFormatted: duration
      ? formatDuration(duration)
      : isAllDay
      ? "all day"
      : "unknown",
    colorId: rawEvent.colorId || "default",
    category: category,
    categoryName: categoryName,
    startTime: rawEvent.start?.dateTime || rawEvent.start?.date,
    endTime: rawEvent.end?.dateTime || rawEvent.end?.date,
    isAllDay: isAllDay,
    attendeeCount: rawEvent.attendees ? rawEvent.attendees.length : 0,
    eventType: rawEvent.eventType || "default",
    responseStatus: getMyResponseStatus(rawEvent.attendees),
  };
}

// Get week date range from Notion
async function getWeekDateRange(weekNumber) {
  const recapPages = await notion.databases.query({
    database_id: RECAP_DATABASE_ID,
  });

  const paddedWeek = weekNumber.toString().padStart(2, "0");

  for (const page of recapPages.results) {
    const titleProperty = page.properties["Week Recap"];
    if (titleProperty && titleProperty.title) {
      const title = titleProperty.title.map((t) => t.plain_text).join("");

      if (
        title === `Week ${weekNumber} Recap` ||
        title === `Week ${paddedWeek} Recap`
      ) {
        const weekRelation = page.properties["⌛ Weeks"].relation;
        if (weekRelation && weekRelation.length > 0) {
          const weekPage = await notion.pages.retrieve({
            page_id: weekRelation[0].id,
          });
          const dateRange = weekPage.properties["Date Range (SET)"].date;

          if (dateRange) {
            return {
              startDate: dateRange.start,
              endDate: dateRange.end,
              pageId: page.id,
            };
          }
        }
      }
    }
  }

  throw new Error(`Could not find date range for Week ${weekNumber}`);
}

// Column mapping for work categories
const WORK_CATEGORY_MAPPING = {
  default: "Default Work Cal",
  coding: "Coding & Tickets Cal",
  design: "Design Work Cal",
  review: "Review, Feedback, Crit Cal",
  qa: "Design & Dev QA Cal",
  rituals: "Rituals Cal",
  research: "Research Cal",
  unknown: "Default Work Cal",
  pr: "Work PR Summary",
  summary: "Work Cal Summary", // ADD THIS LINE
};

// Category names for empty messages
const CATEGORY_DISPLAY_NAMES = {
  default: "default",
  coding: "coding",
  design: "design",
  review: "review, feedback, crit",
  qa: "QA",
  rituals: "rituals",
  research: "research",
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to parse PR summary and extract evaluation data
function parsePRSummaryForEval(prSummary) {
  if (
    !prSummary ||
    prSummary.includes("No work commits") ||
    prSummary.includes("No PR events")
  ) {
    return { count: 0, names: [] };
  }

  // Extract PR count from header like "PRs (4 PRs, 74 commits):"
  const headerMatch = prSummary.match(/PRs \((\d+) PRs?, \d+ commits?\):/);
  const count = headerMatch ? parseInt(headerMatch[1]) : 0;

  // Extract PR names from lines that start with PR titles
  const names = [];
  const lines = prSummary.split("\n");

  for (const line of lines) {
    // Look for lines that contain [X commit] or [X commits] - these are PR title lines
    if (
      line.includes("[") &&
      (line.includes("commit]") || line.includes("commits]"))
    ) {
      // Extract the full PR title by removing the [X commits] part at the end
      const title = line.replace(/\s*\[\d+\s+commits?\]$/, "").trim();
      if (title && title.length > 5) {
        names.push(title);
      }
    }
  }

  return { count, names: names }; // Return all names, no truncation
}

// Function to parse calendar hours from existing formatted calendar text
function parseExistingCalendarHours(calendarText) {
  if (!calendarText || calendarText.includes("No ")) {
    return 0;
  }

  // Extract hours from format like "CODING (9 events, 32.75 hours, 77%):"
  const hoursMatch = calendarText.match(/\(.*?(\d+(?:\.\d+)?)\s*hours?.*?\)/);
  if (hoursMatch) {
    return parseFloat(hoursMatch[1]);
  }

  // Extract hours from Work Cal Summary format like "- Coding: 32.8 hours (62%)"
  const summaryHoursMatch = calendarText.match(
    /- \w+: (\d+(?:\.\d+)?)\s*hours?/
  );
  if (summaryHoursMatch) {
    return parseFloat(summaryHoursMatch[1]);
  }

  return 0;
}

// Function to parse meeting names from Default Work Cal text
function parseMeetingNames(defaultWorkCalText) {
  if (!defaultWorkCalText || defaultWorkCalText.includes("No default events")) {
    return [];
  }

  const meetingNames = [];
  const lines = defaultWorkCalText.split("\n");

  for (const line of lines) {
    // Look for bullet points with meeting names
    if (line.trim().startsWith("•")) {
      const meetingName = line.trim().substring(1).trim(); // Remove the bullet point
      if (meetingName && meetingName.length > 0) {
        meetingNames.push(meetingName);
      }
    }
  }

  return meetingNames;
}

// Function to generate work calendar evaluation
function generateWorkCalEvaluation(
  existingCalSummary,
  prSummary,
  defaultWorkCalText = ""
) {
  const evaluations = [];

  // Parse PR data
  const prData = parsePRSummaryForEval(prSummary);

  // Parse hours from Work Cal Summary format
  let defaultHours = 0;
  let ritualsHours = 0;
  let codingHours = 0;
  let designHours = 0;
  let oooDays = 0;

  // Look for each line and extract hours from Work Cal Summary format
  const lines = existingCalSummary.split("\n");
  lines.forEach((line) => {
    if (line.includes("- Meetings:")) {
      defaultHours = parseExistingCalendarHours(line);
    } else if (line.includes("- Coding:")) {
      codingHours = parseExistingCalendarHours(line);
    } else if (line.includes("- Design:")) {
      designHours = parseExistingCalendarHours(line);
    } else if (line.includes("- OOO:")) {
      // Extract OOO days from format like "- OOO: 5 Days"
      const oooMatch = line.match(/- OOO: (\d+) Day/);
      if (oooMatch) {
        oooDays = parseInt(oooMatch[1]);
      }
    }
  });

  const totalHours = defaultHours + ritualsHours + codingHours + designHours;
  const meetingHours = defaultHours + ritualsHours;
  const meetingPercent =
    totalHours > 0 ? Math.round((meetingHours / totalHours) * 100) : 0;

  // OOO evaluation (TOP priority)
  if (oooDays > 0) {
    evaluations.push(`🏝️ OOO: ${oooDays} Day${oooDays === 1 ? "" : "s"}`);
  }

  // Good evaluations
  if (prData.count > 0) {
    evaluations.push(`✅ ${prData.count} PRs SHIPPED:`);
    // Add each PR as a bullet point
    prData.names.forEach((prName) => {
      evaluations.push(`  • ${prName}`);
    });
  }

  // MEETINGS evaluation (after PRs)
  if (defaultWorkCalText && !defaultWorkCalText.includes("No default events")) {
    const meetingNames = parseMeetingNames(defaultWorkCalText);
    if (meetingNames.length > 0) {
      evaluations.push(`✅ MEETINGS:`);
      meetingNames.forEach((meetingName) => {
        evaluations.push(`  • ${meetingName}`);
      });
    }
  }

  if (codingHours > 0) {
    evaluations.push(
      `✅ CODING TIME: ${codingHours.toFixed(1)} hours (${Math.round(
        (codingHours / totalHours) * 100
      )}%)`
    );
  }

  // Warning evaluations
  if (meetingPercent >= 20) {
    evaluations.push(
      `⚠️ MEETING TIME: ${meetingHours.toFixed(
        1
      )} hours (${meetingPercent}%) [above 20% threshold]`
    );
  }

  // Bad evaluations
  if (prData.count === 0) {
    evaluations.push(`❌ NO PRs SHIPPED: 0 PRs this week`);
  }

  if (designHours === 0) {
    evaluations.push(`❌ NO DESIGN TIME: 0 hours (0%)`);
  }

  if (codingHours === 0) {
    evaluations.push(`❌ NO CODING TIME: 0 hours`);
  }

  return evaluations;
}

// Default configuration
const DEFAULT_TARGET_WEEKS = [1];

// Calendar options
const CALENDAR_OPTIONS = [
  {
    id: 1,
    name: "Work Calendar",
    calendarId: process.env.WORK_CALENDAR_ID,
    authType: "work",
  },
  // Add more calendars here later if needed
];

let SELECTED_CALENDAR = CALENDAR_OPTIONS[0]; // Default to work
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];

// Check if running in interactive mode
async function checkInteractiveMode() {
  const args = process.argv.slice(2);

  // Check for --2, --3, etc. format
  for (const arg of args) {
    if (arg.startsWith("--") && !isNaN(parseInt(arg.slice(2)))) {
      const weekNumber = parseInt(arg.slice(2));
      TARGET_WEEKS = [weekNumber];
      return false; // Not interactive
    }
  }

  if (args.includes("--weeks")) {
    // Command line mode
    const weeksIndex = args.indexOf("--weeks");
    if (weeksIndex !== -1 && args[weeksIndex + 1]) {
      TARGET_WEEKS = args[weeksIndex + 1].split(",").map((w) => parseInt(w));
    }
    return false; // Not interactive
  }

  return true; // Interactive mode
}

// Interactive mode - now only asks for weeks
async function runInteractiveMode() {
  console.log("\n🎯 Work Calendar Summary Generator");
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

  rl.close();

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    process.exit(0);
  }

  console.log(""); // Empty line before processing starts
}

// Format events for Notion
function formatEventsForNotion(events, categoryName) {
  if (events.length === 0) {
    const displayName =
      CATEGORY_DISPLAY_NAMES[categoryName] || categoryName.toLowerCase();
    return `No ${displayName} events this week.`;
  }

  // Group events by title (after cleaning)
  const eventGroups = {};

  events.forEach((event) => {
    const cleanTitle = event.title.trim(); // Remove extra spaces

    if (!eventGroups[cleanTitle]) {
      eventGroups[cleanTitle] = {
        title: cleanTitle,
        totalMinutes: 0,
        count: 0,
      };
    }

    eventGroups[cleanTitle].totalMinutes += event.duration || 0;
    eventGroups[cleanTitle].count += 1;
  });

  // Convert to array and sort by total time (descending)
  const groupedEvents = Object.values(eventGroups).sort(
    (a, b) => b.totalMinutes - a.totalMinutes
  );

  const totalMinutes = events
    .filter((e) => e.duration)
    .reduce((sum, e) => sum + e.duration, 0);

  const timeText = totalMinutes > 0 ? `, ${formatDuration(totalMinutes)}` : "";

  let output = `${categoryName.toUpperCase()} (${
    events.length
  } events${timeText}):\n`;
  output += "------\n";

  groupedEvents.forEach((group) => {
    const duration =
      group.totalMinutes > 0 ? formatDuration(group.totalMinutes) : "unknown";
    const countText = group.count > 1 ? ` (${group.count}x)` : "";
    output += `• ${group.title}${countText} (${duration})\n`;
  });

  return output;
}

// Update Notion page with summaries
async function updateNotionSummaries(pageId, summaryUpdates) {
  const properties = {};

  // Convert summaries to Notion property format
  for (const [fieldName, summary] of Object.entries(summaryUpdates)) {
    const cleanFieldName = fieldName.trim(); // Remove any extra spaces
    properties[cleanFieldName] = {
      rich_text: [
        {
          text: {
            content: summary,
          },
        },
      ],
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
}

// Process single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

    // Get week date range and page ID
    const { startDate, endDate, pageId } = await getWeekDateRange(weekNumber);
    const paddedWeek = weekNumber.toString().padStart(2, "0");

    console.log(`✅ Found Week ${paddedWeek} Recap!`);
    console.log(`📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}`);

    // Initialize notionUpdates object
    const notionUpdates = {};

    // ALWAYS fetch and process work calendar events
    const rawEvents = await fetchCalendarEvents(
      SELECTED_CALENDAR.calendarId,
      SELECTED_CALENDAR.authType,
      startDate,
      endDate
    );

    console.log(`📥 Processing ${rawEvents.length} raw events...\n`);

    // Categorize all events
    const categorizedEvents = rawEvents.map(categorizeEventByColor);

    // Group by category
    const categories = {
      default: [],
      coding: [],
      design: [],
      review: [],
      qa: [],
      rituals: [],
      research: [],
      ooo: [], // JB OOO/PTO events
      personal: [], // For logging only
      ignored: [], // For logging only
    };

    categorizedEvents.forEach((event) => {
      if (event.category === "unknown") {
        categories.default.push(event);
      } else {
        categories[event.category].push(event);
      }
    });

    // Log ignored events (but don't send to Notion)
    const ignoredEvents = [...categories.personal, ...categories.ignored];
    if (ignoredEvents.length > 0) {
      console.log(`🚫 IGNORED (${ignoredEvents.length} events):`);
      ignoredEvents.forEach((event, index) => {
        console.log(
          `   ${index + 1}. "${event.title}" (${event.durationFormatted}) - ${
            event.categoryName
          }`
        );
      });
      console.log("");
    }

    // Process work categories
    const workCategories = [
      "default",
      "coding",
      "design",
      "review",
      "qa",
      "rituals",
      "research",
    ];

    // Calculate totals for Work Cal Summary
    let totalMinutes = 0;
    let totalEvents = 0;
    const categoryStats = {};

    workCategories.forEach((categoryKey) => {
      const columnName = WORK_CATEGORY_MAPPING[categoryKey];
      const events = categories[categoryKey];
      const formattedContent = formatEventsForNotion(events, categoryKey);

      notionUpdates[columnName] = formattedContent;

      // Calculate stats
      const categoryMinutes = events
        .filter((e) => e.duration)
        .reduce((sum, e) => sum + e.duration, 0);

      categoryStats[categoryKey] = {
        minutes: categoryMinutes,
        hours: categoryMinutes / 60,
        events: events.length,
      };

      totalMinutes += categoryMinutes;
      totalEvents += events.length;

      // Log what we're updating
      const timeText =
        categoryMinutes > 0 ? ` (${formatDuration(categoryMinutes)})` : "";
      console.log(`🔄 ${columnName}: ${events.length} events${timeText}`);
    });

    // ALWAYS fetch PR events
    let prCount = 0;
    let commitCount = 0;

    if (process.env.WORK_PR_DATA_CALENDAR_ID) {
      console.log("📥 Fetching PR events...");
      const prEvents = await fetchCalendarEvents(
        process.env.WORK_PR_DATA_CALENDAR_ID,
        "work",
        startDate,
        endDate
      );

      if (prEvents.length > 0) {
        let prSummary = await processPREvents(prEvents);

        // Extract PR count from summary
        const prMatch = prSummary.match(/PRs \((\d+) PRs?, (\d+) commits?\)/);
        if (prMatch) {
          prCount = parseInt(prMatch[1]);
          commitCount = parseInt(prMatch[2]);
        }

        // Check if summary exceeds Notion's 2000 character limit
        if (prSummary.length > 2000) {
          console.log(
            `⚠️  PR summary too long (${prSummary.length} chars), truncating...`
          );
          const maxLength = 1950;
          let truncateAt = prSummary.lastIndexOf("\n", maxLength);
          if (truncateAt === -1 || truncateAt < maxLength - 200) {
            truncateAt = maxLength;
          }
          prSummary =
            prSummary.substring(0, truncateAt) +
            "\n\n... (truncated due to length)";
        }

        notionUpdates["Work PR Summary"] = prSummary;
        console.log(`🔄 Work PR Summary: ${prEvents.length} events`);
      } else {
        notionUpdates["Work PR Summary"] = "No work commits this week.";
        console.log(`🔄 Work PR Summary: No events`);
      }
    }

    // CREATE WORK CAL SUMMARY
    const totalHours = totalMinutes / 60;
    const meetingMinutes =
      categoryStats.default.minutes + categoryStats.rituals.minutes;
    const meetingHours = meetingMinutes / 60;
    const meetingPercent =
      totalHours > 0 ? Math.round((meetingHours / totalHours) * 100) : 0;

    const productiveMinutes =
      categoryStats.coding.minutes + categoryStats.design.minutes;
    const productiveHours = productiveMinutes / 60;
    const productivePercent =
      totalHours > 0 ? Math.round((productiveHours / totalHours) * 100) : 0;

    // Calculate OOO days - count actual days for all-day events
    const oooDays = categories.ooo.reduce((totalDays, event) => {
      if (!event.isAllDay) {
        // Time-specific event, count as 1 day
        return totalDays + 1;
      } else {
        // All-day event, calculate days between start and end
        const startDate = new Date(event.startTime);
        const endDate = new Date(event.endTime);
        const diffTime = endDate.getTime() - startDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return totalDays + diffDays;
      }
    }, 0);

    let workCalSummary = `WORK CAL SUMMARY:\n`;
    workCalSummary += `Total: ${totalHours.toFixed(
      1
    )} hours (${totalEvents} events)\n`;
    workCalSummary += `- Meetings: ${meetingHours.toFixed(
      1
    )} hours (${meetingPercent}%) [Default + Rituals]\n`;
    workCalSummary += `- Coding: ${categoryStats.coding.hours.toFixed(
      1
    )} hours (${
      totalHours > 0
        ? Math.round((categoryStats.coding.hours / totalHours) * 100)
        : 0
    }%)\n`;
    workCalSummary += `- Design: ${categoryStats.design.hours.toFixed(
      1
    )} hours (${
      totalHours > 0
        ? Math.round((categoryStats.design.hours / totalHours) * 100)
        : 0
    }%)\n`;
    workCalSummary += `- Review: ${categoryStats.review.hours.toFixed(
      1
    )} hours (${
      totalHours > 0
        ? Math.round((categoryStats.review.hours / totalHours) * 100)
        : 0
    }%)\n`;
    workCalSummary += `- QA: ${categoryStats.qa.hours.toFixed(1)} hours (${
      totalHours > 0
        ? Math.round((categoryStats.qa.hours / totalHours) * 100)
        : 0
    }%)\n`;
    workCalSummary += `- Research: ${categoryStats.research.hours.toFixed(
      1
    )} hours (${
      totalHours > 0
        ? Math.round((categoryStats.research.hours / totalHours) * 100)
        : 0
    }%)\n`;
    workCalSummary += `- PRs: ${prCount} shipped, ${commitCount} commits\n`;
    if (oooDays > 0) {
      workCalSummary += `- OOO: ${oooDays} Day${oooDays === 1 ? "" : "s"}\n`;
    }

    notionUpdates["Work Cal Summary"] = workCalSummary;
    console.log(`🔄 Work Cal Summary: Created`);

    // Generate evaluation for Work Cal Summary
    if (notionUpdates["Work Cal Summary"]) {
      const existingCalSummary = notionUpdates["Work Cal Summary"];
      const prSummary = notionUpdates["Work PR Summary"] || "";
      const defaultWorkCalText = notionUpdates["Default Work Cal"] || "";

      const calEvaluations = generateWorkCalEvaluation(
        existingCalSummary,
        prSummary,
        defaultWorkCalText
      );

      if (calEvaluations.length > 0) {
        notionUpdates["Work Cal Summary"] =
          existingCalSummary +
          "\n===== EVALUATION =====\n" +
          calEvaluations.join("\n");
      }
    }

    // Update Notion
    console.log("📝 Updating Notion...");
    await updateNotionSummaries(pageId, notionUpdates);
    console.log(`✅ Successfully updated Week ${paddedWeek} recap!`);
    return { pageId, notionUpdates };
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error);
    return null;
  }
}

// Main execution
async function main() {
  const isInteractive = await checkInteractiveMode();

  if (isInteractive) {
    await runInteractiveMode();
  }

  console.log(
    `🚀 Starting work calendar summary for weeks: ${TARGET_WEEKS.join(", ")}`
  );
  console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...\n`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log(`\n🎉 Processing complete!`);
  process.exit(0);
}

// Run the script
main();
