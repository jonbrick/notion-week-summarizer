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
const { categorizeEventByColor } = require("./src/utils/color-mappings");
const {
  createPersonalAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("./src/utils/auth-utils");
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
let includePRs = true; // Always include PRs

// Initialize personal auth instance
let personalAuth = null;

// Fetch calendar events with enhanced error handling
async function fetchCalendarEvents(calendarId, startDate, endDate) {
  try {
    // Initialize auth if not already done
    if (!personalAuth) {
      // Validate configuration first
      if (!validateAuthConfig("personal")) {
        console.error(
          "❌ Personal calendar authentication not configured properly"
        );
        return [];
      }

      personalAuth = createPersonalAuth();
    }

    return await fetchCalendarEventsWithAuth(
      personalAuth,
      calendarId,
      startDate,
      endDate
    );
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
    return `Total ${displayName} time: 0 hours\nNo ${displayName} calendar events this week.`;
  }

  // Filter out all-day events and very short events
  const validEvents = events.filter(
    (event) => !event.isAllDay && event.duration && event.duration.minutes >= 15
  );

  if (validEvents.length === 0) {
    return `Total ${displayName} time: 0 hours\nNo ${displayName} calendar events this week.`;
  }

  // Group events by title
  const eventGroups = {};

  validEvents.forEach((event) => {
    const cleanTitle = event.summary.trim();

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

  let output = `Total ${displayName} time: ${totalHours} hours\n`;

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
      const categorizedEvents = rawEvents.map((event) =>
        categorizeEventByColor(event, "personal")
      );

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
            `   ${index + 1}. "${event.summary}" - ${event.categoryName}`
          );
        });
        if (filteredEvents.length > 5) {
          console.log(`   ... and ${filteredEvents.length - 5} more`);
        }
        console.log("");
      }

      // Process most personal categories
      const basicCategories = ["interpersonal", "home", "mentalHealth"];

      // Calculate totals for Personal Cal Summary
      let totalMinutes = 0;
      let totalEvents = 0;
      const categoryStats = {};

      basicCategories.forEach((categoryKey) => {
        const columnName = PERSONAL_CATEGORY_MAPPING[categoryKey];
        const events = categories[categoryKey];
        const formattedContent = formatEventsForNotion(events, categoryKey);

        notionUpdates[columnName] = formattedContent;

        // Calculate stats
        const categoryMinutes = events
          .filter((e) => !e.isAllDay && e.duration && e.duration.minutes >= 15)
          .reduce((sum, e) => sum + (e.duration.minutes || 0), 0);

        categoryStats[categoryKey] = {
          minutes: categoryMinutes,
          hours: categoryMinutes / 60,
          events: events.filter(
            (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
          ).length,
        };

        totalMinutes += categoryMinutes;
        totalEvents += events.filter(
          (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
        ).length;

        // Log what we're updating
        const timeText =
          categoryMinutes > 0
            ? ` (${(categoryMinutes / 60).toFixed(1)} hours)`
            : "";
        console.log(
          `🔄 ${columnName}: ${
            events.filter(
              (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
            ).length
          } events${timeText}`
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

      // Calculate personal stats
      const personalEvents = categories.personal.filter(
        (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
      );
      const personalMinutes = personalEvents.reduce(
        (sum, e) => sum + (e.duration.minutes || 0),
        0
      );
      categoryStats.personal = {
        minutes: personalMinutes,
        hours: personalMinutes / 60,
        events: personalEvents.length,
      };
      totalMinutes += personalMinutes;
      totalEvents += personalEvents.length;

      // Special handling for Physical Health - combine multiple sources
      console.log("\n🏃 Processing enhanced Physical Health data...");
      const physicalHealthSummary = await buildPhysicalHealthSummary(
        categories.physicalHealth,
        startDate,
        endDate
      );
      notionUpdates["Physical Health Cal"] = physicalHealthSummary;

      // Calculate physical health stats
      const physicalHealthEvents = categories.physicalHealth.filter(
        (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
      );
      const physicalHealthMinutes = physicalHealthEvents.reduce(
        (sum, e) => sum + (e.duration.minutes || 0),
        0
      );
      categoryStats.physicalHealth = {
        minutes: physicalHealthMinutes,
        hours: physicalHealthMinutes / 60,
        events: physicalHealthEvents.length,
      };
      totalMinutes += physicalHealthMinutes;
      totalEvents += physicalHealthEvents.length;

      // CREATE PERSONAL CAL SUMMARY
      const totalHours = totalMinutes / 60;
      const personalHours = categoryStats.personal.hours;
      const personalPercent =
        totalHours > 0 ? Math.round((personalHours / totalHours) * 100) : 0;
      const physicalHealthHours = categoryStats.physicalHealth.hours;
      const physicalHealthPercent =
        totalHours > 0
          ? Math.round((physicalHealthHours / totalHours) * 100)
          : 0;
      const interpersonalHours = categoryStats.interpersonal.hours;
      const interpersonalPercent =
        totalHours > 0
          ? Math.round((interpersonalHours / totalHours) * 100)
          : 0;
      const homeHours = categoryStats.home.hours;
      const homePercent =
        totalHours > 0 ? Math.round((homeHours / totalHours) * 100) : 0;
      const mentalHealthHours = categoryStats.mentalHealth.hours;
      const mentalHealthPercent =
        totalHours > 0 ? Math.round((mentalHealthHours / totalHours) * 100) : 0;

      let personalCalSummary = `PERSONAL CAL SUMMARY:\n`;
      personalCalSummary += `Total: ${totalHours.toFixed(
        1
      )} hours (${totalEvents} events)\n`;
      personalCalSummary += `- Personal: ${personalHours.toFixed(
        1
      )} hours (${personalPercent}%)\n`;
      personalCalSummary += `- Physical Health: ${physicalHealthHours.toFixed(
        1
      )} hours (${physicalHealthPercent}%)\n`;
      personalCalSummary += `- Interpersonal: ${interpersonalHours.toFixed(
        1
      )} hours (${interpersonalPercent}%)\n`;
      personalCalSummary += `- Home: ${homeHours.toFixed(
        1
      )} hours (${homePercent}%)\n`;
      personalCalSummary += `- Mental Health: ${mentalHealthHours.toFixed(
        1
      )} hours (${mentalHealthPercent}%)\n`;

      notionUpdates["Personal Cal Summary"] = personalCalSummary;
      console.log(`🔄 Personal Cal Summary: Created`);

      // Generate evaluation for Personal Cal Summary
      if (notionUpdates["Personal Cal Summary"]) {
        const existingCalSummary = notionUpdates["Personal Cal Summary"];
        const prSummary = notionUpdates["Personal PR Summary"] || "";

        // Get interpersonal events for evaluation
        const interpersonalEvents = categories.interpersonal.filter(
          (e) => !e.isAllDay && e.duration && e.duration.minutes >= 15
        );

        // Group interpersonal events by specific people
        const womenToGroup = {
          "Jen Rothman": ["Jen", "Jen Rothman"],
        };
        const interpersonalGroups = {};

        // Initialize groups with main names
        Object.keys(womenToGroup).forEach((mainName) => {
          interpersonalGroups[mainName] = [];
        });

        interpersonalEvents.forEach((event) => {
          const eventTitle = event.summary.toLowerCase();

          // Check if any woman's name is in the event title
          for (const [mainName, nicknames] of Object.entries(womenToGroup)) {
            for (const nickname of nicknames) {
              if (eventTitle.includes(nickname.toLowerCase())) {
                interpersonalGroups[mainName].push(event);
                break; // Only group with the first matching woman
              }
            }
            if (interpersonalGroups[mainName].length > 0) {
              break; // Found a match, don't check other main names
            }
          }
        });

        // Group call events
        const callEvents = interpersonalEvents.filter((event) => {
          const eventTitle = event.summary.toLowerCase();
          return eventTitle.includes("call");
        });

        if (callEvents.length > 0) {
          const callPeople = [];
          callEvents.forEach((event) => {
            const eventTitle = event.summary.toLowerCase();

            // Extract person name from call events
            // Handle patterns like "Mom Call", "call Dad", "Drew call"
            const callPatterns = [
              /^([a-z]+)\s+call/i, // "Mom Call", "Drew call"
              /call\s+([a-z]+)/i, // "call Dad", "call Mom"
            ];

            for (const pattern of callPatterns) {
              const match = eventTitle.match(pattern);
              if (match) {
                const person =
                  match[1].charAt(0).toUpperCase() + match[1].slice(1); // Capitalize first letter
                if (!callPeople.includes(person)) {
                  callPeople.push(person);
                }
                break;
              }
            }
          });

          if (callPeople.length > 0) {
            interpersonalGroups["Calls"] = callEvents;
          }
        }

        const calEvaluations = generatePersonalCalEvaluation(
          existingCalSummary,
          prSummary,
          categoryStats,
          interpersonalEvents,
          interpersonalGroups,
          womenToGroup,
          notionUpdates
        );

        if (calEvaluations.length > 0) {
          let finalSummary =
            existingCalSummary +
            "\n===== EVALUATION =====\n" +
            calEvaluations.join("\n");

          // Check if summary exceeds Notion's 2000 character limit
          if (finalSummary.length > 2000) {
            console.log(
              `⚠️  Personal Cal Summary too long (${finalSummary.length} chars), truncating...`
            );
            const maxLength = 1950;
            let truncateAt = finalSummary.lastIndexOf("\n", maxLength);
            if (truncateAt === -1 || truncateAt < maxLength - 200) {
              truncateAt = maxLength;
            }
            finalSummary =
              finalSummary.substring(0, truncateAt) +
              "\n\n... (truncated due to length)";
          }

          notionUpdates["Personal Cal Summary"] = finalSummary;
        }
      }
    }

    // Fetch PR events (always included)
    if (process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID) {
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

// Generate personal calendar evaluation
function generatePersonalCalEvaluation(
  existingCalSummary,
  prSummary,
  categoryStats,
  interpersonalEvents,
  interpersonalGroups,
  womenToGroup,
  notionUpdates
) {
  const evaluations = [];

  // Parse interpersonal events for evaluation
  const groupedEvaluations = [];
  const groupedEventTitles = new Set();

  // Process grouped interpersonal events
  Object.keys(interpersonalGroups).forEach((mainName) => {
    const events = interpersonalGroups[mainName];
    if (events.length > 0) {
      const eventTitles = events.map((e) => {
        // Special handling for call events
        if (mainName === "Calls") {
          return e.summary; // Keep call titles as-is
        }

        // Clean up event titles by removing any of the nicknames
        let cleanTitle = e.summary;
        const nicknames = womenToGroup[mainName];

        // Process longer names first to avoid partial matches
        const sortedNicknames = nicknames.sort((a, b) => b.length - a.length);

        sortedNicknames.forEach((nickname) => {
          const patterns = [
            new RegExp(`\\s+with\\s+${nickname}\\s*`, "gi"),
            new RegExp(`\\s+w\\s+${nickname}\\s*`, "gi"),
            new RegExp(`\\s+${nickname}\\s*`, "gi"), // Remove just the name if it appears alone
          ];

          patterns.forEach((pattern) => {
            cleanTitle = cleanTitle.replace(pattern, "");
          });

          // Handle cases with "&" or "and" - remove Jen and keep other person
          const andPatterns = [
            new RegExp(`\\s+with\\s+${nickname}\\s*&\\s*([^\\s]+)`, "gi"),
            new RegExp(`\\s+with\\s+([^\\s]+)\\s*&\\s*${nickname}`, "gi"),
            new RegExp(`\\s+with\\s+${nickname}\\s+and\\s+([^\\s]+)`, "gi"),
            new RegExp(`\\s+with\\s+([^\\s]+)\\s+and\\s+${nickname}`, "gi"),
          ];

          andPatterns.forEach((pattern) => {
            cleanTitle = cleanTitle.replace(pattern, " with $1");
          });
        });

        // Clean up any remaining connectors and normalize
        cleanTitle = cleanTitle
          .replace(/\s*&\s*/gi, " with ") // Replace any remaining "&" with "with"
          .replace(/\s+and\s+/gi, " with ") // Replace any remaining "and" with "with"
          .replace(/\s+\+\s+/gi, " with ") // Replace any remaining "+" with "with"
          .replace(/\s{2,}/g, " ") // Replace multiple spaces with single space
          .replace(/\s+with\s+with\s+/gi, " with ") // Fix double "with"
          .trim();

        return cleanTitle;
      });

      // Add original event titles to the set to exclude from full list
      events.forEach((e) => groupedEventTitles.add(e.summary));

      if (mainName === "Calls") {
        // Extract call people for display
        const callPeople = [];
        events.forEach((event) => {
          const eventTitle = event.summary.toLowerCase();
          const callPatterns = [
            /^([a-z]+)\s+call/i, // "Mom Call", "Drew call"
            /call\s+([a-z]+)/i, // "call Dad", "call Mom"
          ];

          for (const pattern of callPatterns) {
            const match = eventTitle.match(pattern);
            if (match) {
              const person =
                match[1].charAt(0).toUpperCase() + match[1].slice(1);
              if (!callPeople.includes(person)) {
                callPeople.push(person);
              }
              break;
            }
          }
        });

        groupedEvaluations.push(`Calls with ${callPeople.join(", ")}`);
      } else {
        groupedEvaluations.push(
          `Time with ${mainName} [${eventTitles.join(", ")}]`
        );
      }
    }
  });

  // Add remaining interpersonal events (not in groups)
  const remainingEvents = interpersonalEvents.filter(
    (event) => !groupedEventTitles.has(event.summary)
  );

  if (remainingEvents.length > 0) {
    const remainingEventTitles = remainingEvents.map((e) => e.summary);
    groupedEvaluations.push(remainingEventTitles.join(" ... "));
  }

  // Add interpersonal evaluation if there are events
  if (groupedEvaluations.length > 0) {
    evaluations.push(
      `✅ INTERPERSONAL EVENTS: ${
        interpersonalEvents.length
      } events (${groupedEvaluations.join(" ... ")})`
    );
  } else {
    evaluations.push(`❌ NO INTERPERSONAL EVENTS: 0 events`);
  }

  // Check for mental health events (only show when present)
  const mentalHealthEvents = interpersonalEvents.filter((event) => {
    const eventTitle = event.summary.toLowerCase();
    return (
      eventTitle.includes("therapy") ||
      eventTitle.includes("meditation") ||
      eventTitle.includes("journal")
    );
  });

  if (mentalHealthEvents.length > 0) {
    const mentalHealthEventTitles = mentalHealthEvents.map((e) => e.summary);
    evaluations.push(
      `✅ MENTAL HEALTH EVENTS: ${
        mentalHealthEvents.length
      } events (${mentalHealthEventTitles.join(" ... ")})`
    );
  }

  // Check for personal PRs (good when present)
  if (prSummary && !prSummary.includes("No personal project commits")) {
    const prMatch = prSummary.match(/PRs \((\d+) PRs?, (\d+) commits?\)/);
    if (prMatch) {
      const prCount = parseInt(prMatch[1]);
      const commitCount = parseInt(prMatch[2]);
      evaluations.push(
        `✅ PERSONAL PROJECTS: ${prCount} PRs, ${commitCount} commits`
      );
    }
  }

  // Parse Physical Health Cal data for sleep and workouts FIRST
  if (notionUpdates["Physical Health Cal"]) {
    const physicalCalText = notionUpdates["Physical Health Cal"];
    console.log(
      "🔍 Debug: Physical Health Cal data found, length:",
      physicalCalText.length
    );
    console.log(
      "🔍 Debug: First 200 chars of Physical Health Cal:",
      physicalCalText.substring(0, 200)
    );

    // Check for sleep tracking (early wake-ups GOOD, sleep-ins BAD) - FIRST
    if (physicalCalText.includes("SLEEP TRACKING:")) {
      const earlyMatch = physicalCalText.match(/Early wake-ups: (\d+) days/);
      const sleepInMatch = physicalCalText.match(/Sleep-ins: (\d+) days/);

      if (earlyMatch) {
        const earlyDays = parseInt(earlyMatch[1]);
        if (earlyDays > 0) {
          evaluations.push(`✅ EARLY WAKE-UPS: ${earlyDays} days`);
        }
      }

      if (sleepInMatch) {
        const sleepInDays = parseInt(sleepInMatch[1]);
        if (sleepInDays > 0) {
          evaluations.push(`❌ SLEEP-INS: ${sleepInDays} days`);
        }
      }
    }

    // Check for workouts (any workout is GOOD, no workouts is BAD) - SECOND
    if (physicalCalText.includes("WORKOUTS (")) {
      if (physicalCalText.includes("No workout sessions this week")) {
        evaluations.push(`❌ NO WORKOUTS: 0 sessions`);
      } else {
        // Try multiple regex patterns for workouts
        let workoutMatch = physicalCalText.match(
          /WORKOUTS\s*\((\d+)\s*sessions?,\s*([\d.]+)\s*hours?\):/
        );

        if (!workoutMatch) {
          // Try without the colon
          workoutMatch = physicalCalText.match(
            /WORKOUTS\s*\((\d+)\s*sessions?,\s*([\d.]+)\s*hours?\)/
          );
        }

        if (!workoutMatch) {
          // Try more flexible pattern
          workoutMatch = physicalCalText.match(
            /WORKOUTS.*?\((\d+).*?sessions?.*?([\d.]+).*?hours?\)/
          );
        }

        if (workoutMatch) {
          const sessions = parseInt(workoutMatch[1]);
          const hours = parseFloat(workoutMatch[2]);

          // Extract workout details from the text
          const workoutDetails = [];
          const lines = physicalCalText.split("\n");
          let inWorkoutSection = false;

          for (const line of lines) {
            if (line.includes("WORKOUTS (")) {
              inWorkoutSection = true;
              continue;
            }
            if (inWorkoutSection && line.startsWith("•")) {
              const workoutName = line.replace("• ", "").split(" (")[0];
              workoutDetails.push(workoutName);
            }
            if (inWorkoutSection && line.trim() === "") {
              break;
            }
          }

          const workoutList = workoutDetails.join(", ");
          evaluations.push(
            `✅ WORKOUTS: ${sessions} sessions, ${hours} hours (${workoutList})`
          );
        }
      }
    }
  }

  // Parse Personal Cal data for video games and reading - THIRD
  if (notionUpdates["Personal Cal"]) {
    const personalCalText = notionUpdates["Personal Cal"];

    // Debug logging for video games and reading parsing
    if (personalCalText.includes("VIDEO GAMES")) {
      console.log("🔍 Debug: VIDEO GAMES section found");
    } else {
      console.log("🔍 Debug: VIDEO GAMES section NOT found");
    }
    if (personalCalText.includes("READING:")) {
      console.log("🔍 Debug: READING section found");
    } else {
      console.log("🔍 Debug: READING section NOT found");
    }

    // Check for video games (none is GOOD, played is BAD)
    if (personalCalText.includes("VIDEO GAMES")) {
      if (personalCalText.includes("No gaming sessions this week")) {
        evaluations.push(`✅ NO VIDEO GAMES: 0 hours`);
      } else {
        // Extract video games info directly from the header line
        const lines = personalCalText.split("\n");
        let gameMatch = null;

        for (const line of lines) {
          if (line.includes("VIDEO GAMES")) {
            gameMatch = line.match(
              /VIDEO GAMES\s*\((\d+)\s*sessions?,\s*([\d.]+)\s*hours?\):?/
            );
            break;
          }
        }

        if (gameMatch) {
          const sessions = parseInt(gameMatch[1]);
          const hours = parseFloat(gameMatch[2]);
          const evaluation = `❌ VIDEO GAMES: ${sessions} sessions, ${hours} hours`;
          evaluations.push(evaluation);
        } else {
          // Fallback: try to extract from bullet points
          const bulletPoints = personalCalText.match(/• [^•\n]+/g);
          if (bulletPoints && bulletPoints.length > 0) {
            // Count bullet points that look like video games (not reading)
            const gameBullets = bulletPoints.filter(
              (bullet) =>
                !bullet.toLowerCase().includes("reading") &&
                bullet.includes("(") &&
                bullet.includes("hours")
            );
            if (gameBullets.length > 0) {
              evaluations.push(
                `❌ VIDEO GAMES: ${gameBullets.length} sessions found (parsed from bullet points)`
              );
            } else {
              evaluations.push(
                `❌ VIDEO GAMES: sessions found (format parsing failed)`
              );
            }
          } else {
            // If no match found but video games section exists, add a generic evaluation
            evaluations.push(
              `❌ VIDEO GAMES: sessions found (format parsing failed)`
            );
          }
        }
      }
    }

    // Check for reading (none is BAD, read is GOOD)
    if (personalCalText.includes("READING:")) {
      if (personalCalText.includes("No reading sessions this week")) {
        evaluations.push(`❌ NO READING: 0 sessions`);
      } else {
        // Extract reading info directly from the header line
        let readMatch = null;

        for (const line of lines) {
          if (line.includes("READING")) {
            readMatch = line.match(
              /READING\s*\((\d+)\s*sessions?,\s*([\d.]+)\s*hours?\):?/
            );
            break;
          }
        }

        if (readMatch) {
          const sessions = parseInt(readMatch[1]);
          const hours = parseFloat(readMatch[2]);
          const evaluation = `✅ READING: ${sessions} sessions, ${hours} hours`;
          evaluations.push(evaluation);
        } else {
          // Fallback: try to extract from bullet points
          const bulletPoints = personalCalText.match(/• [^•\n]+/g);
          if (bulletPoints && bulletPoints.length > 0) {
            // Count bullet points that look like reading
            const readingBullets = bulletPoints.filter(
              (bullet) =>
                bullet.toLowerCase().includes("reading") ||
                (bullet.includes("(") &&
                  bullet.includes("hours") &&
                  !bullet.toLowerCase().includes("game"))
            );
            if (readingBullets.length > 0) {
              evaluations.push(
                `✅ READING: ${readingBullets.length} sessions found (parsed from bullet points)`
              );
            } else {
              evaluations.push(
                `✅ READING: sessions found (format parsing failed)`
              );
            }
          } else {
            // If no match found but reading section exists, add a generic evaluation
            evaluations.push(
              `✅ READING: sessions found (format parsing failed)`
            );
          }
        }
      }
    }
  }

  // Parse Physical Health Cal data for alcohol and bodyweight - FOURTH
  if (notionUpdates["Physical Health Cal"]) {
    const physicalCalText = notionUpdates["Physical Health Cal"];

    // Check for alcohol (sober days GOOD, drinking days BAD)
    if (physicalCalText.includes("ALCOHOL:")) {
      const soberMatch = physicalCalText.match(/Days sober: (\d+)/);
      const drinkingMatch = physicalCalText.match(/Days drinking: (\d+)/);

      if (soberMatch) {
        const soberDays = parseInt(soberMatch[1]);
        if (soberDays > 0) {
          evaluations.push(`✅ SOBER DAYS: ${soberDays} days`);
        }
      }

      if (drinkingMatch) {
        const drinkingDays = parseInt(drinkingMatch[1]);
        if (drinkingDays > 0) {
          evaluations.push(`❌ DRINKING DAYS: ${drinkingDays} days`);
        }
      }
    }

    // Check for bodyweight (good when tracked)
    if (physicalCalText.includes("AVERAGE BODY WEIGHT:")) {
      const weightMatch = physicalCalText.match(
        /AVERAGE BODY WEIGHT: ([\d.]+) lbs/
      );
      if (weightMatch) {
        const weight = parseFloat(weightMatch[1]);
        evaluations.push(`✅ BODY WEIGHT: ${weight} lbs tracked`);
      }
    }
  }

  return evaluations;
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
    console.log(`\n📋 Processing: Personal Calendar + PRs`);
    console.log(`📊 Processing weeks: ${TARGET_WEEKS.join(", ")}`);

    const confirm = await askQuestion("Continue? (y/n): ");

    if (confirm.toLowerCase() !== "y") {
      console.log("❌ Cancelled by user");
      process.exit(0);
    }

    console.log(""); // Empty line before processing
  } else {
    // Command line mode - always include both
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
