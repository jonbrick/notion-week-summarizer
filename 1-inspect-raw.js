// 1-inspect-raw.js
// Shows raw Google Calendar JSON data for Week 25

const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
require("dotenv").config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

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

async function inspectRawData() {
  const weekNumber = 26;

  console.log(`🔍 STEP 1: RAW GOOGLE CALENDAR JSON - Week ${weekNumber}`);
  console.log("=".repeat(60));

  try {
    const { startDate, endDate } = await getWeekDateRange(weekNumber);
    console.log(`📅 Week ${weekNumber}: ${startDate} to ${endDate}\n`);

    // Fetch both work and PR calendar events
    console.log("📥 Fetching WORK CALENDAR events...");
    const workEvents = await fetchCalendarEvents(
      process.env.WORK_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );

    console.log("📥 Fetching WORK PR DATA CALENDAR events...");
    const prEvents = await fetchCalendarEvents(
      process.env.WORK_PR_DATA_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );

    console.log(
      `\n📊 Found ${workEvents.length} work events and ${prEvents.length} PR events\n`
    );

    // Show PR events first since those are what we need to understand
    console.log("🔍 PR EVENTS DETAILED VIEW:");
    console.log("=".repeat(40));

    prEvents.forEach((event, index) => {
      console.log(`\n--- PR EVENT ${index + 1} ---`);
      console.log(JSON.stringify(event, null, 2));
    });

    console.log("\n" + "=".repeat(40));
    console.log("📋 PR EVENTS SUMMARY:");
    console.log("=".repeat(40));

    prEvents.forEach((event, index) => {
      const title = event.summary || "Untitled";
      const description = event.description || "No description";
      const start = event.start?.dateTime || event.start?.date || "No start";

      console.log(`${(index + 1).toString().padStart(2)}. ${title}`);
      console.log(
        `    Description: ${description.substring(0, 200)}${
          description.length > 200 ? "..." : ""
        }`
      );
      console.log(`    Start: ${start}`);
      console.log("");
    });

    console.log(`📊 Total PR events: ${prEvents.length}`);
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

inspectRawData();
