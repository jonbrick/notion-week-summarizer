const { Client } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
} = require("./src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("./src/utils/notion-utils");
const {
  generateCalendarSummary,
  classifyCalendarEvent,
} = require("./src/utils/ai-utils");
const {
  CALENDAR_MAPPING,
  ALL_CALENDAR_CATEGORIES,
} = require("./src/config/calendar-config");
const {
  DEFAULT_TARGET_WEEKS,
  DEFAULT_ACTIVE_CATEGORIES,
} = require("./src/config/task-config");
require("dotenv").config();

// Configuration - using environment variables
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Initialize clients
const notion = new Client({ auth: NOTION_TOKEN });
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Database IDs - using environment variables
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

// ========================================
// ⭐ DEFAULT CONFIGURATION (BACKDOOR) ⭐
// ========================================

// 1️⃣ DEFAULT WEEKS TO PROCESS
// 2️⃣ DEFAULT CATEGORIES TO PROCESS (all on by default)

// ========================================
// These will be set either from defaults or user input
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let ACTIVE_CATEGORIES = [...DEFAULT_ACTIVE_CATEGORIES];
let DRY_RUN = false;

// Google Calendar authentication
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
  } else {
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
}

// Filter categories based on ACTIVE_CATEGORIES
function getActiveCategories() {
  return ALL_CALENDAR_CATEGORIES.filter((cat) =>
    ACTIVE_CATEGORIES.includes(cat.notionValue)
  );
}

async function generateAllWeekSummaries() {
  try {
    const CALENDAR_CATEGORIES = getActiveCategories();

    console.log(
      `🚀 Starting calendar summary generation for weeks: ${TARGET_WEEKS.join(
        ", "
      )}`
    );
    console.log(`📊 Processing ${TARGET_WEEKS.length} week(s)...`);
    console.log(
      `📋 Active categories: ${CALENDAR_CATEGORIES.map(
        (c) => c.notionValue
      ).join(", ")}\n`
    );

    if (DRY_RUN) {
      console.log("🔍 DRY RUN MODE - No changes will be made to Notion\n");
    }

    for (const weekNumber of TARGET_WEEKS) {
      console.log(`🗓️  === PROCESSING WEEK ${weekNumber} ===`);
      await generateWeekSummary(weekNumber);
    }

    console.log(
      `\n🎉 Successfully completed all ${TARGET_WEEKS.length} week(s)!`
    );
  } catch (error) {
    console.error("❌ Error in batch processing:", error);
  }
}

async function generateWeekSummary(targetWeek) {
  try {
    const CALENDAR_CATEGORIES = getActiveCategories();

    // 1. Get all recap pages and find target week
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      targetWeek
    );
    const paddedWeek = targetWeek.toString().padStart(2, "0");
    if (targetWeekPage) {
      console.log(`✅ Found Week ${paddedWeek} Recap!`);
    } else {
      console.log(`❌ Could not find Week ${targetWeek} Recap`);
      return;
    }

    // 2. Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      console.log(`❌ Week ${targetWeek} has no week relation`);
      return;
    }

    const weekPageId = weekRelation[0].id;

    // 3. Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });

    const dateRange = weekPage.properties["Date Range (SET)"].date;
    if (!dateRange) {
      console.log(`❌ Week ${targetWeek} has no date range`);
      return;
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;

    console.log(
      `📅 Week ${paddedWeek} date range: ${startDate} to ${endDate}\n`
    );

    // 4. NEW: Collect all calendar and event data first
    const calendarData = await collectCalendarData(
      CALENDAR_CATEGORIES,
      startDate,
      endDate
    );

    // 5. NEW: Display nice summary of what we found
    displayCalendarSummary(calendarData);

    // 6. Process summaries for each category
    console.log(`\n🔄 Processing summaries:`);
    const summaryUpdates = {};

    for (const category of CALENDAR_CATEGORIES) {
      const categoryData = calendarData[category.notionValue];

      if (!categoryData || categoryData.events.length === 0) {
        // Create short, clear empty message
        const categoryName = category.notionValue
          .replace(/💪|💼|🌱|🍻|❤️|🏠/g, "")
          .trim();
        summaryUpdates[
          category.summaryField
        ] = `No ${categoryName} calendar events this week.`;
        console.log(`   ${category.notionValue}: No events`);
        continue;
      }

      // Generate AI summary
      const eventDescriptions = categoryData.events
        .filter((event) => {
          const title = (event.summary || "").trim();

          // Filter out working location events
          const locationKeywords = [
            "home",
            "mc out",
            "office",
            "remote",
            "wfh",
            "work from home",
            "out of office",
            "ooo",
            "vacation",
            "sick",
            "personal day",
          ];
          const isLocationEvent = locationKeywords.some((keyword) =>
            title.toLowerCase().includes(keyword)
          );

          // Filter out the explicit event '🥗 Lunch (Can be moved!)'
          if (title === "🥗 Lunch (Can be moved!)") return false;

          // Keep event if it's not a location event
          return !isLocationEvent;
        })
        .map((event) => {
          const title = event.summary || "Untitled event";
          let description = event.description || "";

          // Clean up description: strip HTML tags and take only first line
          if (description) {
            // Remove HTML tags
            description = description.replace(/<[^>]*>/g, "");
            // Remove URLs
            description = description.replace(/https?:\/\/[^\s]+/g, "");
            // Remove extra whitespace and newlines
            description = description.replace(/\s+/g, " ").trim();

            // Remove common boilerplate phrases
            const boilerplatePhrases = [
              "is inviting you to a scheduled Zoom meeting",
              "Join Zoom Meeting",
              "──────────",
              "Agenda:",
              "Welcome to our bi-weekly product deep dive!",
              "The purpose of this meeting is to provide the front-line",
              "Meeting ID:",
              "ID:",
              "Passcode:",
              "tracker - Q4 2024",
              "customer teams with a comprehensive update on",
            ];

            boilerplatePhrases.forEach((phrase) => {
              description = description.replace(new RegExp(phrase, "gi"), "");
            });

            // Take only the first line (before any line breaks)
            const firstLine = description.split("\n")[0].split("\r")[0];

            // Smart truncation: cut at word boundaries, max 50 chars
            if (firstLine.length > 50) {
              const truncated = firstLine.substring(0, 50);
              const lastSpace = truncated.lastIndexOf(" ");
              if (lastSpace > 30) {
                // Only cut at word boundary if it's not too early
                description = truncated.substring(0, lastSpace) + "...";
              } else {
                description = truncated + "...";
              }
            } else {
              description = firstLine;
            }

            // Only add description if it's meaningful (not just whitespace)
            if (description && description !== "") {
              description = ` - ${description}`;
            } else {
              description = "";
            }
          }

          return `${title}${description}`;
        });

      console.log(`📝 Events to summarize:`, eventDescriptions);

      const summary = await generateCalendarSummary(
        eventDescriptions,
        category.promptContext
      );
      summaryUpdates[category.summaryField] = summary;

      console.log(`🤖 Generated summary: ${summary}`);
    }

    // 7. Update all summaries at once
    if (DRY_RUN) {
      console.log("\n🔍 DRY RUN MODE - Would update these summaries:");
      for (const [field, summary] of Object.entries(summaryUpdates)) {
        console.log(`   ${field}: ${summary}`);
      }
      console.log("   (No changes made to Notion)");
    } else {
      await updateAllSummaries(notion, targetWeekPage.id, summaryUpdates);
    }
    console.log(
      `\n✅ Successfully ${
        DRY_RUN ? "simulated" : "updated"
      } Week ${paddedWeek} recap with selected category summaries!`
    );
  } catch (error) {
    console.error(`❌ Error processing Week ${targetWeek}:`, error);
  }
}

async function collectCalendarData(categories, startDate, endDate) {
  const calendarData = {};
  const calendarSummary = {};
  let totalCalendars = 0;
  let totalEvents = 0;

  // Initialize data structure for ALL possible categories (not just active ones)
  // This is needed because AI classification might assign events to any category
  for (const category of ALL_CALENDAR_CATEGORIES) {
    calendarData[category.notionValue] = {
      calendars: [],
      events: [],
    };
  }

  // Collect data for each mapping
  for (const [mappingKey, mapping] of Object.entries(CALENDAR_MAPPING)) {
    // Count calendars for summary
    totalCalendars += mapping.calendars.length;

    if (!mapping.aiClassification) {
      // Direct mapping
      for (const category of categories) {
        if (mapping.notionValue === category.notionValue) {
          calendarData[category.notionValue].calendars = mapping.calendars.map(
            (cal) => cal.name
          );

          // Fetch events from all calendars in this mapping
          for (const calendar of mapping.calendars) {
            const events = await fetchCalendarEvents(
              calendar.id,
              mapping.authType,
              startDate,
              endDate
            );
            calendarData[category.notionValue].events.push(...events);
            totalEvents += events.length;
          }
        }
      }
    } else {
      // AI classification needed
      calendarData["🍻 Interpersonal"].calendars = mapping.calendars.map(
        (cal) => cal.name
      );

      for (const calendar of mapping.calendars) {
        const events = await fetchCalendarEvents(
          calendar.id,
          mapping.authType,
          startDate,
          endDate
        );

        // Classify each event
        for (const event of events) {
          const eventCategory = await classifyCalendarEvent(
            event,
            mapping.targetCategories
          );

          // Add event to appropriate category
          for (const category of categories) {
            if (category.notionValue === eventCategory) {
              calendarData[category.notionValue].events.push(event);
              totalEvents++;
              break;
            }
          }
        }
      }
    }
  }

  // Store summary info
  calendarSummary.totalCalendars = totalCalendars;
  calendarSummary.totalEvents = totalEvents;
  calendarData._summary = calendarSummary;

  return calendarData;
}

function displayCalendarSummary(calendarData) {
  const summary = calendarData._summary;

  console.log(`🔄 Found calendars: ${summary.totalCalendars}`);

  // Show calendars by category
  for (const [categoryName, data] of Object.entries(calendarData)) {
    if (categoryName === "_summary") continue;

    if (data.calendars.length > 0) {
      console.log(`   ${categoryName}: ${data.calendars.join(", ")}`);
    }
  }

  console.log(`\n🔄 Found events: ${summary.totalEvents}`);

  // Show event counts by category
  for (const [categoryName, data] of Object.entries(calendarData)) {
    if (categoryName === "_summary") continue;

    if (data.events.length > 0) {
      const sampleEvents = data.events
        .slice(0, 3)
        .map((e) => `'${e.summary || "Untitled"}'`);
      const sampleText = sampleEvents.join(", ");
      const moreText = data.events.length > 3 ? " ..." : "";
      console.log(
        `   ${categoryName}: ${data.events.length} [${sampleText}${moreText}]`
      );
    }
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

    const events = response.data.items || [];

    // Filter out events where user didn't RSVP or declined
    const filteredEvents = events.filter((event) => {
      // If no attendees, include the event (it's not a meeting with RSVPs)
      if (!event.attendees || event.attendees.length === 0) {
        return true;
      }

      // Find the user's attendance status
      const userAttendee = event.attendees.find(
        (attendee) => attendee.email === process.env.GOOGLE_CALENDAR_EMAIL
      );

      // If user is not in attendees list, include the event
      if (!userAttendee) {
        return true;
      }

      // Include only if user accepted or tentatively accepted
      const responseStatus = userAttendee.responseStatus;
      return responseStatus === "accepted" || responseStatus === "tentative";
    });

    return filteredEvents;
  } catch (error) {
    console.error(
      `❌ Error fetching calendar events from ${calendarId}:`,
      error.message
    );
    return [];
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const result = await checkInteractiveMode(
    args,
    ALL_CALENDAR_CATEGORIES,
    DEFAULT_TARGET_WEEKS,
    DEFAULT_ACTIVE_CATEGORIES
  );

  if (result.isInteractive) {
    const interactiveResult = await runInteractiveMode(
      ALL_CALENDAR_CATEGORIES,
      DEFAULT_TARGET_WEEKS,
      DEFAULT_ACTIVE_CATEGORIES,
      "📅 Notion Calendar Summary Generator"
    );
    TARGET_WEEKS = interactiveResult.targetWeeks;
    ACTIVE_CATEGORIES = interactiveResult.activeCategories;
    DRY_RUN = interactiveResult.dryRun;
  } else {
    TARGET_WEEKS = result.targetWeeks;
    ACTIVE_CATEGORIES = result.activeCategories;
    DRY_RUN = result.dryRun;
  }

  await generateAllWeekSummaries();
  if (rl && rl.close) rl.close();
}

// Run the script
main();
