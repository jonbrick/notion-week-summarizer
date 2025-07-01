const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;

console.log("🎨 Work Calendar Color ID Extractor");

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

async function main() {
  try {
    console.log("📅 Fetching Week 26 date range...");
    const { startDate, endDate } = await getWeekDateRange(26);
    console.log(`📅 Week 26: ${startDate} to ${endDate}`);

    console.log("🗓️ Fetching work calendar events...");
    const events = await fetchCalendarEvents(
      process.env.WORK_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );

    console.log(`📊 Found ${events.length} total events`);

    // Get first 10 events
    const first10Events = events.slice(0, 10);

    console.log("\n🎨 Color IDs for first 10 events:");
    console.log("=".repeat(50));

    first10Events.forEach((event, index) => {
      const colorId = event.colorId || "default";
      const title = event.summary || "Untitled";
      const startTime = event.start?.dateTime || event.start?.date;

      console.log(`${index + 1}. "${title}"`);
      console.log(`   Color ID: ${colorId}`);
      console.log(`   Start: ${startTime}`);
      console.log("");
    });

    // Summary of color IDs found
    const colorIds = first10Events.map((e) => e.colorId || "default");
    const uniqueColorIds = [...new Set(colorIds)];

    console.log("📋 Summary of Color IDs found:");
    console.log("=".repeat(30));
    uniqueColorIds.forEach((colorId) => {
      const count = colorIds.filter((id) => id === colorId).length;
      console.log(`Color ID ${colorId}: ${count} event(s)`);
    });
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
