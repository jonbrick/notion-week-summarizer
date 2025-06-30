// test-real-data.js
// Test the pipeline with actual calendar data from a specific week

const { processCalendarEvents } = require("./src/utils/event-processor");
const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
require("dotenv").config();

// Initialize Notion client to get week date range
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Google Calendar authentication (copied from your summarize-cal.js)
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
  } else {
    const oauth2Client = new google.auth.OAuth2(
      process.env.PERSONAL_GOOGLE_CLIENT_ID,
      process.env.PERSONAL_GOOGLE_CLIENT_SECRET,
      "urn:ietf:wg:oauth:2.0:oob"
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.PERSONAL_GOOGLE_REFRESH_TOKEN,
    });
    return oauth2Client;
  }
}

// Fetch calendar events (copied from your summarize-cal.js)
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

    const events = response.data.items || [];

    // Filter out events where user didn't RSVP or declined
    const filteredEvents = events.filter((event) => {
      if (!event.attendees || event.attendees.length === 0) {
        return true;
      }

      const userAttendee = event.attendees.find(
        (attendee) => attendee.email === process.env.GOOGLE_CALENDAR_EMAIL
      );

      if (!userAttendee) {
        return true;
      }

      const responseStatus = userAttendee.responseStatus;
      return responseStatus === "accepted" || responseStatus === "tentative";
    });

    return filteredEvents;
  } catch (error) {
    console.error(
      `❌ Error fetching calendar events from ${calendarId}:`,
      error.message
    );
    return [];
  }
}

// Get week date range from Notion
async function getWeekDateRange(weekNumber) {
  const recapPages = await notion.databases.query({
    database_id: process.env.RECAP_DATABASE_ID,
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
            };
          }
        }
      }
    }
  }

  throw new Error(`Could not find date range for Week ${weekNumber}`);
}

// Main test function
async function testRealData() {
  const weekNumber = process.argv[2] || 25; // Default to week 25, or pass as argument

  console.log(`🧪 Testing Pipeline with Real Data - Week ${weekNumber}\n`);

  try {
    // 1. Get week date range
    console.log("📅 Getting week date range...");
    const { startDate, endDate } = await getWeekDateRange(weekNumber);
    console.log(`📅 Week ${weekNumber}: ${startDate} to ${endDate}\n`);

    // 2. Fetch events from work calendar
    console.log("📥 Fetching work calendar events...");
    const workEvents = await fetchCalendarEvents(
      process.env.WORK_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );
    console.log(`📥 Found ${workEvents.length} work events\n`);

    // 3. Process events through pipeline
    console.log("🔄 Processing through pipeline...");
    const processedEvents = processCalendarEvents(workEvents);

    console.log("\n" + "=".repeat(60));
    console.log("🎯 FINAL CLEAN OUTPUT FOR AI:");
    console.log("=".repeat(60));
    processedEvents.forEach((event, index) => {
      console.log(`${index + 1}. ${event}`);
    });
    console.log("\n📊 Summary:");
    console.log(
      `   • ${workEvents.length} raw events → ${processedEvents.length} clean events`
    );
    console.log(`   • Ready for AI to convert to comma-separated format`);
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.log("\n💡 Usage: node test-real-data.js [WEEK_NUMBER]");
    console.log("   Example: node test-real-data.js 25");
  }
}

// Run the test
testRealData();
