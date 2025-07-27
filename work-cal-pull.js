const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
const { extractEventDuration } = require("./src/utils/time-utils");
const { processWorkProjectEvents } = require("./src/utils/pr-processor");
const { categorizeEventByColor } = require("./src/utils/color-mappings");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("💼 Work Calendar Summary Generator");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let includeWorkCal = true; // Default to work calendar
let includePRs = true; // Always include PRs

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n💼 Work Calendar Summary Generator");

  // Ask for weeks
  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );
  let targetWeeks = [TARGET_WEEKS[0]]; // default
  if (weekInput.trim()) {
    targetWeeks = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(
    `\n📊 Generating work calendar summary for Week${
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

// Google Auth for Work
function getGoogleAuth() {
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

// Fetch calendar events
async function fetchCalendarEvents(calendarId, startDate, endDate) {
  try {
    const auth = getGoogleAuth();
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

// Get my response status
function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

function createEventObject(rawEvent, category, categoryName) {
  return {
    id: rawEvent.id,
    summary: rawEvent.summary || "No title",
    start: rawEvent.start?.dateTime || rawEvent.start?.date,
    end: rawEvent.end?.dateTime || rawEvent.end?.date,
    duration: extractEventDuration(rawEvent.start, rawEvent.end),
    category: category,
    categoryName: categoryName,
    description: rawEvent.description || "",
    attendees: rawEvent.attendees || [],
    location: rawEvent.location || "",
    colorId: rawEvent.colorId || "default",
    eventType: rawEvent.eventType || "default",
    responseStatus: getMyResponseStatus(rawEvent.attendees),
  };
}

// Get week date range and return the Week Recap page ID for updates
// This function finds the Week Recap page, gets the date range from the related Week page,
// but returns the Week Recap page ID so we can update summary properties
async function getWeekDateRange(weekNumber) {
  try {
    // 1. Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      throw new Error(`Could not find Week ${weekNumber} Recap`);
    }

    // 2. Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      throw new Error(`Week ${weekNumber} has no week relation`);
    }

    const weekPageId = weekRelation[0].id;

    // 3. Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
    const dateRange = weekPage.properties["Date Range (SET)"].date;

    if (!dateRange) {
      throw new Error(`Week ${weekNumber} has no date range`);
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;

    return {
      startDate,
      endDate,
      weekPageId: targetWeekPage.id, // Return the Week Recap page ID (which has summary properties), not the Week page ID
    };
  } catch (error) {
    console.error(`❌ Error getting week date range:`, error.message);
    throw error;
  }
}

// Format events for Notion
function formatEventsForNotion(events, categoryKey) {
  if (!events || events.length === 0) {
    return "";
  }

  const categoryNames = {
    meetings: "Meetings",
    reviews: "Code Reviews",
    planning: "Planning",
    demos: "Demos/Presentations",
    hiring: "Hiring",
    urgent: "Urgent",
    important: "Important",
    normal: "Normal",
    good: "Good",
    info: "Info",
    creative: "Creative",
    work: "Work",
  };

  const categoryName = categoryNames[categoryKey] || categoryKey;
  const totalDuration = events.reduce((sum, event) => sum + event.duration, 0);
  const hours = Math.round((totalDuration / 60) * 10) / 10;

  let formatted = `${categoryName}: ${events.length} events (${hours}h)\n`;

  events.forEach((event) => {
    const eventHours = Math.round((event.duration / 60) * 10) / 10;
    formatted += `• ${event.summary} (${eventHours}h)\n`;
  });

  return formatted.trim();
}

// Build work summaries for each category
function buildWorkSummariesByCategory(workEvents, startDate, endDate) {
  if (!workEvents || workEvents.length === 0) {
    const emptySummary = "No work events this week";
    return {
      default: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
      design: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
      coding: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
      review: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
      qa: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
      rituals: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
      research: { summary: emptySummary, categoryStats: {}, totalHours: 0 },
    };
  }

  // Group events by category
  const eventsByCategory = {};
  workEvents.forEach((event) => {
    if (!eventsByCategory[event.category]) {
      eventsByCategory[event.category] = [];
    }
    eventsByCategory[event.category].push(event);
  });

  // Build summaries for each category
  const summaries = {};

  // Default Work Cal
  const defaultEvents = eventsByCategory["default"] || [];
  summaries.default = buildCategorySummary(
    defaultEvents,
    "Default Work",
    startDate,
    endDate
  );

  // Design Work Cal
  const designEvents = eventsByCategory["design"] || [];
  summaries.design = buildCategorySummary(
    designEvents,
    "Design Work",
    startDate,
    endDate
  );

  // Coding & Tickets Cal
  const codingEvents = eventsByCategory["coding"] || [];
  summaries.coding = buildCategorySummary(
    codingEvents,
    "Coding & Tickets",
    startDate,
    endDate
  );

  // Review, Feedback, Crit Cal
  const reviewEvents = eventsByCategory["review"] || [];
  summaries.review = buildCategorySummary(
    reviewEvents,
    "Review & Feedback",
    startDate,
    endDate
  );

  // Design & Dev QA Cal
  const qaEvents = eventsByCategory["qa"] || [];
  summaries.qa = buildCategorySummary(
    qaEvents,
    "Design & Dev QA",
    startDate,
    endDate
  );

  // Rituals Cal
  const ritualsEvents = eventsByCategory["rituals"] || [];
  summaries.rituals = buildCategorySummary(
    ritualsEvents,
    "Rituals",
    startDate,
    endDate
  );

  // Research Cal
  const researchEvents = eventsByCategory["research"] || [];
  summaries.research = buildCategorySummary(
    researchEvents,
    "Research",
    startDate,
    endDate
  );

  return summaries;
}

// Build summary for a specific category
function buildCategorySummary(events, categoryName, startDate, endDate) {
  if (!events || events.length === 0) {
    return {
      summary: `Total ${categoryName} time: 0 hours\nNo ${categoryName} events this week`,
      categoryStats: {},
      totalHours: 0,
    };
  }

  // Calculate stats
  const totalDuration = events.reduce((sum, event) => sum + event.duration, 0);
  const totalHours = Math.round((totalDuration / 60) * 10) / 10;

  const categoryStats = {
    [categoryName.toLowerCase().replace(/\s+/g, "_")]: {
      count: events.length,
      hours: totalHours,
      events: events,
    },
  };

  // Build summary text
  let summary = `Total ${categoryName} time: ${totalHours} hours\n`;

  // Add events
  events.forEach((event) => {
    const eventHours = Math.round((event.duration / 60) * 10) / 10;
    summary += `• ${event.summary} (${eventHours}h)\n`;
  });

  return {
    summary: summary.trim(),
    categoryStats,
    totalHours,
  };
}

// Generate work calendar evaluation
function generateWorkCalEvaluation(
  existingCalSummary,
  prSummary,
  categoryStats,
  workEvents,
  notionUpdates
) {
  let evaluation = "===== EVALUATION =====\n\n";

  // Check for OOO days
  const oooEvents = workEvents.filter(
    (event) =>
      event.summary.toLowerCase().includes("out of office") ||
      event.summary.toLowerCase().includes("ooo") ||
      event.summary.toLowerCase().includes("vacation")
  );

  if (oooEvents.length > 0) {
    const oooDays = oooEvents.length;
    evaluation += `🏝️ OOO: ${oooDays} Day${oooDays > 1 ? "s" : ""}\n`;
  }

  // Check meeting time
  const meetingHours = categoryStats.meetings?.hours || 0;
  const totalHours = Object.values(categoryStats).reduce(
    (sum, stats) => sum + stats.hours,
    0
  );
  const meetingPercentage =
    totalHours > 0 ? Math.round((meetingHours / totalHours) * 100) : 0;

  if (meetingHours > 0) {
    evaluation += `✅ MEETINGS: ${meetingHours} hours (${meetingPercentage}%)\n`;

    // Add meeting details
    const meetingEvents = categoryStats.meetings?.events || [];
    meetingEvents.forEach((event) => {
      const eventHours = Math.round((event.duration / 60) * 10) / 10;
      evaluation += `• ${event.summary} (${eventHours}h)\n`;
    });
  } else {
    evaluation += `❌ NO MEETINGS: 0 hours this week\n`;
  }

  // Check for PRs shipped
  if (prSummary && prSummary.length > 0) {
    evaluation += `✅ PRs SHIPPED: ${prSummary.length} PRs this week\n`;
    prSummary.forEach((pr) => {
      evaluation += `• ${pr.title}\n`;
    });
  } else {
    evaluation += `❌ NO PRs SHIPPED: 0 PRs this week\n`;
  }

  // Warning thresholds
  if (meetingPercentage > 20) {
    evaluation += `⚠️ MEETING TIME: ${meetingHours} hours (${meetingPercentage}%) [above 20% threshold]\n`;
  }

  if (totalHours < 20) {
    evaluation += `⚠️ LOW WORK TIME: ${
      Math.round(totalHours * 10) / 10
    } hours this week\n`;
  }

  return evaluation;
}

// Process a single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n📅 Processing Week ${weekNumber}...`);

    // Get week date range
    const { startDate, endDate, weekPageId } = await getWeekDateRange(
      weekNumber
    );
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // Fetch work calendar events
    console.log("📥 Fetching work calendar events...");
    const workCalendarId = process.env.WORK_CALENDAR_ID;
    if (!workCalendarId) {
      throw new Error("WORK_CALENDAR_ID not configured");
    }

    const workEvents = await fetchCalendarEvents(
      workCalendarId,
      startDate,
      endDate
    );
    console.log(`📊 Found ${workEvents.length} work events`);

    // Categorize work events
    const categorizedWorkEvents = workEvents.map((event) =>
      categorizeEventByColor(event, "work")
    );
    const workEventsOnly = categorizedWorkEvents.filter(
      (event) => event.category !== "ignored"
    );

    // Log categorization results
    const categoryCounts = {};
    workEventsOnly.forEach((event) => {
      categoryCounts[event.category] =
        (categoryCounts[event.category] || 0) + 1;
    });
    console.log(`📊 Event categorization:`, categoryCounts);

    // Build work summaries for each category
    console.log("📝 Building work summaries...");
    const summaries = buildWorkSummariesByCategory(
      workEventsOnly,
      startDate,
      endDate
    );

    // Process PRs if enabled
    let prSummary = [];
    if (includePRs) {
      console.log("🔍 Processing PRs...");
      try {
        prSummary = await processWorkProjectEvents(
          workEventsOnly,
          startDate,
          endDate
        );
        console.log(`📊 Found ${prSummary.length} PRs`);
      } catch (error) {
        console.error("❌ Error processing PRs:", error.message);
      }
    }

    // Generate evaluation
    console.log("📊 Generating evaluation...");
    const notionUpdates = [];
    const evaluation = generateWorkCalEvaluation(
      summaries.default.summary,
      prSummary,
      summaries.default.categoryStats,
      workEventsOnly,
      notionUpdates
    );

    // Combine summary and evaluation for main summary
    const fullSummary = summaries.default.summary + "\n\n" + evaluation;

    // Update Notion with all work calendar fields
    console.log("📝 Updating Notion...");
    await updateAllSummaries(notion, weekPageId, {
      "Work Cal Summary": fullSummary,
      "Default Work Cal": summaries.default.summary,
      "Design Work Cal": summaries.design.summary,
      "Coding & Tickets Cal": summaries.coding.summary,
      "Review, Feedback, Crit Cal": summaries.review.summary,
      "Design & Dev QA Cal": summaries.qa.summary,
      "Rituals Cal": summaries.rituals.summary,
      "Research Cal": summaries.research.summary,
    });

    console.log(`✅ Week ${weekNumber} work calendar summary completed!`);
    return {
      weekNumber,
      workEvents: workEventsOnly.length,
      totalHours: summaries.default.totalHours,
      prs: prSummary.length,
    };
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    throw error;
  }
}

// Process all weeks
async function processAllWeeks() {
  console.log(`\n🚀 Processing ${TARGET_WEEKS.length} week(s)...`);

  const results = [];
  for (const week of TARGET_WEEKS) {
    try {
      const result = await processWeek(week);
      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to process Week ${week}:`, error.message);
    }
  }

  return results;
}

// Main function
async function main() {
  try {
    const args = process.argv.slice(2);

    // Check for interactive mode
    const result = await checkInteractiveMode(
      args,
      [], // No categories for this script
      TARGET_WEEKS,
      [] // No active categories
    );

    if (result.isInteractive) {
      TARGET_WEEKS = await runInteractiveMode();
    } else {
      TARGET_WEEKS = result.targetWeeks;
    }

    console.log(`\n💼 Work Calendar Summary Generator`);
    console.log(`📅 Target weeks: ${TARGET_WEEKS.join(", ")}`);
    console.log(`📊 Include work calendar: ${includeWorkCal}`);
    console.log(`🔍 Include PRs: ${includePRs}`);

    const results = await processAllWeeks();

    console.log(`\n🎉 Work calendar processing completed!`);
    console.log(`📊 Summary:`);
    results.forEach((result) => {
      console.log(
        `  Week ${result.weekNumber}: ${result.workEvents} events, ${
          Math.round(result.totalHours * 10) / 10
        }h, ${result.prs} PRs`
      );
    });
  } catch (error) {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
