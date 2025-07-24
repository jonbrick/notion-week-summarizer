const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
  askQuestion,
} = require("./src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("./src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("./src/config/task-config");
const { extractEventDuration } = require("./src/utils/time-utils");
const {
  processPersonalProjectEvents,
} = require("./src/utils/personal-pr-processor");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("🗓️ Personal Calendar Summary Generator");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let includePersonalCal = true; // Default to personal calendar
let includePRs = false;

// Google Auth for Personal
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

// Fetch calendar events
async function fetchCalendarEvents(calendarId, startDate, endDate) {
  try {
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
  } catch (error) {
    console.error(`❌ Error fetching calendar events:`, error.message);
    return [];
  }
}

// Get my response status
function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

// Categorize event by color - PERSONAL CALENDAR MAPPING
function categorizeEventByColor(rawEvent) {
  const colorId = rawEvent.colorId || "default";
  const eventType = rawEvent.eventType || "default";
  const responseStatus = getMyResponseStatus(rawEvent.attendees);
  const eventTitle = (rawEvent.summary || "").toLowerCase();

  // 1. EventType filters
  if (eventType === "outOfOffice") {
    return createEventObject(rawEvent, "ignored", "Out of Office");
  }
  if (eventType === "workingLocation") {
    return createEventObject(rawEvent, "ignored", "Working Location");
  }

  // 2. RSVP filter - declined meetings go to ignored
  if (responseStatus === "declined") {
    return createEventObject(rawEvent, "ignored", "Declined Event");
  }

  // 3. Filter out any work events (color 7 or work-related titles)
  if (
    colorId === "7" ||
    eventTitle.includes("work") ||
    eventTitle.includes("meeting") ||
    eventTitle.includes("standup") ||
    eventTitle.includes("sync")
  ) {
    return createEventObject(rawEvent, "work", "Work Event");
  }

  // 4. Color mapping for personal calendar
  const colorMapping = {
    2: { category: "personal", name: "Personal Cal" }, // Sage/Green
    3: { category: "interpersonal", name: "Interpersonal Cal" }, // Purple
    5: { category: "home", name: "Home Cal" }, // Yellow
    8: { category: "physicalHealth", name: "Physical Health Cal" }, // Gray
    11: { category: "mentalHealth", name: "Mental Health Cal" }, // Red
    default: { category: "personal", name: "Personal Cal" }, // No color defaults to personal
  };

  const colorInfo = colorMapping[colorId] || colorMapping.default;
  return createEventObject(rawEvent, colorInfo.category, colorInfo.name);
}

// Create event object
function createEventObject(rawEvent, category, categoryName) {
  const duration = extractEventDuration(rawEvent);

  return {
    title: rawEvent.summary || "Untitled",
    duration: duration,
    colorId: rawEvent.colorId || "default",
    category: category,
    categoryName: categoryName,
    startTime: rawEvent.start?.dateTime || rawEvent.start?.date,
    attendeeCount: rawEvent.attendees ? rawEvent.attendees.length : 0,
    eventType: rawEvent.eventType || "default",
    responseStatus: getMyResponseStatus(rawEvent.attendees),
    isAllDay: duration?.isAllDay || false,
  };
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

// Column mapping for personal categories
const PERSONAL_CATEGORY_MAPPING = {
  personal: "Personal Cal",
  interpersonal: "Interpersonal Cal",
  home: "Home Cal",
  mentalHealth: "Mental Health Cal",
  physicalHealth: "Physical Health Cal",
  pr: "Personal PR Summary", // ADD THIS LINE
};

// Category names for empty messages
const CATEGORY_DISPLAY_NAMES = {
  personal: "personal",
  interpersonal: "interpersonal",
  home: "home",
  mentalHealth: "mental health",
  physicalHealth: "physical health",
};

// Format events for Notion
function formatEventsForNotion(events, categoryKey) {
  const displayName = CATEGORY_DISPLAY_NAMES[categoryKey] || categoryKey;

  if (events.length === 0) {
    return `No ${displayName} calendar events this week.`;
  }

  // Filter out all-day events and very short events
  const validEvents = events.filter(
    (event) => !event.isAllDay && event.duration && event.duration.minutes >= 15
  );

  if (validEvents.length === 0) {
    return `No ${displayName} calendar events this week.`;
  }

  // Group events by title
  const eventGroups = {};

  validEvents.forEach((event) => {
    const cleanTitle = event.title.trim();

    if (!eventGroups[cleanTitle]) {
      eventGroups[cleanTitle] = {
        title: cleanTitle,
        totalMinutes: 0,
        count: 0,
      };
    }

    eventGroups[cleanTitle].totalMinutes += event.duration.minutes || 0;
    eventGroups[cleanTitle].count += 1;
  });

  // Convert to array and sort by total time (descending)
  const groupedEvents = Object.values(eventGroups).sort(
    (a, b) => b.totalMinutes - a.totalMinutes
  );

  const totalMinutes = validEvents.reduce(
    (sum, e) => sum + (e.duration.minutes || 0),
    0
  );
  const totalHours = (totalMinutes / 60).toFixed(1);

  let output = `${displayName.toUpperCase()} (${
    validEvents.length
  } events, ${totalHours} hours):\n`;
  output += "------\n";

  groupedEvents.forEach((group) => {
    const { formatDuration } = require("./src/utils/time-utils");
    const duration = formatDuration(group.totalMinutes);
    const countText = group.count > 1 ? ` (${group.count}x)` : "";
    output += `• ${group.title}${countText} (${duration})\n`;
  });

  return output.trim();
}

// Build comprehensive personal summary
async function buildPersonalSummary(personalEvents, startDate, endDate) {
  let output = "";

  // 1. PERSONAL section (from personal calendar)
  const validPersonalEvents = personalEvents.filter(
    (event) => !event.isAllDay && event.duration && event.duration.minutes >= 15
  );

  if (validPersonalEvents.length > 0) {
    output += formatEventsForNotion(personalEvents, "personal");
  } else {
    output +=
      "PERSONAL (0 events, 0 hours):\n------\nNo personal calendar events this week.";
  }

  // 2. VIDEO GAMES section
  if (process.env.VIDEO_GAMES_CALENDAR_ID) {
    console.log("   📥 Fetching video game sessions...");
    const gameEvents = await fetchCalendarEvents(
      process.env.VIDEO_GAMES_CALENDAR_ID,
      startDate,
      endDate
    );

    output += "\n\n";

    if (gameEvents.length > 0) {
      const processedGames = gameEvents.map((event) => ({
        title: event.summary || "Gaming session",
        duration: extractEventDuration(event),
        startTime: event.start?.dateTime || event.start?.date,
        isAllDay: event.start?.date && !event.start?.dateTime,
      }));

      const validGames = processedGames.filter(
        (g) => !g.isAllDay && g.duration && g.duration.minutes >= 15
      );

      if (validGames.length > 0) {
        const gameGroups = {};

        validGames.forEach((game) => {
          const cleanTitle = game.title.trim();
          if (!gameGroups[cleanTitle]) {
            gameGroups[cleanTitle] = {
              title: cleanTitle,
              totalMinutes: 0,
              count: 0,
            };
          }
          gameGroups[cleanTitle].totalMinutes += game.duration.minutes || 0;
          gameGroups[cleanTitle].count += 1;
        });

        const groupedGames = Object.values(gameGroups).sort(
          (a, b) => b.totalMinutes - a.totalMinutes
        );

        const totalMinutes = validGames.reduce(
          (sum, g) => sum + (g.duration.minutes || 0),
          0
        );
        const totalHours = (totalMinutes / 60).toFixed(1);

        output += `VIDEO GAMES (${validGames.length} sessions, ${totalHours} hours):`;
        groupedGames.forEach((group) => {
          const { formatDuration } = require("./src/utils/time-utils");
          const duration = formatDuration(group.totalMinutes);
          const countText = group.count > 1 ? ` (${group.count}x)` : "";
          output += `\n• ${group.title}${countText} (${duration})`;
        });
      } else {
        output += "VIDEO GAMES:\nNo gaming sessions this week.";
      }
    } else {
      output += "VIDEO GAMES:\nNo gaming sessions this week.";
    }
  }

  // 3. READING section
  if (process.env.READ_CALENDAR_ID) {
    console.log("   📥 Fetching reading sessions...");
    const readEvents = await fetchCalendarEvents(
      process.env.READ_CALENDAR_ID,
      startDate,
      endDate
    );

    output += "\n\n";

    if (readEvents.length > 0) {
      const processedReading = readEvents.map((event) => ({
        title: event.summary || "Reading session",
        duration: extractEventDuration(event),
        startTime: event.start?.dateTime || event.start?.date,
        isAllDay: event.start?.date && !event.start?.dateTime,
      }));

      const validReading = processedReading.filter(
        (r) => !r.isAllDay && r.duration && r.duration.minutes >= 15
      );

      if (validReading.length > 0) {
        const readGroups = {};

        validReading.forEach((read) => {
          const cleanTitle = read.title.trim();
          if (!readGroups[cleanTitle]) {
            readGroups[cleanTitle] = {
              title: cleanTitle,
              totalMinutes: 0,
              count: 0,
            };
          }
          readGroups[cleanTitle].totalMinutes += read.duration.minutes || 0;
          readGroups[cleanTitle].count += 1;
        });

        const groupedReading = Object.values(readGroups).sort(
          (a, b) => b.totalMinutes - a.totalMinutes
        );

        const totalMinutes = validReading.reduce(
          (sum, r) => sum + (r.duration.minutes || 0),
          0
        );
        const totalHours = (totalMinutes / 60).toFixed(1);

        output += `READING (${validReading.length} sessions, ${totalHours} hours):`;
        groupedReading.forEach((group) => {
          const { formatDuration } = require("./src/utils/time-utils");
          const duration = formatDuration(group.totalMinutes);
          const countText = group.count > 1 ? ` (${group.count}x)` : "";
          output += `\n• ${group.title}${countText} (${duration})`;
        });
      } else {
        output += "READING:\nNo reading sessions this week.";
      }
    } else {
      output += "READING:\nNo reading sessions this week.";
    }
  }

  console.log(`   ✅ Built comprehensive personal summary`);
  return output;
}

// Build comprehensive physical health summary
async function buildPhysicalHealthSummary(
  physicalHealthEvents,
  startDate,
  endDate
) {
  let output = "";

  // 1. PHYSICAL HEALTH section (from personal calendar gray events)
  const validHealthEvents = physicalHealthEvents.filter(
    (event) => !event.isAllDay && event.duration && event.duration.minutes >= 15
  );

  if (validHealthEvents.length > 0) {
    output += formatEventsForNotion(physicalHealthEvents, "physicalHealth");
  } else {
    output +=
      "PHYSICAL HEALTH (0 events, 0 hours):\n------\nNo physical health calendar events this week.";
  }

  // 2. WORKOUTS section (from workout calendar)
  if (process.env.WORKOUT_CALENDAR_ID) {
    console.log("   📥 Fetching workout events...");
    const workoutEvents = await fetchCalendarEvents(
      process.env.WORKOUT_CALENDAR_ID,
      startDate,
      endDate
    );

    output += "\n\n";

    if (workoutEvents.length > 0) {
      // Process workout events
      const processedWorkouts = workoutEvents.map((event) => ({
        title: event.summary || "Workout",
        duration: extractEventDuration(event),
        startTime: event.start?.dateTime || event.start?.date,
        isAllDay: event.start?.date && !event.start?.dateTime,
      }));

      // Filter and group workouts
      const validWorkouts = processedWorkouts.filter(
        (w) => !w.isAllDay && w.duration && w.duration.minutes >= 15
      );

      if (validWorkouts.length > 0) {
        const workoutGroups = {};

        validWorkouts.forEach((workout) => {
          const cleanTitle = workout.title.trim();
          if (!workoutGroups[cleanTitle]) {
            workoutGroups[cleanTitle] = {
              title: cleanTitle,
              totalMinutes: 0,
              count: 0,
            };
          }
          workoutGroups[cleanTitle].totalMinutes +=
            workout.duration.minutes || 0;
          workoutGroups[cleanTitle].count += 1;
        });

        const groupedWorkouts = Object.values(workoutGroups).sort(
          (a, b) => b.totalMinutes - a.totalMinutes
        );

        const totalMinutes = validWorkouts.reduce(
          (sum, w) => sum + (w.duration.minutes || 0),
          0
        );
        const totalHours = (totalMinutes / 60).toFixed(1);

        output += `WORKOUTS (${validWorkouts.length} sessions, ${totalHours} hours):`;
        groupedWorkouts.forEach((group) => {
          const { formatDuration } = require("./src/utils/time-utils");
          const duration = formatDuration(group.totalMinutes);
          const countText = group.count > 1 ? ` (${group.count}x)` : "";
          output += `\n• ${group.title}${countText} (${duration})`;
        });
      } else {
        output += "WORKOUTS:\nNo workout sessions this week.";
      }
    } else {
      output += "WORKOUTS:\nNo workout sessions this week.";
    }
  }

  // 3. ALCOHOL section
  output += "\n\n";

  if (
    process.env.SOBER_DAYS_CALENDAR_ID ||
    process.env.DRINKING_DAYS_CALENDAR_ID
  ) {
    console.log("   📥 Fetching alcohol tracking data...");

    let soberDays = 0;
    let drinkingDays = 0;

    // Fetch sober days
    if (process.env.SOBER_DAYS_CALENDAR_ID) {
      const allSoberEvents = await fetchCalendarEvents(
        process.env.SOBER_DAYS_CALENDAR_ID,
        startDate,
        endDate
      );

      // Filter events to only include those in the target week
      const soberEvents = allSoberEvents.filter((event) => {
        const eventDate =
          event.start?.date || event.start?.dateTime?.split("T")[0];
        return eventDate && eventDate >= startDate && eventDate <= endDate;
      });

      const uniqueSoberDays = new Set();
      soberEvents.forEach((event) => {
        const eventDate =
          event.start?.date || event.start?.dateTime?.split("T")[0];
        if (eventDate) uniqueSoberDays.add(eventDate);
      });
      soberDays = uniqueSoberDays.size;
    }

    // Fetch drinking days
    if (process.env.DRINKING_DAYS_CALENDAR_ID) {
      const allDrinkingEvents = await fetchCalendarEvents(
        process.env.DRINKING_DAYS_CALENDAR_ID,
        startDate,
        endDate
      );

      // Filter events to only include those in the target week
      const drinkingEvents = allDrinkingEvents.filter((event) => {
        const eventDate =
          event.start?.date || event.start?.dateTime?.split("T")[0];
        return eventDate && eventDate >= startDate && eventDate <= endDate;
      });

      const uniqueDrinkingDays = new Set();
      drinkingEvents.forEach((event) => {
        const eventDate =
          event.start?.date || event.start?.dateTime?.split("T")[0];
        if (eventDate) uniqueDrinkingDays.add(eventDate);
      });
      drinkingDays = uniqueDrinkingDays.size;
    }

    output += `ALCOHOL:\n• Days sober: ${soberDays}\n• Days drinking: ${drinkingDays}`;
  } else {
    output += "ALCOHOL:\n• Days sober: N/A\n• Days drinking: N/A";
  }

  // 4. BODY WEIGHT section
  if (process.env.BODY_WEIGHT_CALENDAR_ID) {
    console.log("   📥 Fetching body weight data...");
    const weightEvents = await fetchCalendarEvents(
      process.env.BODY_WEIGHT_CALENDAR_ID,
      startDate,
      endDate
    );

    output += "\n\n";

    if (weightEvents.length > 0) {
      const weights = [];

      // Parse weights from event titles
      weightEvents.forEach((event) => {
        const title = event.summary || "";
        // Parse weight from event title using regex: "Weight: 202 lbs"
        const weightMatch = title.match(/Weight:\s*(\d+(?:\.\d+)?)\s*lbs?/i);

        if (weightMatch) {
          const weight = parseFloat(weightMatch[1]);
          if (!isNaN(weight)) {
            weights.push(weight);
          }
        }
      });

      if (weights.length > 0) {
        const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
        const averageWeight =
          Math.round((totalWeight / weights.length) * 10) / 10; // Round to 1 decimal

        output += `AVERAGE BODY WEIGHT: ${averageWeight} lbs (${weights.length} measurements)`;
      } else {
        output += "AVERAGE BODY WEIGHT:\nNo valid weight measurements found.";
      }
    } else {
      output += "AVERAGE BODY WEIGHT:\nNo weight data this week.";
    }
  }

  // 5. SLEEP TRACKING section
  output += "\n\nSLEEP TRACKING:";

  let sleepDataFound = false;

  // Count early wake-ups
  if (process.env.WAKE_UP_EARLY_CALENDAR_ID) {
    const earlyWakeEvents = await fetchCalendarEvents(
      process.env.WAKE_UP_EARLY_CALENDAR_ID,
      startDate,
      endDate
    );

    const uniqueEarlyDays = new Set();
    earlyWakeEvents.forEach((event) => {
      const eventDate =
        event.end?.date ||
        event.end?.dateTime?.split("T")[0] ||
        event.start?.date ||
        event.start?.dateTime?.split("T")[0];
      if (eventDate) uniqueEarlyDays.add(eventDate);
    });

    if (uniqueEarlyDays.size > 0) {
      output += `\n• Early wake-ups: ${uniqueEarlyDays.size} days`;
      sleepDataFound = true;
    }
  }

  // Count sleep-ins
  if (process.env.SLEEP_IN_CALENDAR_ID) {
    const sleepInEvents = await fetchCalendarEvents(
      process.env.SLEEP_IN_CALENDAR_ID,
      startDate,
      endDate
    );

    const uniqueSleepInDays = new Set();
    sleepInEvents.forEach((event) => {
      const eventDate =
        event.end?.date ||
        event.end?.dateTime?.split("T")[0] ||
        event.start?.date ||
        event.start?.dateTime?.split("T")[0];
      if (eventDate) uniqueSleepInDays.add(eventDate);
    });

    if (uniqueSleepInDays.size > 0) {
      output += `\n• Sleep-ins: ${uniqueSleepInDays.size} days`;
      sleepDataFound = true;
    }
  }

  if (!sleepDataFound) {
    output += "\nNo sleep tracking data this week.";
  }

  console.log(`   ✅ Built comprehensive physical health summary`);
  return output;
}

// Process single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n🗓️  === PROCESSING WEEK ${weekNumber} ===`);

    // Get week date range and page ID
    const { startDate, endDate, pageId } = await getWeekDateRange(weekNumber);
    const paddedWeek = weekNumber.toString().padStart(2, "0");

    console.log(`✅ Found Week ${paddedWeek} Recap!`);
    console.log(`📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}`);

    // Initialize notionUpdates object
    const notionUpdates = {};

    // Process personal calendar events if requested
    if (includePersonalCal) {
      // Fetch calendar events
      const rawEvents = await fetchCalendarEvents(
        process.env.PERSONAL_CALENDAR_ID,
        startDate,
        endDate
      );

      console.log(`📥 Processing ${rawEvents.length} raw events...\n`);

      // Categorize all events
      const categorizedEvents = rawEvents.map(categorizeEventByColor);

      // Group by category
      const categories = {
        personal: [],
        interpersonal: [],
        home: [],
        mentalHealth: [],
        physicalHealth: [],
        work: [], // For logging only
        ignored: [], // For logging only
      };

      categorizedEvents.forEach((event) => {
        if (categories[event.category]) {
          categories[event.category].push(event);
        }
      });

      // Log filtered events
      const filteredEvents = [...categories.work, ...categories.ignored];
      if (filteredEvents.length > 0) {
        console.log(`🚫 FILTERED (${filteredEvents.length} events):`);
        const sampleEvents = filteredEvents.slice(0, 5);
        sampleEvents.forEach((event, index) => {
          console.log(
            `   ${index + 1}. "${event.title}" - ${event.categoryName}`
          );
        });
        if (filteredEvents.length > 5) {
          console.log(`   ... and ${filteredEvents.length - 5} more`);
        }
        console.log("");
      }

      // Process most personal categories
      const basicCategories = ["interpersonal", "home", "mentalHealth"];

      basicCategories.forEach((categoryKey) => {
        const columnName = PERSONAL_CATEGORY_MAPPING[categoryKey];
        const events = categories[categoryKey];
        const formattedContent = formatEventsForNotion(events, categoryKey);

        notionUpdates[columnName] = formattedContent;

        // Log what we're updating
        const validEvents = events.filter(
          (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
        );
        const totalMinutes = validEvents.reduce(
          (sum, e) => sum + (e.duration?.minutes || 0),
          0
        );
        const timeText =
          totalMinutes > 0 ? ` (${(totalMinutes / 60).toFixed(1)} hours)` : "";
        console.log(
          `🔄 ${columnName}: ${validEvents.length} events${timeText}`
        );
      });

      // Special handling for Personal - combine multiple sources
      console.log("\n🎮 Processing enhanced Personal data...");
      const personalSummary = await buildPersonalSummary(
        categories.personal,
        startDate,
        endDate
      );
      notionUpdates["Personal Cal"] = personalSummary;

      // Special handling for Physical Health - combine multiple sources
      console.log("\n🏃 Processing enhanced Physical Health data...");
      const physicalHealthSummary = await buildPhysicalHealthSummary(
        categories.physicalHealth,
        startDate,
        endDate
      );
      notionUpdates["Physical Health Cal"] = physicalHealthSummary;
    }

    // Fetch PR events if requested
    if (includePRs && process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID) {
      console.log("\n📥 Fetching Personal PR events...");
      const prEvents = await fetchCalendarEvents(
        process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID,
        startDate,
        endDate
      );

      if (prEvents.length > 0) {
        let prSummary = await processPersonalProjectEvents(prEvents);

        // Check if summary exceeds Notion's 2000 character limit
        if (prSummary.length > 2000) {
          console.log(
            `⚠️  PR summary too long (${prSummary.length} chars), truncating...`
          );

          // Find a good breaking point before 1950 chars (leaving room for "...")
          const maxLength = 1950;
          let truncateAt = prSummary.lastIndexOf("\n", maxLength);

          // If no newline found, just cut at maxLength
          if (truncateAt === -1 || truncateAt < maxLength - 200) {
            truncateAt = maxLength;
          }

          prSummary =
            prSummary.substring(0, truncateAt) +
            "\n\n... (truncated due to length)";
        }

        notionUpdates["Personal PR Summary"] = prSummary;
        console.log(`🔄 Personal PR Summary: ${prEvents.length} events`);
      } else {
        notionUpdates["Personal PR Summary"] =
          "No personal project commits this week.";
        console.log(`🔄 Personal PR Summary: No events`);
      }
    }

    // Update Notion
    console.log("\n📝 Updating Notion...");
    await updateAllSummaries(notion, pageId, notionUpdates);
    console.log(`✅ Successfully updated Week ${paddedWeek} recap!`);
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error);
  }
}

// Process all selected weeks
async function processAllWeeks() {
  console.log(
    `🚀 Starting personal calendar summary for weeks: ${TARGET_WEEKS.join(
      ", "
    )}`
  );
  console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...\n`);

  for (const weekNumber of TARGET_WEEKS) {
    await processWeek(weekNumber);
  }

  console.log(
    `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
  );
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  // Check if running in interactive mode
  const result = await checkInteractiveMode(
    args,
    [], // No categories for this script
    DEFAULT_TARGET_WEEKS,
    [] // No active categories
  );

  if (result.isInteractive) {
    console.log(`\n📌 Default: Week ${DEFAULT_TARGET_WEEKS.join(",")}\n`);

    // Ask what to include first
    console.log("? What to process?");
    console.log("  1 - Both (Personal Calendar + PRs)");
    console.log("  2 - Personal Calendar Only");
    console.log("  3 - Personal PRs Only");

    const includeInput = await askQuestion(
      "\n? Enter choice (or press enter for both): "
    );

    // Reset flags
    includePersonalCal = false;
    includePRs = false;

    if (includeInput.trim() === "1" || includeInput.trim() === "") {
      includePersonalCal = true;
      includePRs = true;
    } else if (includeInput.trim() === "2") {
      includePersonalCal = true;
    } else if (includeInput.trim() === "3") {
      includePRs = true;
    }

    const weeksInput = await askQuestion(
      "\n? Which weeks to process? (comma-separated, e.g., 1,2,3): "
    );

    if (weeksInput.trim()) {
      TARGET_WEEKS = weeksInput
        .split(",")
        .map((w) => parseInt(w.trim()))
        .filter((w) => !isNaN(w));
    }

    // Show confirmation
    console.log(
      `\n📋 Processing: ${
        includePersonalCal && includePRs
          ? "Personal Calendar + PRs"
          : includePersonalCal
          ? "Personal Calendar"
          : "Personal PRs"
      }`
    );
    console.log(`📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);

    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }

    console.log(""); // Empty line before processing
  } else {
    // Command line mode - check for flags
    if (args.includes("--prs")) {
      includePRs = true;
      includePersonalCal = false;
    } else if (args.includes("--both")) {
      includePRs = true;
      includePersonalCal = true;
    }
    TARGET_WEEKS = result.targetWeeks;
  }

  await processAllWeeks();
}

// Run the script
main()
  .then(() => {
    rl.close();
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    rl.close();
    process.exit(1);
  });
