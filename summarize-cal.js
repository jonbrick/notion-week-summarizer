const { Client } = require("@notionhq/client");
const Anthropic = require("@anthropic-ai/sdk");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  runInteractiveMode,
  rl,
} = require("./src/utils/cli-utils");
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
const DEFAULT_TARGET_WEEKS = [1]; // Default: just week 1

// 2️⃣ DEFAULT CATEGORIES TO PROCESS (all on by default)
const DEFAULT_ACTIVE_CATEGORIES = [
  "💼 Work",
  "💪 Physical Health",
  "🌱 Personal",
  "🍻 Interpersonal",
  "❤️ Mental Health",
  "🏠 Home",
];

// ========================================
// These will be set either from defaults or user input
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let ACTIVE_CATEGORIES = [...DEFAULT_ACTIVE_CATEGORIES];
let DRY_RUN = false;

// Load context file (optional - will work without it)
let CONTEXT = "";
try {
  CONTEXT = fs.readFileSync("./context.md", "utf8");
  console.log("📖 Loaded context file");
} catch (error) {
  console.log(
    "📝 No context file found - create context.md to add definitions and style rules"
  );
}

// Calendar configuration mapping
const CALENDAR_MAPPING = {
  // Work Category - Direct mapping
  work: {
    calendars: [
      { id: process.env.WORK_CALENDAR_ID, name: "Work Calendar" },
      { id: process.env.WORK_PR_DATA_CALENDAR_ID, name: "💾 PR Data - Work" },
    ].filter((cal) => cal.id),
    authType: "work",
    summaryField: "Work Calendar Summary",
    aiClassification: false,
    notionValue: "💼 Work",
  },

  // Personal Category - Direct mapping
  personal: {
    calendars: [
      {
        id: process.env.PERSONAL_GITHUB_DATA_CALENDAR_ID,
        name: "💾 GitHub Data - Personal",
      },
      { id: process.env.VIDEO_GAMES_CALENDAR_ID, name: "🎮 Video Games" },
      { id: process.env.READ_CALENDAR_ID, name: "📖 Read" },
      { id: process.env.TRAVEL_CALENDAR_ID, name: "✈️ Travel" },
    ].filter((cal) => cal.id),
    authType: "personal",
    summaryField: "Personal Calendar Summary",
    aiClassification: false,
    notionValue: "🌱 Personal",
  },

  // Physical Health Category - Direct mapping
  physicalHealth: {
    calendars: [
      { id: process.env.WORKOUT_CALENDAR_ID, name: "💪 Workouts" },
      { id: process.env.WAKE_UP_EARLY_CALENDAR_ID, name: "☀️ Wake up early" },
      { id: process.env.SLEEP_IN_CALENDAR_ID, name: "🛌 Sleep in" },
      { id: process.env.SOBER_DAYS_CALENDAR_ID, name: "🚰 Sober days" },
      { id: process.env.DRINKING_DAYS_CALENDAR_ID, name: "🍻 Drinking days" },
      { id: process.env.BODY_WEIGHT_CALENDAR_ID, name: "⚖️ Body weight" },
    ].filter((cal) => cal.id),
    authType: "personal",
    summaryField: "Physical Health Calendar Summary",
    aiClassification: false,
    notionValue: "💪 Physical Health",
  },

  // Multi-category calendar - Requires AI classification
  personalMultiCategory: {
    calendars: [
      { id: process.env.PERSONAL_CALENDAR_ID, name: "📅 Personal Calendar" },
    ].filter((cal) => cal.id),
    authType: "personal",
    aiClassification: true,
    targetCategories: [
      {
        category: "interpersonal",
        summaryField: "Interpersonal Calendar Summary",
        promptContext: "interpersonal activities",
        notionValue: "🍻 Interpersonal",
      },
      {
        category: "mentalHealth",
        summaryField: "Mental Health Calendar Summary",
        promptContext: "mental health and self-care activities",
        notionValue: "❤️ Mental Health",
      },
      {
        category: "home",
        summaryField: "Home Calendar Summary",
        promptContext: "home and household activities",
        notionValue: "🏠 Home",
      },
      {
        category: "personalFallback",
        summaryField: "Personal Calendar Summary",
        promptContext: "personal activities and time",
        notionValue: "🌱 Personal",
      },
    ],
  },
};

// Calendar categories configuration
const ALL_CALENDAR_CATEGORIES = [
  {
    notionValue: "💼 Work",
    summaryField: "Work Calendar Summary",
    promptContext: "work activity",
  },
  {
    notionValue: "💪 Physical Health",
    summaryField: "Physical Health Calendar Summary",
    promptContext: "health activity",
  },
  {
    notionValue: "🌱 Personal",
    summaryField: "Personal Calendar Summary",
    promptContext: "personal activity",
  },
  {
    notionValue: "🍻 Interpersonal",
    summaryField: "Interpersonal Calendar Summary",
    promptContext: "interpersonal activity",
  },
  {
    notionValue: "❤️ Mental Health",
    summaryField: "Mental Health Calendar Summary",
    promptContext: "mental health activity",
  },
  {
    notionValue: "🏠 Home",
    summaryField: "Home Calendar Summary",
    promptContext: "home activity",
  },
];

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
    const recapPages = await notion.databases.query({
      database_id: RECAP_DATABASE_ID,
    });

    // Find target week by looking at page titles with smart padding
    let targetWeekPage = null;
    const paddedWeek = targetWeek.toString().padStart(2, "0");

    for (const page of recapPages.results) {
      const titleProperty = page.properties["Week Recap"];
      if (titleProperty && titleProperty.title) {
        const title = titleProperty.title.map((t) => t.plain_text).join("");

        if (
          title === `Week ${targetWeek} Recap` ||
          title === `Week ${paddedWeek} Recap` ||
          title === `Week ${targetWeek}` ||
          title === `Week ${paddedWeek}`
        ) {
          targetWeekPage = page;
          console.log(`✅ Found Week ${paddedWeek} Recap!`);
          break;
        }
      }
    }

    if (!targetWeekPage) {
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
      const eventDescriptions = categoryData.events.map((event) => {
        const title = event.summary || "Untitled event";
        const description = event.description ? ` - ${event.description}` : "";
        return `${title}${description}`;
      });

      const summary = await generateAISummary(
        eventDescriptions,
        category.promptContext
      );
      summaryUpdates[category.summaryField] = summary;

      console.log(`   ${category.notionValue}: Generated summary`);
    }

    // 7. Update all summaries at once
    if (DRY_RUN) {
      console.log("\n🔍 DRY RUN MODE - Would update these summaries:");
      for (const [field, summary] of Object.entries(summaryUpdates)) {
        console.log(`   ${field}: ${summary}`);
      }
      console.log("   (No changes made to Notion)");
    } else {
      await updateAllSummaries(targetWeekPage.id, summaryUpdates);
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

    return response.data.items || [];
  } catch (error) {
    console.error(
      `❌ Error fetching calendar events from ${calendarId}:`,
      error.message
    );
    return [];
  }
}

async function classifyCalendarEvent(event, targetCategories) {
  // Build prompt with optional context
  let prompt = "";

  if (CONTEXT) {
    prompt += `CONTEXT FOR BETTER CLASSIFICATION:
${CONTEXT}

---

`;
  }

  const eventTitle = event.summary || "Untitled event";
  const eventDescription = event.description || "";
  const eventText = `${eventTitle}${
    eventDescription ? ` - ${eventDescription}` : ""
  }`;

  prompt += `Classify this calendar event into exactly ONE of these categories:

CATEGORIES:
- 🍻 Interpersonal (social activities, friends, family, relationships)
- ❤️ Mental Health (therapy, meditation, self-care, relaxation)
- 🏠 Home (household tasks, cleaning, organizing, home maintenance)
- 🌱 Personal (learning, hobbies, personal projects, general personal time)

EVENT: "${eventText}"

Respond with ONLY the exact category text including the emoji. For example: "🍻 Interpersonal"`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 30,
      messages: [{ role: "user", content: prompt }],
    });

    const classification = message.content[0].text.trim();

    // Validate classification and return the corresponding notionValue
    for (const targetCategory of targetCategories) {
      if (classification === targetCategory.notionValue) {
        return targetCategory.notionValue;
      }
    }

    // Default fallback
    return "🌱 Personal";
  } catch (error) {
    console.error(
      `   ❌ Classification error for "${eventTitle}": ${error.message}`
    );
    return "🌱 Personal";
  }
}

async function generateAISummary(eventDescriptions, promptContext) {
  // Build prompt with optional context
  let prompt = "";

  if (CONTEXT) {
    prompt += `CONTEXT FOR BETTER SUMMARIES:
${CONTEXT}

---

`;
  }

  prompt += `Convert these calendar ${promptContext}s into a concise summary. I need clear, professional language that respects my time - no fluff or unnecessary words.

RULES:
- 1-3 sentences maximum (4+ is too much)
- Group similar/related items together when possible
- Professional, direct language - not casual
- Be matter-of-fact and neutral - no judgment about outcomes
- Focus on WHAT I did and WHERE I spent my time, not how well I did it
- NO bullet points, NO lists, NO line breaks
- Cut all unnecessary words - be efficient

CALENDAR EVENTS TO SUMMARIZE:
${eventDescriptions.map((desc) => `${desc}`).join("\n")}

Return 1-3 concise sentences combining these activities:`;

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 80,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].text.trim();
}

async function updateAllSummaries(pageId, summaryUpdates) {
  const properties = {};

  // Convert summaries to Notion property format
  for (const [fieldName, summary] of Object.entries(summaryUpdates)) {
    properties[fieldName] = {
      rich_text: [
        {
          text: {
            content: summary,
          },
        },
      ],
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties: properties,
  });
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
