const { google } = require("googleapis");
const { getWeekDateRange } = require("./pull-personal-tasks");
require("dotenv").config();

// Habit Calendar Configuration - updated to include Coding
const HABIT_CALENDARS = [
  {
    envVar: "WAKE_UP_EARLY_CALENDAR_ID",
    notionField: "Early Wakeup",
    displayName: "Early Wakeup",
  },
  {
    envVar: "SLEEP_IN_CALENDAR_ID",
    notionField: "Sleep In",
    displayName: "Sleep In",
  },
  {
    envVar: "WORKOUT_CALENDAR_ID",
    notionField: "Workout",
    displayName: "Workout",
  },
  {
    envVar: "READ_CALENDAR_ID",
    notionField: "Read",
    displayName: "Read",
  },
  {
    envVar: "VIDEO_GAMES_CALENDAR_ID",
    notionField: "Video Games",
    displayName: "Video Games",
  },
  {
    envVar: "CODING_CALENDAR_ID",
    notionField: "Coding",
    displayName: "Coding",
  },
  {
    envVar: "SOBER_DAYS_CALENDAR_ID",
    notionField: "Sober Days",
    displayName: "Sober Days",
  },
  {
    envVar: "DRINKING_DAYS_CALENDAR_ID",
    notionField: "Drinking Days",
    displayName: "Drinking Days",
  },
  {
    envVar: "BODY_WEIGHT_CALENDAR_ID",
    notionField: "Body Weight",
    displayName: "Body Weight",
  },
];

/**
 * Google Calendar authentication
 * Copied from existing script
 */
function getGoogleAuth() {
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

/**
 * Fetch calendar events
 * Copied from existing script
 */
async function fetchCalendarEvents(calendarId, startDate, endDate) {
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
}

/**
 * Pull Personal Habit Calendars for a given week
 * Adapted from existing personal-habits-pull.js core logic
 * @param {number} weekNumber - Week number (1-52)
 * @returns {Object} - Object with habit counts as numbers
 */
async function pullPersonalHabits(weekNumber) {
  try {
    console.log(`📥 Fetching Personal Habits for Week ${weekNumber}...`);

    const { startDate, endDate } = await getWeekDateRange(weekNumber);

    // Check for missing calendar IDs
    const missingIds = [];
    HABIT_CALENDARS.forEach((calendar) => {
      if (!process.env[calendar.envVar]) {
        missingIds.push(calendar.envVar);
      }
    });

    if (missingIds.length > 0) {
      console.log(
        `   ⚠️  Missing habit calendar IDs: ${missingIds.join(", ")}`
      );
    }

    const habitCounts = {};
    const configuredCalendars = HABIT_CALENDARS.filter(
      (calendar) => process.env[calendar.envVar]
    );

    console.log(
      `   Processing ${configuredCalendars.length} habit calendars...`
    );

    // Process each habit calendar - core logic from existing script
    for (let i = 0; i < configuredCalendars.length; i++) {
      const calendar = configuredCalendars[i];

      try {
        const calendarId = process.env[calendar.envVar];
        if (calendarId) {
          const events = await fetchCalendarEvents(
            calendarId,
            startDate,
            endDate
          );

          // Count unique days
          const uniqueDays = new Set();
          events.forEach((event) => {
            let eventDate;

            // For sleep-related habits, use END time to determine the day
            if (
              calendar.envVar === "SLEEP_IN_CALENDAR_ID" ||
              calendar.envVar === "WAKE_UP_EARLY_CALENDAR_ID"
            ) {
              if (event.end && event.end.date) {
                // All-day event - use end date
                eventDate = event.end.date;
              } else if (event.end && event.end.dateTime) {
                // Timed event - extract date from END time (when you woke up)
                eventDate = event.end.dateTime.split("T")[0];
              } else if (event.start && event.start.date) {
                // Fallback to start date if no end time
                eventDate = event.start.date;
              } else if (event.start && event.start.dateTime) {
                // Fallback to start date if no end time
                eventDate = event.start.dateTime.split("T")[0];
              }
            } else {
              // For other habits (including Coding), use START time
              if (event.start && event.start.date) {
                eventDate = event.start.date;
              } else if (event.start && event.start.dateTime) {
                eventDate = event.start.dateTime.split("T")[0];
              }
            }

            if (eventDate) {
              uniqueDays.add(eventDate);
            }
          });

          const habitCount = uniqueDays.size;
          console.log(
            `   ${calendar.displayName}: ${habitCount} days (${events.length} events)`
          );
          habitCounts[calendar.notionField] = habitCount;
        }
      } catch (error) {
        console.error(
          `   ❌ Failed to fetch ${calendar.displayName} calendar: ${error.message}`
        );
        // Set to 0 instead of failing entire process
        habitCounts[calendar.notionField] = 0;
      }
    }

    return habitCounts;
  } catch (error) {
    console.error(
      `❌ Error pulling personal habits for Week ${weekNumber}:`,
      error.message
    );
    // Return empty object on error
    return {};
  }
}

module.exports = {
  pullPersonalHabits,
};
