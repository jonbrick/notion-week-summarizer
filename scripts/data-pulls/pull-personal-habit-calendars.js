function formatHabits(habitsDetails) {
  if (!habitsDetails || !habitsDetails.trim()) {
    return "";
  }

  const lines = habitsDetails.split("\n").filter((line) => line.trim());
  const formattedLines = [];

  for (const line of lines) {
    let status = "";
    let emoji = "";
    let habitDescription = "";
    let originalValues = "";

    // Clean up the line - remove extra spaces and invisible characters
    let cleanedLine = line.trim().replace(/\s+/g, " ");

    // 1. Early wake ups vs sleeping in
    // ✅ 🛌 Good sleeping habits (X early wake ups, Y days sleeping in)
    // ⚠️ 🛌 Not great sleeping habits (X early wake ups, Y days sleeping in)
    // ❌ 🛌 Bad sleeping habits (X early wake ups, Y days sleeping in)
    if (line.includes("early wake ups") && line.includes("sleeping in")) {
      const wakeUpMatch = line.match(/(\d+)\s*early wake ups/);
      const sleepInMatch = line.match(/(\d+)\s*days sleeping in/);

      if (wakeUpMatch) {
        const wakeUps = parseInt(wakeUpMatch[1]);
        emoji = "🛌";
        originalValues = cleanedLine;

        if (wakeUps >= 4) {
          status = "✅";
          habitDescription = "Good sleeping habits";
        } else if (wakeUps >= 2) {
          status = "⚠️";
          habitDescription = "Not great sleeping habits";
        } else {
          status = "❌";
          habitDescription = "Bad sleeping habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 2. Sober vs drinking days
    // ✅ 🍻 Good drinking habits (X days sober, Y days drinking)
    // ⚠️ 🍻 Not great drinking habits (X days sober, Y days drinking)
    // ❌ 🍻 Bad drinking habits (X days sober, Y days drinking)
    else if (line.includes("sober") && line.includes("drinking")) {
      const soberMatch = line.match(/(\d+)\s*days sober/);

      if (soberMatch) {
        const soberDays = parseInt(soberMatch[1]);
        emoji = "🍻";
        originalValues = cleanedLine;

        if (soberDays >= 4) {
          status = "✅";
          habitDescription = "Good drinking habits";
        } else if (soberDays >= 2) {
          status = "⚠️";
          habitDescription = "Not great drinking habits";
        } else {
          status = "❌";
          habitDescription = "Bad drinking habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 3. Workouts (standalone)
    // ✅ 💪 Good workout habits (X workouts)
    // ⚠️ 💪 Not great workout habits (X workouts)
    // ❌ 💪 Bad workout habits (X workouts)
    else if (line.includes("workouts")) {
      const workoutMatch = line.match(/(\d+)\s*workouts/);

      if (workoutMatch) {
        const workouts = parseInt(workoutMatch[1]);
        emoji = "💪";
        originalValues = cleanedLine;

        if (workouts >= 3) {
          status = "✅";
          habitDescription = "Good workout habits";
        } else if (workouts >= 1) {
          status = "⚠️";
          habitDescription = "Not great workout habits";
        } else {
          status = "❌";
          habitDescription = "Bad workout habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 4. Reading, gaming, and coding (updated to handle all three)
    // ✅ 📖 Good hobby habits (X days reading, Y days gaming, Z days coding)
    // ⚠️ 📖 Not great hobby habits (X days reading, Y days gaming, Z days coding)
    // ❌ 📖 Bad hobby habits (X days reading, Y days gaming, Z days coding)
    else if (
      line.includes("reading") &&
      line.includes("gaming") &&
      line.includes("coding")
    ) {
      const readingMatch = line.match(/(\d+)\s*days reading/);
      const gamingMatch = line.match(/(\d+)\s*days gaming/);
      const codingMatch = line.match(/(\d+)\s*days coding/);

      if (readingMatch && gamingMatch && codingMatch) {
        const readingDays = parseInt(readingMatch[1]);
        const gamingDays = parseInt(gamingMatch[1]);
        const codingDays = parseInt(codingMatch[1]);

        emoji = "📖";
        originalValues = cleanedLine;

        // Good: coding >= 3 OR (reading + coding) > gaming
        // Not great: coding >= 1 OR reading >= gaming
        // Bad: otherwise
        if (codingDays >= 3 || readingDays + codingDays > gamingDays) {
          status = "✅";
          habitDescription = "Good hobby habits";
        } else if (codingDays >= 1 || readingDays >= gamingDays) {
          status = "⚠️";
          habitDescription = "Not great hobby habits";
        } else {
          status = "❌";
          habitDescription = "Bad hobby habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }
    // Fallback for old format (reading and gaming only, without coding)
    else if (line.includes("reading") && line.includes("gaming")) {
      const readingMatch = line.match(/(\d+)\s*days reading/);
      const gamingMatch = line.match(/(\d+)\s*days gaming/);

      if (readingMatch && gamingMatch) {
        const readingDays = parseInt(readingMatch[1]);
        const gamingDays = parseInt(gamingMatch[1]);
        emoji = "📖";
        originalValues = cleanedLine;

        if (readingDays >= gamingDays) {
          status = "✅";
          habitDescription = "Good hobby habits";
        } else if (readingDays < gamingDays && gamingDays <= 2) {
          status = "⚠️";
          habitDescription = "Not great hobby habits";
        } else {
          status = "❌";
          habitDescription = "Bad hobby habits";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // 5. Average body weight
    // ✅ ⚖️ Good body weight (X avg body weight)
    // ⚠️ ⚖️ Not great body weight (X avg body weight)
    // ❌ ⚖️ Bad body weight (X avg body weight)
    else if (line.includes("body weight") || line.includes("avg body weight")) {
      const weightMatch = line.match(
        /([\d.]+)\s*(?:avg\s*)?(?:body\s*)?weight/i
      );

      if (weightMatch) {
        const weight = parseFloat(weightMatch[1]);
        emoji = "⚖️";
        originalValues = cleanedLine;

        if (weight <= 195) {
          status = "✅";
          habitDescription = "Good body weight";
        } else if (weight < 200) {
          status = "⚠️";
          habitDescription = "Not great body weight";
        } else {
          status = "❌";
          habitDescription = "Bad body weight";
        }

        formattedLines.push(
          `${status} ${emoji} ${habitDescription} (${originalValues})`
        );
      }
    }

    // If no pattern matched, just add the line with a warning status
    else {
      formattedLines.push(`⚠️ ${cleanedLine}`);
    }
  }

  return formattedLines.join("\n");
}

const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("../../src/utils/auth-utils");
const { getWeekDateRange } = require("./pull-personal-tasks");
require("dotenv").config();

// Initialize personal auth instance (reused across calls)
let personalAuth = null;

// Habit calendar configuration mapping to Notion number fields
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
  { envVar: "READ_CALENDAR_ID", notionField: "Read", displayName: "Read" },
  {
    envVar: "VIDEO_GAMES_CALENDAR_ID",
    notionField: "Video Games",
    displayName: "Video Games",
  },
  { envVar: "ART_CALENDAR_ID", notionField: "Art", displayName: "Art" },
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

async function fetchCalendarEvents(calendarId, startDate, endDate) {
  if (!personalAuth) {
    if (!validateAuthConfig("personal")) {
      console.error(
        "❌ Personal calendar authentication not configured properly"
      );
      return [];
    }
    personalAuth = createPersonalAuth();
  }

  const events = await fetchCalendarEventsWithAuth(
    personalAuth,
    calendarId,
    startDate,
    endDate
  );
  return events || [];
}

async function pullPersonalHabits(weekNumber) {
  try {
    console.log(`📥 Fetching Habits for Week ${weekNumber}...`);

    const { startDate, endDate } = await getWeekDateRange(weekNumber);

    const summaryUpdates = {};

    for (const calendar of HABIT_CALENDARS) {
      const calendarId = process.env[calendar.envVar];
      if (!calendarId) continue;

      const allEvents = await fetchCalendarEvents(
        calendarId,
        startDate,
        endDate
      );

      // Filter to events within week (inclusive)
      const events = allEvents.filter((event) => {
        let eventDate;
        if (
          calendar.envVar === "SLEEP_IN_CALENDAR_ID" ||
          calendar.envVar === "WAKE_UP_EARLY_CALENDAR_ID"
        ) {
          eventDate =
            event.end?.date ||
            event.end?.dateTime?.split("T")[0] ||
            event.start?.date ||
            event.start?.dateTime?.split("T")[0];
        } else {
          eventDate = event.start?.date || event.start?.dateTime?.split("T")[0];
        }
        return eventDate && eventDate >= startDate && eventDate <= endDate;
      });

      if (calendar.envVar === "BODY_WEIGHT_CALENDAR_ID") {
        const weights = [];
        events.forEach((event) => {
          const title = event.summary || "";
          const weightMatch = title.match(/Weight:\s*(\d+(?:\.\d+)?)\s*lbs?/i);
          if (weightMatch) {
            const weight = parseFloat(weightMatch[1]);
            if (!isNaN(weight)) weights.push(weight);
          }
        });

        if (weights.length > 0) {
          const total = weights.reduce((sum, w) => sum + w, 0);
          const avg = Math.round((total / weights.length) * 10) / 10;
          console.log(
            `   ${calendar.displayName}: ${avg} lbs average (${weights.length} measurements)`
          );
          summaryUpdates[calendar.notionField] = avg;
        } else {
          console.log(
            `   ${calendar.displayName}: No valid weight measurements found (${events.length} events)`
          );
          summaryUpdates[calendar.notionField] = 0;
        }
      } else {
        const uniqueDays = new Set();
        events.forEach((event) => {
          let eventDate;
          if (
            calendar.envVar === "SLEEP_IN_CALENDAR_ID" ||
            calendar.envVar === "WAKE_UP_EARLY_CALENDAR_ID"
          ) {
            if (event.end && event.end.date) {
              eventDate = event.end.date;
            } else if (event.end && event.end.dateTime) {
              eventDate = event.end.dateTime.split("T")[0];
            } else if (event.start && event.start.date) {
              eventDate = event.start.date;
            } else if (event.start && event.start.dateTime) {
              eventDate = event.start.dateTime.split("T")[0];
            }
          } else {
            if (event.start && event.start.date) {
              eventDate = event.start.date;
            } else if (event.start && event.start.dateTime) {
              eventDate = event.start.dateTime.split("T")[0];
            }
          }
          if (eventDate) uniqueDays.add(eventDate);
        });

        const habitCount = uniqueDays.size;
        console.log(
          `   ${calendar.displayName}: ${habitCount} days (${events.length} events)`
        );
        summaryUpdates[calendar.notionField] = habitCount;
      }
    }

    return summaryUpdates;
  } catch (error) {
    console.error(
      `❌ Error pulling personal habits for Week ${weekNumber}:`,
      error.message
    );
    return {};
  }
}

module.exports = {
  pullPersonalHabits,
};
