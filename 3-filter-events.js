// 3-filter-events.js
// Remove events we don't want to summarize

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

function extractEssentials(rawEvent) {
  const isAllDay =
    rawEvent.start && rawEvent.start.date && !rawEvent.start.dateTime;

  let duration = null;
  let durationFormatted = "all day";

  if (!isAllDay) {
    duration = calculateDuration(
      rawEvent.start?.dateTime,
      rawEvent.end?.dateTime
    );
    durationFormatted = duration ? formatDuration(duration) : "unknown";
  }

  return {
    id: rawEvent.id,
    title: rawEvent.summary || "Untitled",
    description: rawEvent.description || "",
    startTime: rawEvent.start?.dateTime || rawEvent.start?.date,
    endTime: rawEvent.end?.dateTime || rawEvent.end?.date,
    isAllDay: isAllDay,
    durationMinutes: duration,
    durationFormatted: durationFormatted,
    attendees: rawEvent.attendees || [],
    attendeeCount: (rawEvent.attendees || []).length,
    creator: rawEvent.creator,
    organizer: rawEvent.organizer,
    eventType: rawEvent.eventType || "default",
    status: rawEvent.status,
    responseStatus: getMyResponseStatus(rawEvent.attendees),
  };
}

function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

function shouldIncludeEvent(event) {
  const reasons = [];

  // Filter out declined events
  if (event.responseStatus === "declined") {
    reasons.push("DECLINED - I declined this meeting");
    return { include: false, reasons };
  }

  // Filter out all-day events (working location, etc.)
  if (event.isAllDay) {
    reasons.push("ALL DAY - Working location or similar");
    return { include: false, reasons };
  }

  // Filter out events without valid duration
  if (!event.durationMinutes || event.durationMinutes <= 0) {
    reasons.push("NO DURATION - Could not calculate time");
    return { include: false, reasons };
  }

  // Filter out very short events (less than 15 minutes)
  if (event.durationMinutes < 15) {
    reasons.push(`TOO SHORT - Only ${event.durationMinutes} minutes`);
    return { include: false, reasons };
  }

  // Filter out specific event types
  if (
    event.eventType === "workingLocation" ||
    event.eventType === "outOfOffice"
  ) {
    reasons.push(`EVENT TYPE - ${event.eventType}`);
    return { include: false, reasons };
  }

  // Filter out lunch and other noise by title
  const title = event.title.toLowerCase();
  const noiseKeywords = [
    "lunch",
    "can be moved",
    "home",
    "office",
    "remote",
    "wfh",
    "work from home",
    "out of office",
    "ooo",
    "vacation",
    "sick",
    "personal day",
    "holiday",
  ];

  const matchedKeyword = noiseKeywords.find((keyword) =>
    title.includes(keyword)
  );
  if (matchedKeyword) {
    reasons.push(`NOISE KEYWORD - Contains "${matchedKeyword}"`);
    return { include: false, reasons };
  }

  reasons.push("✅ PASSED ALL FILTERS");
  return { include: true, reasons };
}

async function filterEventsFromWeek() {
  const weekNumber = 25;

  console.log(`🔍 STEP 3: FILTER EVENTS - Week ${weekNumber}`);
  console.log("=" * 60);

  try {
    const { startDate, endDate } = await getWeekDateRange(weekNumber);
    console.log(`📅 Week ${weekNumber}: ${startDate} to ${endDate}\n`);

    const rawEvents = await fetchCalendarEvents(
      process.env.WORK_CALENDAR_ID,
      "work",
      startDate,
      endDate
    );

    const essentialEvents = rawEvents.map(extractEssentials);

    console.log(`📥 Filtering ${essentialEvents.length} events...\n`);

    const filterResults = essentialEvents.map((event) => ({
      event,
      result: shouldIncludeEvent(event),
    }));

    const includedEvents = filterResults
      .filter((r) => r.result.include)
      .map((r) => r.event);
    const excludedEvents = filterResults.filter((r) => !r.result.include);

    console.log("✅ EVENTS TO INCLUDE:");
    console.log("=" * 30);
    includedEvents.forEach((event, index) => {
      console.log(
        `${index + 1}. "${event.title}" (${event.durationFormatted})`
      );
    });

    console.log("\n❌ EVENTS FILTERED OUT:");
    console.log("=" * 30);
    excludedEvents.forEach((item, index) => {
      console.log(`${index + 1}. "${item.event.title}"`);
      console.log(`   Reason: ${item.result.reasons[0]}`);
      console.log("");
    });

    console.log(`📊 FILTER SUMMARY:`);
    console.log(`   Started with: ${essentialEvents.length} events`);
    console.log(`   ✅ Included: ${includedEvents.length} events`);
    console.log(`   ❌ Filtered: ${excludedEvents.length} events`);
    console.log(
      `   📈 Kept: ${Math.round(
        (includedEvents.length / essentialEvents.length) * 100
      )}%`
    );

    console.log(
      "\n🔄 Next step: Run 'node 4-combine-events.js' to see grouping"
    );
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

filterEventsFromWeek();
