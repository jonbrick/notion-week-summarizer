// color-experiment.js
// Group events by color category and show clean arrays

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

function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

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

  // 3. Color mapping for default eventType events
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

async function runColorExperiment() {
  const weekNumber = 25;

  console.log(`🎨 COLOR CATEGORY EXPERIMENT - Week ${weekNumber}`);
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

    console.log(`📥 Processing ${rawEvents.length} raw events...\n`);

    // Categorize all events by color
    const categorizedEvents = rawEvents.map(categorizeEventByColor);

    // Group by category
    const categories = {
      default: [], // Default blue events
      coding: [], // Purple - Coding & Tickets
      design: [], // Green - Design Work
      review: [], // Yellow - Review, Feedback, Crit
      qa: [], // Red - Design & Dev QA
      rituals: [], // ColorId 9 - Rituals
      unknown: [], // Unmapped colorIds
      personal: [], // Gray - Personal
      ignored: [], // System events, declined meetings
    };

    categorizedEvents.forEach((event) => {
      categories[event.category].push(event);
    });

    // Display results - Work categories first
    console.log("📊 WORK CATEGORIES:");
    console.log("=".repeat(40));

    const workCategories = [
      "default",
      "coding",
      "design",
      "review",
      "qa",
      "rituals",
      "unknown",
    ];
    workCategories.forEach((categoryName) => {
      const events = categories[categoryName];
      if (events.length === 0) return;

      console.log(
        `\n🎯 ${categoryName.toUpperCase()} (${events.length} events):`
      );
      console.log("-".repeat(30));

      events.forEach((event, index) => {
        console.log(
          `${index + 1}. "${event.title}" (${event.durationFormatted})`
        );
      });

      // Show as clean array
      console.log(`\n📋 Clean array:`);
      const eventTitles = events.map((e) => `"${e.title}"`);
      console.log(`[${eventTitles.join(", ")}]`);

      // Show total time
      const totalMinutes = events
        .filter((e) => e.duration)
        .reduce((sum, e) => sum + e.duration, 0);
      if (totalMinutes > 0) {
        console.log(`⏱️  Total time: ${formatDuration(totalMinutes)}`);
      }
    });

    // Display ignored categories
    console.log("\n" + "=".repeat(40));
    console.log("❌ IGNORED CATEGORIES:");
    console.log("=".repeat(40));

    const ignoredCategories = ["personal", "ignored"];
    ignoredCategories.forEach((categoryName) => {
      const events = categories[categoryName];
      if (events.length === 0) return;

      console.log(
        `\n🚫 ${categoryName.toUpperCase()} (${events.length} events):`
      );
      console.log("-".repeat(30));

      events.forEach((event, index) => {
        console.log(
          `${index + 1}. "${event.title}" (${event.durationFormatted}) - ${
            event.categoryName
          }`
        );
      });

      // Show as clean array
      console.log(`\n📋 Clean array:`);
      const eventTitles = events.map((e) => `"${e.title}"`);
      console.log(`[${eventTitles.join(", ")}]`);

      // Show total time
      const totalMinutes = events
        .filter((e) => e.duration)
        .reduce((sum, e) => sum + e.duration, 0);
      if (totalMinutes > 0) {
        console.log(`⏱️  Total time: ${formatDuration(totalMinutes)}`);
      }
    });

    // Summary
    console.log("\n" + "=".repeat(60));
    console.log("📈 SUMMARY:");

    // Work categories with hours
    workCategories.forEach((categoryName) => {
      const events = categories[categoryName];
      if (events.length > 0) {
        const totalMinutes = events
          .filter((e) => e.duration)
          .reduce((sum, e) => sum + e.duration, 0);
        const timeText =
          totalMinutes > 0 ? ` (${formatDuration(totalMinutes)})` : "";
        console.log(`   ${categoryName}: ${events.length} events${timeText}`);
      }
    });

    // Ignored section
    console.log("\nIGNORED:");
    ignoredCategories.forEach((categoryName) => {
      const events = categories[categoryName];
      if (events.length > 0) {
        const totalMinutes = events
          .filter((e) => e.duration)
          .reduce((sum, e) => sum + e.duration, 0);
        const timeText =
          totalMinutes > 0 ? ` (${formatDuration(totalMinutes)})` : "";
        console.log(`   ${categoryName}: ${events.length} events${timeText}`);
      }
    });
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }
}

runColorExperiment();
