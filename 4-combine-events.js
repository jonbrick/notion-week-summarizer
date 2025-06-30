// 4-combine-events.js
// Group similar events and combine their durations

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
  if (event.responseStatus === "declined") return false;
  if (event.isAllDay) return false;
  if (!event.durationMinutes || event.durationMinutes <= 0) return false;
  if (event.durationMinutes < 15) return false;
  if (
    event.eventType === "workingLocation" ||
    event.eventType === "outOfOffice"
  )
    return false;

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

  return !noiseKeywords.some((keyword) => title.includes(keyword));
}

function createGroupingKey(event) {
  // Normalize title for grouping
  // This is where we can adjust grouping logic
  return event.title.toLowerCase().trim();
}

function extractAttendeeNames(attendees) {
  return attendees
    .filter((attendee) => !attendee.self)
    .map((attendee) => {
      // Extract first name from email or display name
      if (attendee.displayName && !attendee.displayName.includes("@")) {
        return attendee.displayName;
      }
      if (attendee.email) {
        const namePart = attendee.email.split("@")[0];
        const firstName = namePart.split(".")[0];
        return firstName.charAt(0).toUpperCase() + firstName.slice(1);
      }
      return "Unknown";
    })
    .filter((name) => name !== "Unknown");
}

function combineEvents(events) {
  const grouped = {};

  console.log("🔄 GROUPING LOGIC:");
  console.log("=" * 30);

  events.forEach((event) => {
    const groupKey = createGroupingKey(event);

    if (grouped[groupKey]) {
      // Add to existing group
      grouped[groupKey].durationMinutes += event.durationMinutes;
      grouped[groupKey].sessionCount += 1;
      grouped[groupKey].events.push(event);

      console.log(
        `📦 GROUPED: "${event.title}" → "${groupKey}" (${grouped[groupKey].sessionCount} sessions)`
      );
    } else {
      // Create new group
      grouped[groupKey] = {
        ...event,
        sessionCount: 1,
        events: [event],
        groupKey: groupKey,
      };

      console.log(`🆕 NEW GROUP: "${event.title}" → "${groupKey}"`);
    }
  });

  return Object.values(grouped);
}

function formatCombinedEvent(combinedEvent) {
  const isMeeting = combinedEvent.attendeeCount > 0;
  const attendeeNames = extractAttendeeNames(combinedEvent.attendees);

  let formatted = "";

  if (isMeeting && attendeeNames.length > 0) {
    // Meeting with people
    if (attendeeNames.length > 5) {
      formatted = `${combinedEvent.title} (team meeting with ${attendeeNames.length} people)`;
    } else {
      formatted = `${combinedEvent.title} with ${attendeeNames.join(", ")}`;
    }
  } else {
    // Solo work or meeting without clear attendees
    formatted = combinedEvent.title;
  }

  // Add duration
  const durationFormatted = formatDuration(combinedEvent.durationMinutes);

  if (combinedEvent.sessionCount > 1) {
    formatted += ` (${combinedEvent.sessionCount} sessions, ${durationFormatted} total)`;
  } else {
    formatted += ` (${durationFormatted})`;
  }

  return formatted;
}

async function combineEventsFromWeek() {
  const weekNumber = 25;

  console.log(`🔗 STEP 4: COMBINE EVENTS - Week ${weekNumber}`);
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
    const filteredEvents = essentialEvents.filter(shouldIncludeEvent);

    console.log(`📥 Combining ${filteredEvents.length} filtered events...\n`);

    const combinedEvents = combineEvents(filteredEvents);

    console.log("\n" + "=" * 50);
    console.log("📦 COMBINED RESULTS:");
    console.log("=" * 50);

    const formattedEvents = combinedEvents.map(formatCombinedEvent);

    formattedEvents.forEach((formatted, index) => {
      console.log(`${index + 1}. ${formatted}`);
    });

    console.log(`\n📊 COMBINATION SUMMARY:`);
    console.log(`   Filtered events: ${filteredEvents.length}`);
    console.log(`   Combined groups: ${combinedEvents.length}`);
    console.log(
      `   Reduction: ${
        filteredEvents.length - combinedEvents.length
      } events combined`
    );

    console.log("\n🎯 FINAL AI-READY OUTPUT:");
    console.log("=" * 30);
    console.log(JSON.stringify(formattedEvents, null, 2));

    console.log(
      "\n✅ Pipeline complete! This is what goes to AI for final formatting."
    );
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

combineEventsFromWeek();
