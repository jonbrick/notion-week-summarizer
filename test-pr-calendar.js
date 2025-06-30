// test-pr-format.js
// Test PR event formatting for Notion summary

const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
require("dotenv").config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Copy auth function from summarize-work-cal.js
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

// Copy week date range function
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

// Extract PR info from event
function extractPRInfo(event) {
  const description = event.description || "";

  // Extract PR number and title
  const prMatch = description.match(/🔀 PR: (.+?)(?:\n|$)/);
  const prTitle = prMatch ? prMatch[1] : "Unknown PR";

  // Extract PR number from title
  const prNumberMatch = prTitle.match(/#(\d+)/);
  const prNumber = prNumberMatch ? prNumberMatch[1] : null;

  // Extract commits section as raw text
  const commitsSection = description.split("📝 Commits:\n")[1];
  const commits = commitsSection ? commitsSection.trim() : "";

  // Get date from event
  const date = event.start.date || event.start.dateTime?.split("T")[0];

  return {
    prNumber,
    prTitle,
    commits,
    date,
    summary: event.summary,
  };
}

// Group events by PR
function groupEventsByPR(events) {
  const prGroups = {};

  events.forEach((event) => {
    const prInfo = extractPRInfo(event);
    const key = prInfo.prNumber || prInfo.prTitle;

    if (!prGroups[key]) {
      prGroups[key] = {
        prTitle: prInfo.prTitle,
        prNumber: prInfo.prNumber,
        commits: [],
        dates: [],
        totalCommits: 0,
      };
    }

    // Add commits text if not already present
    if (prInfo.commits && !prGroups[key].commits.includes(prInfo.commits)) {
      prGroups[key].commits.push(prInfo.commits);
    }
    prGroups[key].dates.push(prInfo.date);
    prGroups[key].totalCommits += 1; // Count events instead of individual commits
  });

  return prGroups;
}

// Format PR summary for Notion
function formatPRSummary(prGroups) {
  const prArray = Object.values(prGroups);

  if (prArray.length === 0) {
    return "No PR events this week.";
  }

  let output = "";

  prArray.forEach((pr, index) => {
    // Add spacing between PRs (except first one)
    if (index > 0) {
      output += "\n\n";
    }

    // PR Header
    output += `${pr.prTitle} - ${pr.totalCommits} event${
      pr.totalCommits !== 1 ? "s" : ""
    }`;

    // Add date range if PR spans multiple days
    const uniqueDates = [...new Set(pr.dates)].sort();
    if (uniqueDates.length > 1) {
      output += ` (${uniqueDates[0]} to ${
        uniqueDates[uniqueDates.length - 1]
      })`;
    }

    output += "\n------\n";

    // Commits - display raw text
    pr.commits.forEach((commitText) => {
      output += commitText;
    });
  });

  return output;
}

// Main test function
async function testPRFormat() {
  const weekNumber = 26;

  console.log(`📝 TESTING PR FORMAT - Week ${weekNumber}`);
  console.log("=".repeat(60));

  try {
    // Get week date range
    const { startDate, endDate } = await getWeekDateRange(weekNumber);
    console.log(`📅 Week ${weekNumber}: ${startDate} to ${endDate}\n`);

    // Fetch PR events
    const prEvents = await fetchCalendarEvents(
      process.env.WORK_PR_DATA_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );

    console.log(`📥 Found ${prEvents.length} PR events\n`);

    // Group by PR
    const prGroups = groupEventsByPR(prEvents);
    console.log(`📊 Grouped into ${Object.keys(prGroups).length} unique PRs\n`);

    // Format for Notion
    const formattedSummary = formatPRSummary(prGroups);

    console.log("📋 FORMATTED OUTPUT FOR NOTION:");
    console.log("=".repeat(40));
    console.log(formattedSummary);
    console.log("=".repeat(40));

    // Show what would be sent to Notion
    console.log("\n🔄 Would update Notion with:");
    console.log("Column: Work PR Summary");
    console.log(`Content length: ${formattedSummary.length} characters`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// Run the test
testPRFormat();
