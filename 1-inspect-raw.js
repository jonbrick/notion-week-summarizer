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
  const weekNumber = 25;

  console.log(`🔍 STEP 1: RAW GOOGLE CALENDAR JSON - Week ${weekNumber}`);
  console.log("=".repeat(60));

  try {
    const { startDate, endDate } = await getWeekDateRange(weekNumber);
    console.log(`📅 Week ${weekNumber}: ${startDate} to ${endDate}\n`);

    const rawEvents = await fetchCalendarEvents(
      process.env.WORK_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );

    console.log(
      `📥 Found ${rawEvents.length} raw events from Google Calendar API\n`
    );

    // Show first 3 events in detail, then just summaries
    console.log("🔍 DETAILED VIEW (First 3 events):");
    console.log("=".repeat(40));

    rawEvents.slice(0, 3).forEach((event, index) => {
      console.log(`\n--- EVENT ${index + 1} ---`);
      console.log(JSON.stringify(event, null, 2));
    });

    console.log("\n" + "=".repeat(40));
    console.log("📋 SUMMARY VIEW (All events):");
    console.log("=".repeat(40));

    rawEvents.forEach((event, index) => {
      const title = event.summary || "Untitled";
      const start = event.start?.dateTime || event.start?.date || "No start";
      const end = event.end?.dateTime || event.end?.date || "No end";
      const attendeeCount = event.attendees ? event.attendees.length : 0;
      const eventType = event.eventType || "default";
      const colorId = event.colorId || "default";

      console.log(`${(index + 1).toString().padStart(2)}. ${title}`);
      console.log(`    Start: ${start}`);
      console.log(`    End:   ${end}`);
      console.log(`    Attendees: ${attendeeCount}`);
      console.log(`    Type: ${eventType}`);
      console.log(`    Color: ${colorId}`);
      console.log("");
    });

    console.log(`📊 Total: ${rawEvents.length} events`);
    console.log(
      "\n🔄 Next step: Run 'node 2-extract-essentials.js' to see cleaned data"
    );
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

inspectRawData();
