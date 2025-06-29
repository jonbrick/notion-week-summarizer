const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const readline = require("readline");
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

  // 3. OOO filter - events with "OOO" in title go to ignored
  const eventTitle = rawEvent.summary || "";
  if (eventTitle.includes("OOO")) {
    return createEventObject(rawEvent, "ignored", "Out of Office");
  }

  // 4. Color mapping for default eventType events
  const colorMapping = {
    8: { category: "personal", name: "Personal Event" }, // Gray
    3: { category: "coding", name: "Coding & Tickets" }, // Purple
    2: { category: "design", name: "Design Work" }, // Green
    5: { category: "review", name: "Review, Feedback, Crit" }, // Yellow
    11: { category: "qa", name: "Design & Dev QA" }, // Red
    9: { category: "rituals", name: "Rituals" }, // New color
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
  default: "Default Work",
  coding: "Coding & Tickets",
  design: "Design Work",
  review: "Review, Feedback, Crit Calendar",
  qa: "Design & Dev QA",
  rituals: "Rituals",
  unknown: "Default Work",
};

// Category names for empty messages
const CATEGORY_DISPLAY_NAMES = {
  default: "default",
  coding: "coding",
  design: "design",
  review: "review, feedback, crit",
  qa: "QA",
  rituals: "rituals",
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

// Interactive mode
async function runInteractiveMode() {
  console.log("\n🎯 Work Calendar Summary Generator");
  console.log(`📌 Default: Week ${DEFAULT_TARGET_WEEKS.join(",")}\n`);

  // Ask for weeks
  const weeksInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 1,2,3): "
  );
  if (weeksInput.trim()) {
    TARGET_WEEKS = weeksInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  // Show calendar options
  console.log("\n? Which calendar to process?");
  CALENDAR_OPTIONS.forEach((cal) => {
    console.log(`  ${cal.id} - ${cal.name}`);
  });

  const calendarInput = await askQuestion(
    "\n? Enter number (or press enter for work): "
  );

  if (calendarInput.trim()) {
    const calendarNumber = parseInt(calendarInput.trim());
    const selectedCal = CALENDAR_OPTIONS.find(
      (cal) => cal.id === calendarNumber
    );
    if (selectedCal) {
      SELECTED_CALENDAR = selectedCal;
    }
  }

  // Show confirmation
  console.log(`\n📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);
  console.log(`📅 Using ${SELECTED_CALENDAR.name}`);

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

  const totalMinutes = events
    .filter((e) => e.duration)
    .reduce((sum, e) => sum + e.duration, 0);

  const timeText = totalMinutes > 0 ? `, ${formatDuration(totalMinutes)}` : "";

  let output = `${categoryName.toUpperCase()} (${
    events.length
  } events${timeText}):\n`;
  output += "------\n";

  events.forEach((event) => {
    output += `• ${event.title} (${event.durationFormatted})\n`;
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

    // Fetch calendar events
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
      personal: [], // For logging only
      ignored: [], // For logging only
    };

    categorizedEvents.forEach((event) => {
      // Merge unknown into default
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

    // Prepare Notion updates for work categories only
    const notionUpdates = {};

    // Process work categories (excluding unknown since it merges with default)
    const workCategories = [
      "default",
      "coding",
      "design",
      "review",
      "qa",
      "rituals",
    ];

    workCategories.forEach((categoryKey) => {
      const columnName = WORK_CATEGORY_MAPPING[categoryKey];
      const events = categories[categoryKey];
      const formattedContent = formatEventsForNotion(events, categoryKey);

      notionUpdates[columnName] = formattedContent;

      // Log what we're updating
      const totalMinutes = events
        .filter((e) => e.duration)
        .reduce((sum, e) => sum + e.duration, 0);

      const timeText =
        totalMinutes > 0 ? ` (${formatDuration(totalMinutes)})` : "";
      console.log(`🔄 ${columnName}: ${events.length} events${timeText}`);
    });

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
    const result = await processWeek(weekNumber);
    if (result) {
      console.log("📝 (Notion update function coming next...)");
    }
  }

  console.log(`\n🎉 Processing complete!`);
}

// Run the script
main();
