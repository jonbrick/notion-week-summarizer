const { Client } = require("@notionhq/client");
const { google } = require("googleapis");
const fs = require("fs");
const {
  checkInteractiveMode,
  rl,
  askQuestion,
} = require("../../src/utils/cli-utils");
const {
  updateAllSummaries,
  findWeekRecapPage,
} = require("../../src/utils/notion-utils");
const { DEFAULT_TARGET_WEEKS } = require("../../src/config/task-config");
const { extractEventDuration } = require("../../src/utils/time-utils");
const { processWorkProjectEvents } = require("../../src/utils/pr-processor");
const { categorizeEventByColor } = require("../../src/utils/color-mappings");
const {
  createWorkAuth,
  fetchCalendarEventsWithAuth,
  validateAuthConfig,
} = require("../../src/utils/auth-utils");
require("dotenv").config();

// Initialize clients
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs
const RECAP_DATABASE_ID = process.env.RECAP_DATABASE_ID;
const WEEKS_DATABASE_ID = process.env.WEEKS_DATABASE_ID;

console.log("💼 Work Calendar Summary Generator");

// Script configuration
let TARGET_WEEKS = [...DEFAULT_TARGET_WEEKS];
let includeWorkCal = true; // Default to work calendar
let includePRs = true; // Always include PRs

// Interactive mode function
async function runInteractiveMode() {
  console.log("\n💼 Work Calendar Summary Generator");

  // Ask for weeks
  const weekInput = await askQuestion(
    "? Which weeks to process? (comma-separated, e.g., 26,27,28): "
  );
  let targetWeeks = [TARGET_WEEKS[0]]; // default
  if (weekInput.trim()) {
    targetWeeks = weekInput
      .split(",")
      .map((w) => parseInt(w.trim()))
      .filter((w) => !isNaN(w));
  }

  console.log(
    `\n📊 Generating work calendar summary for Week${
      targetWeeks.length > 1 ? "s" : ""
    }: ${targetWeeks.join(", ")}`
  );
  const confirm = await askQuestion("Continue? (y/n): ");

  if (confirm.toLowerCase() !== "y") {
    console.log("❌ Cancelled by user");
    rl.close();
    process.exit(0);
  }

  rl.close();
  return targetWeeks;
}

// Google Auth for Work
// Initialize work auth instance
let workAuth = null;

// Fetch calendar events with enhanced error handling
async function fetchCalendarEvents(calendarId, startDate, endDate) {
  try {
    // Initialize auth if not already done
    if (!workAuth) {
      // Validate configuration first
      if (!validateAuthConfig("work")) {
        console.error(
          "❌ Work calendar authentication not configured properly"
        );
        return [];
      }

      workAuth = createWorkAuth();
    }

    return await fetchCalendarEventsWithAuth(
      workAuth,
      calendarId,
      startDate,
      endDate
    );
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

function createEventObject(rawEvent, category, categoryName) {
  return {
    id: rawEvent.id,
    summary: rawEvent.summary || "No title",
    start: rawEvent.start?.dateTime || rawEvent.start?.date,
    end: rawEvent.end?.dateTime || rawEvent.end?.date,
    duration: extractEventDuration(rawEvent),
    category: category,
    categoryName: categoryName,
    description: rawEvent.description || "",
    attendees: rawEvent.attendees || [],
    location: rawEvent.location || "",
    colorId: rawEvent.colorId || "default",
    eventType: rawEvent.eventType || "default",
    responseStatus: getMyResponseStatus(rawEvent.attendees),
  };
}

// Get week date range and return the Week Recap page ID for updates
// This function finds the Week Recap page, gets the date range from the related Week page,
// but returns the Week Recap page ID so we can update summary properties
async function getWeekDateRange(weekNumber) {
  try {
    // 1. Find the week recap page
    const targetWeekPage = await findWeekRecapPage(
      notion,
      RECAP_DATABASE_ID,
      weekNumber
    );

    if (!targetWeekPage) {
      throw new Error(`Could not find Week ${weekNumber} Recap`);
    }

    // 2. Get the week relation
    const weekRelation = targetWeekPage.properties["⌛ Weeks"].relation;
    if (!weekRelation || weekRelation.length === 0) {
      throw new Error(`Week ${weekNumber} has no week relation`);
    }

    const weekPageId = weekRelation[0].id;

    // 3. Get the week details for date range
    const weekPage = await notion.pages.retrieve({ page_id: weekPageId });
    const dateRange = weekPage.properties["Date Range (SET)"].date;

    if (!dateRange) {
      throw new Error(`Week ${weekNumber} has no date range`);
    }

    const startDate = dateRange.start;
    const endDate = dateRange.end;

    return {
      startDate,
      endDate,
      weekPageId: targetWeekPage.id, // Return the Week Recap page ID (which has summary properties), not the Week page ID
    };
  } catch (error) {
    console.error(`❌ Error getting week date range:`, error.message);
    throw error;
  }
}

// Format events for Notion
function formatEventsForNotion(events, categoryKey) {
  if (!events || events.length === 0) {
    return "";
  }

  const categoryNames = {
    meetings: "Meetings",
    reviews: "Code Reviews",
    planning: "Planning",
    demos: "Demos/Presentations",
    hiring: "Hiring",
    urgent: "Urgent",
    important: "Important",
    normal: "Normal",
    good: "Good",
    info: "Info",
    creative: "Creative",
    work: "Work",
  };

  const categoryName = categoryNames[categoryKey] || categoryKey;
  const totalDuration = events.reduce((sum, event) => sum + event.duration, 0);
  const hours = Math.round((totalDuration / 60) * 10) / 10;

  let formatted = `${categoryName}: ${events.length} events (${hours}h)\n`;

  events.forEach((event) => {
    const eventHours = Math.round((event.duration / 60) * 10) / 10;
    formatted += `• ${event.summary} (${eventHours}h)\n`;
  });

  return formatted.trim();
}

// Build work summaries for each category
function buildWorkSummariesByCategory(workEvents, startDate, endDate) {
  if (!workEvents || workEvents.length === 0) {
    return {
      default: {
        summary:
          "DEFAULT WORK (0 events, 0 hours):\nNo Default Work events this week",
        categoryStats: {},
        totalHours: 0,
      },
      design: {
        summary:
          "DESIGN WORK (0 events, 0 hours):\nNo Design Work events this week",
        categoryStats: {},
        totalHours: 0,
      },
      coding: {
        summary:
          "CODING & TICKETS (0 events, 0 hours):\nNo Coding & Tickets events this week",
        categoryStats: {},
        totalHours: 0,
      },
      review: {
        summary:
          "REVIEW & FEEDBACK (0 events, 0 hours):\nNo Review & Feedback events this week",
        categoryStats: {},
        totalHours: 0,
      },
      qa: {
        summary:
          "DESIGN & DEV QA (0 events, 0 hours):\nNo Design & Dev QA events this week",
        categoryStats: {},
        totalHours: 0,
      },
      rituals: {
        summary: "RITUALS (0 events, 0 hours):\nNo Rituals events this week",
        categoryStats: {},
        totalHours: 0,
      },
      research: {
        summary: "RESEARCH (0 events, 0 hours):\nNo Research events this week",
        categoryStats: {},
        totalHours: 0,
      },
    };
  }

  // Group events by category
  const eventsByCategory = {};
  workEvents.forEach((event) => {
    if (!eventsByCategory[event.category]) {
      eventsByCategory[event.category] = [];
    }
    eventsByCategory[event.category].push(event);
  });

  // Build summaries for each category
  const summaries = {};

  // Default Work Cal - filter out OOO/PTO events
  const defaultEvents = eventsByCategory["default"] || [];
  const filteredDefaultEvents = defaultEvents.filter((event) => {
    const eventTitle = event.summary.toLowerCase();
    return !(
      eventTitle.includes("out of office") ||
      eventTitle.includes("ooo") ||
      eventTitle.includes("vacation") ||
      eventTitle.includes("pto") ||
      eventTitle.includes("jb ooo")
    );
  });
  summaries.default = buildCategorySummary(
    filteredDefaultEvents,
    "Default Work",
    startDate,
    endDate
  );

  // Design Work Cal
  const designEvents = eventsByCategory["design"] || [];
  summaries.design = buildCategorySummary(
    designEvents,
    "Design Work",
    startDate,
    endDate
  );

  // Coding & Tickets Cal
  const codingEvents = eventsByCategory["coding"] || [];
  summaries.coding = buildCategorySummary(
    codingEvents,
    "Coding & Tickets",
    startDate,
    endDate
  );

  // Review, Feedback, Crit Cal
  const reviewEvents = eventsByCategory["review"] || [];
  summaries.review = buildCategorySummary(
    reviewEvents,
    "Review & Feedback",
    startDate,
    endDate
  );

  // Design & Dev QA Cal
  const qaEvents = eventsByCategory["qa"] || [];
  summaries.qa = buildCategorySummary(
    qaEvents,
    "Design & Dev QA",
    startDate,
    endDate
  );

  // Rituals Cal
  const ritualsEvents = eventsByCategory["rituals"] || [];
  summaries.rituals = buildCategorySummary(
    ritualsEvents,
    "Rituals",
    startDate,
    endDate
  );

  // Research Cal
  const researchEvents = eventsByCategory["research"] || [];
  summaries.research = buildCategorySummary(
    researchEvents,
    "Research",
    startDate,
    endDate
  );

  return summaries;
}

// Helper function to determine if we should add attendees to an event title
function shouldAddAttendees(event) {
  if (!event.attendees || event.attendees.length === 0) {
    return false;
  }

  const eventTitle = event.summary.toLowerCase();

  // Rule 1: If "Jon" is in the invite title, don't add attendees
  if (eventTitle.includes("jon")) {
    return false;
  }

  // Get other attendees (excluding yourself)
  const otherAttendees = event.attendees.filter((attendee) => !attendee.self);

  // Rule 2: If more than 4 attendees, don't add attendees
  if (otherAttendees.length > 4) {
    return false;
  }

  // Rule 3: Check for team emails (like insights@cortex.io)
  const hasTeamAttendees = event.attendees.some((attendee) => {
    const email = attendee.email || attendee.displayName || "";

    // Check if it's an email address
    if (email.includes("@")) {
      const emailPrefix = email.split("@")[0];

      // Team emails typically don't have personal name patterns
      // Personal: "chelsea.hohmann", "john.doe", "sarah.smith"
      // Team: "insights", "engineering", "support", "team"

      // If email prefix doesn't contain a dot or personal name patterns, likely a team
      if (!emailPrefix.includes(".")) {
        return true; // insights@cortex.io, team@cortex.io, etc.
      }

      // Check if it looks like a personal name (firstname.lastname pattern)
      const parts = emailPrefix.split(".");
      if (parts.length === 2) {
        // Both parts should look like names (letters only, reasonable length)
        const [first, last] = parts;
        const isPersonalName =
          first.length >= 2 &&
          first.length <= 15 &&
          last.length >= 2 &&
          last.length <= 15 &&
          /^[a-zA-Z]+$/.test(first) &&
          /^[a-zA-Z]+$/.test(last);

        return !isPersonalName; // If it doesn't look like a personal name, it's likely a team
      }

      // More than 2 parts or other patterns - likely team
      return parts.length !== 2;
    }

    return false;
  });

  // If there are team attendees, don't add individual names
  if (hasTeamAttendees) {
    return false;
  }

  // If we get here, we should add attendees
  return true;
}

// Helper function to format attendee names
function formatAttendeeNames(attendees) {
  return attendees
    .filter((attendee) => !attendee.self) // Exclude yourself
    .map((attendee) => {
      let name = attendee.displayName || attendee.email || "Unknown";

      // Handle email addresses (extract first name from email)
      if (name.includes("@")) {
        const emailName = name.split("@")[0];
        // Convert email format to proper name (e.g., "chelsea.hohmann" -> "Chelsea")
        const firstName = emailName.split(".")[0];
        name =
          firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
      } else {
        // Handle regular names - get first name only
        name = name.split(" ")[0];
      }

      return name;
    })
    .filter((name) => name && name !== "Unknown" && name.length > 1);
}

// Build summary for a specific category
function buildCategorySummary(events, categoryName, startDate, endDate) {
  if (!events || events.length === 0) {
    return {
      summary: `${categoryName.toUpperCase()} (0 events, 0 hours):\nNo ${categoryName} events this week`,
      categoryStats: {},
      totalHours: 0,
    };
  }

  // Calculate stats
  const totalDuration = events.reduce((sum, event) => {
    const duration = event.duration?.minutes || 0;
    return sum + duration;
  }, 0);
  const totalHours = Math.round((totalDuration / 60) * 10) / 10;

  const categoryStats = {
    [categoryName.toLowerCase().replace(/\s+/g, "_")]: {
      count: events.length,
      hours: totalHours,
      events: events,
    },
  };

  // Build summary text with new format
  let summary = `${categoryName.toUpperCase()} (${events.length} ${
    events.length === 1 ? "event" : "events"
  }, ${totalHours} ${totalHours === 1 ? "hour" : "hours"}):\n`;

  // Sort events chronologically (earliest to latest)
  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.start);
    const dateB = new Date(b.start);
    return dateA.getTime() - dateB.getTime();
  });

  // Add events
  sortedEvents.forEach((event) => {
    const eventMinutes = event.duration?.minutes || 0;
    const eventHours = Math.round((eventMinutes / 60) * 10) / 10;

    // Enhance event title with attendee names based on new rules
    let enhancedTitle = event.summary;

    if (shouldAddAttendees(event)) {
      const attendeeNames = formatAttendeeNames(event.attendees);
      if (attendeeNames.length > 0) {
        enhancedTitle = `${event.summary} with ${attendeeNames.join(", ")}`;
      }
    }

    summary += `• ${enhancedTitle} (${eventHours}h)\n`;
  });

  return {
    summary: summary.trim(),
    categoryStats,
    totalHours,
  };
}

// Check for OOO events
function detectOOOEvents(workEvents) {
  const oooEvents = workEvents.filter(
    (event) =>
      event.summary.toLowerCase().includes("out of office") ||
      event.summary.toLowerCase().includes("ooo") ||
      event.summary.toLowerCase().includes("vacation") ||
      event.summary.toLowerCase().includes("pto") ||
      event.summary.toLowerCase().includes("jb ooo") ||
      event.summary.toLowerCase().includes("jb ooo") ||
      event.summary.toLowerCase().includes("out of office")
  );

  // Calculate actual OOO days by checking start and end dates
  const oooDays = new Set();

  oooEvents.forEach((event) => {
    // Parse dates more carefully to handle timezone issues
    let startDate, endDate;

    if (event.start.includes("T")) {
      // Time-specific event
      startDate = new Date(event.start);
      endDate = new Date(event.end);
    } else {
      // All-day event - parse date components directly to avoid timezone issues
      const startParts = event.start.split("-").map(Number);
      const endParts = event.end.split("-").map(Number);

      // Create dates using UTC to avoid timezone shifts
      startDate = new Date(
        Date.UTC(startParts[0], startParts[1] - 1, startParts[2])
      );
      endDate = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]));

      // For all-day events, the end date is exclusive, so we need to handle it differently
      endDate.setUTCDate(endDate.getUTCDate() - 1);
    }

    // Iterate through the date range
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      // Only count weekdays (Monday = 1, Sunday = 0)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        // Use UTC date string to avoid timezone issues
        const dateStr = currentDate.toISOString().split("T")[0];
        oooDays.add(dateStr);
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  // Convert to sorted array of dates
  const sortedOOODays = Array.from(oooDays).sort();

  // Format OOO days for display - parse dates using UTC to avoid timezone issues
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const formattedOOODays = sortedOOODays.map((dateStr) => {
    // Parse date components directly to avoid timezone issues
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return dayNames[date.getUTCDay()];
  });

  return {
    isOOO: oooDays.size > 0,
    oooDays: oooDays.size,
    oooEvents: oooEvents,
    oooDayNames: formattedOOODays,
    oooDates: sortedOOODays,
  };
}

// Generate simplified Work Cal Summary
function generateSimplifiedWorkCalSummary(
  summaries,
  workPrSummary,
  workEvents
) {
  // Check for OOO events
  const oooInfo = detectOOOEvents(workEvents);

  // Calculate totals
  let totalHours = 0;
  let totalEvents = 0;
  const categoryHours = {};

  // Extract hours and events from each category
  Object.keys(summaries).forEach((category) => {
    const categoryData = summaries[category];
    categoryHours[category] = categoryData.totalHours || 0;
    totalHours += categoryData.totalHours || 0;

    // Count events from the summary
    const eventMatch = categoryData.summary.match(/\((\d+) events?/);
    if (eventMatch) {
      totalEvents += parseInt(eventMatch[1]);
    }
  });

  // Extract PR information
  let prCount = 0;
  let commitCount = 0;
  if (workPrSummary && !workPrSummary.includes("No work project commits")) {
    const prMatch = workPrSummary.match(/PRs \((\d+) PRs?, (\d+) commits?\):/);
    if (prMatch) {
      prCount = parseInt(prMatch[1]);
      commitCount = parseInt(prMatch[2]);
    }
  }

  // Build summary
  let summary = "";

  // Add OOO section first if present
  if (oooInfo.isOOO) {
    summary += "===== OOO =====\n";
    summary += `🏝️ OOO: ${oooInfo.oooDays} Day${
      oooInfo.oooDays > 1 ? "s" : ""
    } (${oooInfo.oooDayNames.join(", ")})\n\n`;
  }

  summary += "===== SUMMARY =====\n";
  summary += `Total: ${totalHours.toFixed(1)} hours (${totalEvents} events)\n`;

  // Only show category breakdowns if not fully OOO (less than 5 days OOO)
  if (!oooInfo.isOOO || oooInfo.oooDays < 5) {
    // Add category breakdowns in order
    const designHours = categoryHours.design || 0;
    const designPercent =
      totalHours > 0 ? Math.round((designHours / totalHours) * 100) : 0;
    const designEmoji = designHours > 0 ? "✅" : "❌";
    summary += `${designEmoji} Design: ${designHours.toFixed(
      1
    )} hours (${designPercent}%)\n`;

    // Coding
    const codingHours = categoryHours.coding || 0;
    const codingPercent =
      totalHours > 0 ? Math.round((codingHours / totalHours) * 100) : 0;
    const codingEmoji = codingHours > 0 ? "✅" : "❌";
    summary += `${codingEmoji} Coding: ${codingHours.toFixed(
      1
    )} hours (${codingPercent}%)\n`;

    // Research
    const researchHours = categoryHours.research || 0;
    const researchPercent =
      totalHours > 0 ? Math.round((researchHours / totalHours) * 100) : 0;
    const researchEmoji = researchHours > 0 ? "✅" : "❌";
    summary += `${researchEmoji} Research: ${researchHours.toFixed(
      1
    )} hours (${researchPercent}%)\n`;

    // Review
    const reviewHours = categoryHours.review || 0;
    const reviewPercent =
      totalHours > 0 ? Math.round((reviewHours / totalHours) * 100) : 0;
    const reviewEmoji = reviewHours > 0 ? "✅" : "❌";
    summary += `${reviewEmoji} Review: ${reviewHours.toFixed(
      1
    )} hours (${reviewPercent}%)\n`;

    // QA
    const qaHours = categoryHours.qa || 0;
    const qaPercent =
      totalHours > 0 ? Math.round((qaHours / totalHours) * 100) : 0;
    const qaEmoji = qaHours > 0 ? "✅" : "❌";
    summary += `${qaEmoji} QA: ${qaHours.toFixed(1)} hours (${qaPercent}%)\n`;

    // Default
    const defaultHours = categoryHours.default || 0;
    const defaultPercent =
      totalHours > 0 ? Math.round((defaultHours / totalHours) * 100) : 0;
    const defaultEmoji = "☑️";
    summary += `${defaultEmoji} Default: ${defaultHours.toFixed(
      1
    )} hours (${defaultPercent}%)\n`;

    // Rituals
    const ritualsHours = categoryHours.rituals || 0;
    const ritualsPercent =
      totalHours > 0 ? Math.round((ritualsHours / totalHours) * 100) : 0;
    const ritualsEmoji = ritualsPercent > 20 ? "⚠️" : "☑️";
    summary += `${ritualsEmoji} Rituals: ${ritualsHours.toFixed(
      1
    )} hours (${ritualsPercent}%)\n`;
  }

  // Combine similar meeting titles while preserving attendee names
  function combineSimilarMeetingsWithAttendees(meetingLines) {
    const meetingGroups = {};

    meetingLines.forEach((line) => {
      // Extract title and hours from the line
      const match = line.match(/• (.+?) \((\d+\.?\d*)h\)/);
      if (match) {
        let title = match[1];
        const hours = parseFloat(match[2]);

        // Clean up the title for grouping (but preserve attendee names)
        let cleanTitle = title;

        // Remove attendee names for grouping purposes only
        cleanTitle = cleanTitle.replace(/with [^,]+(?:, [^,]+)*/, "");
        cleanTitle = cleanTitle.replace(/Jon <> [^:]+ ::: /, "");
        cleanTitle = cleanTitle.replace(/^[^:]+ ::: /, "");

        // Remove additional context after + or ::
        cleanTitle = cleanTitle.replace(/\s*\+\s*[^,]+/, "");
        cleanTitle = cleanTitle.replace(/\s*::\s*[^,]+/, "");

        // Trim whitespace
        cleanTitle = cleanTitle.trim();

        // Convert to lowercase for matching duplicates
        const cleanTitleLower = cleanTitle.toLowerCase();

        if (!meetingGroups[cleanTitleLower]) {
          meetingGroups[cleanTitleLower] = {
            title: cleanTitle, // Keep original case for display
            totalHours: 0,
            count: 0,
            originalTitles: [],
            attendeeGroups: [], // Track different attendee combinations
          };
        }

        meetingGroups[cleanTitleLower].totalHours += hours;
        meetingGroups[cleanTitleLower].count += 1;
        meetingGroups[cleanTitleLower].originalTitles.push(title);

        // Extract attendee information for this instance
        const attendeeMatch = title.match(/with (.+)$/);
        if (attendeeMatch) {
          const attendees = attendeeMatch[1];
          if (
            !meetingGroups[cleanTitleLower].attendeeGroups.includes(attendees)
          ) {
            meetingGroups[cleanTitleLower].attendeeGroups.push(attendees);
          }
        }
      }
    });

    // Convert back to formatted lines
    const combinedLines = Object.values(meetingGroups).map((group) => {
      const hours = Math.round(group.totalHours * 10) / 10;

      // If there are multiple attendee groups, combine them
      if (group.attendeeGroups.length > 0) {
        const allAttendees = group.attendeeGroups.join(", ");
        return `• ${group.title} with ${allAttendees} (${hours}h)`;
      } else {
        return `• ${group.title} (${hours}h)`;
      }
    });

    return combinedLines;
  }

  // Add meetings section
  summary += "\n===== MEETINGS =====\n";

  // Use the Default Work Cal content directly (which has proper attendee names)
  const defaultSummary = summaries.default.summary;
  if (
    defaultSummary &&
    !defaultSummary.includes("No Default Work events this week")
  ) {
    const lines = defaultSummary.split("\n");
    const meetingLines = lines.filter((line) => line.startsWith("• "));

    if (meetingLines.length > 0) {
      // Combine similar meetings while preserving attendee names
      const combinedMeetings =
        combineSimilarMeetingsWithAttendees(meetingLines);

      // Calculate total hours from the combined meetings
      const totalMeetingHours = combinedMeetings.reduce((total, line) => {
        const match = line.match(/\((\d+\.?\d*)h\)/);
        return total + (match ? parseFloat(match[1]) : 0);
      }, 0);

      summary += `${
        combinedMeetings.length
      } events, ${totalMeetingHours.toFixed(1)} hours\n`;

      // Use the combined meeting lines
      combinedMeetings.forEach((line) => {
        summary += `${line}\n`;
      });
    } else {
      summary += "0 events, 0.0 hours\n";
    }
  } else {
    summary += "0 events, 0.0 hours\n";
  }

  // Add PRs section
  summary += "\n===== PRs =====\n";
  if (workPrSummary && !workPrSummary.includes("No work project commits")) {
    // Extract PR titles from the Work PR Summary
    const lines = workPrSummary.split("\n");
    const prTitles = [];
    let currentPrTitle = null;

    lines.forEach((line) => {
      // Look for lines that contain [X commits] - these are PR titles
      if (line.match(/\[\d+ commits?\]/)) {
        // This is a PR title line
        currentPrTitle = line.trim();
      } else if (line === "---" && currentPrTitle) {
        // We hit a separator, so the previous title is complete
        prTitles.push(currentPrTitle);
        currentPrTitle = null;
      }
    });

    // Don't forget the last PR if there's no trailing separator
    if (currentPrTitle) {
      prTitles.push(currentPrTitle);
    }

    // Add PR summary header
    if (prCount > 0) {
      summary += `${prCount} shipped, ${commitCount} commits\n`;
    } else {
      summary += "0 shipped, 0 commits\n";
    }

    // Add PR titles as bullets
    if (prTitles.length > 0) {
      prTitles.forEach((title) => {
        summary += `• ${title}\n`;
      });
    } else {
      summary += "No PRs shipped this week\n";
    }
  } else {
    summary += "0 shipped, 0 commits\n";
  }

  return summary.trim();
}

// Generate work calendar evaluation
function generateWorkCalEvaluation(
  existingCalSummary,
  workPrSummary,
  summaries,
  workEvents,
  notionUpdates
) {
  let evaluation = "===== EVALUATION =====\n";

  // Check for OOO days
  const oooEvents = workEvents.filter(
    (event) =>
      event.summary.toLowerCase().includes("out of office") ||
      event.summary.toLowerCase().includes("ooo") ||
      event.summary.toLowerCase().includes("vacation")
  );

  if (oooEvents.length > 0) {
    const oooDays = oooEvents.length;
    evaluation += `🏝️ OOO: ${oooDays} Day${oooDays > 1 ? "s" : ""}\n`;
  }

  // Calculate total hours and percentages for each category
  let totalHours = 0;
  const categoryHours = {};

  // Parse total hours from Default Work Cal
  const defaultWorkCal = summaries.default.summary;
  if (
    defaultWorkCal &&
    !defaultWorkCal.includes("No Default Work events this week")
  ) {
    // New format: DEFAULT WORK (X events, Y hours):
    const totalMatch = defaultWorkCal.match(
      /DEFAULT WORK \(\d+ events?, ([\d.]+) hours?\):/
    );
    if (totalMatch) {
      totalHours = parseFloat(totalMatch[1]);
    }
  }

  // Calculate hours for each category
  Object.keys(summaries).forEach((category) => {
    if (category !== "default" && summaries[category].totalHours > 0) {
      categoryHours[category] = summaries[category].totalHours;
    }
  });

  // Add meeting time threshold warning
  if (totalHours > 0) {
    const meetingHours = categoryHours.default || 0;
    const meetingPercentage = Math.round((meetingHours / totalHours) * 100);
    evaluation += `✅ MEETING TIME: ${meetingHours} hours (${meetingPercentage}%) [below 15 hour threshold]\n`;
  }

  // Add QA time
  const qaHours = categoryHours.qa || 0;
  if (qaHours > 0) {
    const qaPercentage =
      totalHours > 0 ? Math.round((qaHours / totalHours) * 100) : 0;
    evaluation += `✅ QA TIME: ${qaHours} hours (${qaPercentage}%)\n`;
  }

  // Add Review time
  const reviewHours = categoryHours.review || 0;
  if (reviewHours > 0) {
    const reviewPercentage =
      totalHours > 0 ? Math.round((reviewHours / totalHours) * 100) : 0;
    evaluation += `✅ REVIEW TIME: ${reviewHours} hours (${reviewPercentage}%)\n`;
  }

  // Add Design time
  const designHours = categoryHours.design || 0;
  if (designHours > 0) {
    const designPercentage =
      totalHours > 0 ? Math.round((designHours / totalHours) * 100) : 0;
    evaluation += `✅ DESIGN TIME: ${designHours} hours (${designPercentage}%)\n`;
  }

  // Add Coding time
  const codingHours = categoryHours.coding || 0;
  if (codingHours > 0) {
    const codingPercentage =
      totalHours > 0 ? Math.round((codingHours / totalHours) * 100) : 0;
    evaluation += `✅ CODING TIME: ${codingHours} hours (${codingPercentage}%)\n`;
  } else {
    evaluation += `❌ NO CODING TIME: 0 hours\n`;
  }

  // Add meeting details
  let meetingHours = 0;
  let meetingLines = [];
  if (
    defaultWorkCal &&
    !defaultWorkCal.includes("No Default Work events this week")
  ) {
    const lines = defaultWorkCal.split("\n");
    meetingLines = lines.filter((line) => line.startsWith("• "));

    if (meetingLines.length > 0) {
      // Calculate meeting hours from the events
      meetingLines.forEach((line) => {
        const timeMatch = line.match(/\(([\d.]+)h\)/);
        if (timeMatch) {
          meetingHours += parseFloat(timeMatch[1]);
        }
      });

      evaluation += `✅ MEETINGS:\n`;

      // Add meeting details
      meetingLines.forEach((line) => {
        evaluation += `  ${line}\n`;
      });
    } else {
      evaluation += `❌ NO MEETINGS: 0 hours this week\n`;
    }
  } else {
    evaluation += `❌ NO MEETINGS: 0 hours this week\n`;
  }

  // Check for PRs shipped (from Work PR Summary) - ALWAYS LAST
  if (workPrSummary && !workPrSummary.includes("No work project commits")) {
    // Parse PR count from the Work PR Summary
    const prMatch = workPrSummary.match(/Work PRs \((\d+) PRs?\):/);
    if (prMatch) {
      const prCount = parseInt(prMatch[1]);
      evaluation += `✅ PRs SHIPPED: ${prCount} PRs this week\n`;

      // Extract PR titles from the summary
      const lines = workPrSummary.split("\n");
      const prTitles = lines
        .filter((line) => line.startsWith("• "))
        .map((line) => line.replace("• ", ""));

      prTitles.forEach((title) => {
        evaluation += `• ${title}\n`;
      });
    }
  } else {
    evaluation += `❌ NO PRs SHIPPED: 0 PRs this week\n`;
  }

  return evaluation;
}

// Process a single week
async function processWeek(weekNumber) {
  try {
    console.log(`\n📅 Processing Week ${weekNumber}...`);

    // Get week date range
    const { startDate, endDate, weekPageId } = await getWeekDateRange(
      weekNumber
    );
    console.log(`📅 Date range: ${startDate} to ${endDate}`);

    // Fetch work calendar events
    console.log("📥 Fetching work calendar events...");
    const workCalendarId = process.env.WORK_CALENDAR_ID;
    if (!workCalendarId) {
      throw new Error("WORK_CALENDAR_ID not configured");
    }

    const workEvents = await fetchCalendarEvents(
      workCalendarId,
      startDate,
      endDate
    );
    console.log(`📊 Found ${workEvents.length} work events`);

    // Categorize work events
    const categorizedWorkEvents = workEvents.map((event) =>
      categorizeEventByColor(event, "work")
    );
    const workEventsOnly = categorizedWorkEvents.filter(
      (event) => event.category !== "ignored"
    );

    // Log categorization results
    const categoryCounts = {};
    workEventsOnly.forEach((event) => {
      categoryCounts[event.category] =
        (categoryCounts[event.category] || 0) + 1;
    });
    console.log(`📊 Event categorization:`, categoryCounts);

    // Build work summaries for each category
    console.log("📝 Building work summaries...");
    const summaries = buildWorkSummariesByCategory(
      workEventsOnly,
      startDate,
      endDate
    );

    // Process PRs if enabled
    let prSummary = [];
    if (includePRs) {
      console.log("🔍 Processing PRs...");
      try {
        prSummary = await processWorkProjectEvents(
          workEventsOnly,
          startDate,
          endDate
        );
        console.log(`📊 Found ${prSummary.length} PRs`);
      } catch (error) {
        console.error("❌ Error processing PRs:", error.message);
      }
    }

    // Fetch PR events from calendar (always included)
    let workPrSummary = "";
    if (process.env.WORK_PR_DATA_CALENDAR_ID) {
      console.log("\n📥 Fetching Work PR events...");
      const prEvents = await fetchCalendarEvents(
        process.env.WORK_PR_DATA_CALENDAR_ID,
        startDate,
        endDate
      );

      if (prEvents.length > 0) {
        const prData = await processWorkProjectEvents(prEvents);

        // If prData is a string (new detailed format), use it directly
        if (typeof prData === "string") {
          workPrSummary = prData;
        } else if (Array.isArray(prData) && prData.length > 0) {
          // Legacy format - convert to new format
          workPrSummary = `Work PRs (${prData.length} PR${
            prData.length !== 1 ? "s" : ""
          }):\n`;
          prData.forEach((pr, index) => {
            // Remove "brain-app -" from the title
            let cleanTitle = pr.title.replace(/^brain-app\s*-\s*/i, "");
            workPrSummary += `• ${cleanTitle}\n`;
          });
        } else {
          workPrSummary = "No work project commits this week.";
        }

        // Check if summary exceeds Notion's 2000 character limit
        if (workPrSummary.length > 2000) {
          console.log(
            `⚠️  Work PR summary too long (${workPrSummary.length} chars), truncating...`
          );

          // Find a good breaking point before 1950 chars (leaving room for "...")
          const maxLength = 1950;
          let truncateAt = workPrSummary.lastIndexOf("\n", maxLength);

          // If no newline found, just cut at maxLength
          if (truncateAt === -1 || truncateAt < maxLength - 200) {
            truncateAt = maxLength;
          }

          workPrSummary =
            workPrSummary.substring(0, truncateAt) +
            "\n\n... (truncated due to length)";
        }

        console.log(`🔄 Work PR Summary: ${prEvents.length} events`);
      } else {
        workPrSummary = "No work project commits this week.";
        console.log(`🔄 Work PR Summary: No events`);
      }
    }

    // Generate new simplified Work Cal Summary
    console.log("📊 Generating Work Cal Summary...");
    const fullSummary = generateSimplifiedWorkCalSummary(
      summaries,
      workPrSummary,
      workEventsOnly
    );

    // Log OOO information
    const oooInfo = detectOOOEvents(workEventsOnly);
    if (oooInfo.isOOO) {
      console.log(
        `🏝️ OOO detected: ${oooInfo.oooDays} days (${oooInfo.oooDayNames.join(
          ", "
        )})`
      );
    }

    // Update Notion with all work calendar fields
    console.log("📝 Updating Notion...");
    await updateAllSummaries(notion, weekPageId, {
      "Work Cal Summary": fullSummary,
      "Default Work Cal": summaries.default.summary,
      "Design Work Cal": summaries.design.summary,
      "Coding & Tickets Cal": summaries.coding.summary,
      "Review, Feedback, Crit Cal": summaries.review.summary,
      "Design & Dev QA Cal": summaries.qa.summary,
      "Rituals Cal": summaries.rituals.summary,
      "Research Cal": summaries.research.summary,
      "Work PR Summary": workPrSummary,
      "OOO Cal": oooInfo.isOOO
        ? `OOO (${oooInfo.oooEvents.length} events, ${
            oooInfo.oooDays
          } days):\n${oooInfo.oooDayNames.join(", ")}`
        : "OOO (0 events, 0 days):\nNo OOO events this week",
    });

    console.log(`✅ Week ${weekNumber} work calendar summary completed!`);
    return {
      weekNumber,
      workEvents: workEventsOnly.length,
      totalHours: summaries.default.totalHours,
      prs: prSummary.length,
      oooDays: oooInfo.oooDays,
    };
  } catch (error) {
    console.error(`❌ Error processing Week ${weekNumber}:`, error.message);
    throw error;
  }
}

// Process all weeks
async function processAllWeeks() {
  console.log(`\n🚀 Processing ${TARGET_WEEKS.length} week(s)...`);

  const results = [];
  for (const week of TARGET_WEEKS) {
    try {
      const result = await processWeek(week);
      results.push(result);
    } catch (error) {
      console.error(`❌ Failed to process Week ${week}:`, error.message);
    }
  }

  return results;
}

// Main function
async function main() {
  try {
    const args = process.argv.slice(2);

    // Check for interactive mode
    const result = await checkInteractiveMode(
      args,
      [], // No categories for this script
      TARGET_WEEKS,
      [] // No active categories
    );

    if (result.isInteractive) {
      TARGET_WEEKS = await runInteractiveMode();
    } else {
      TARGET_WEEKS = result.targetWeeks;
    }

    console.log(`\n💼 Work Calendar Summary Generator`);
    console.log(`📅 Target weeks: ${TARGET_WEEKS.join(", ")}`);
    console.log(`📊 Include work calendar: ${includeWorkCal}`);
    console.log(`🔍 Include PRs: ${includePRs}`);

    const results = await processAllWeeks();

    console.log(`\n🎉 Work calendar processing completed!`);
    console.log(`📊 Summary:`);
    results.forEach((result) => {
      console.log(
        `  Week ${result.weekNumber}: ${result.workEvents} events, ${
          Math.round(result.totalHours * 10) / 10
        }h, ${result.prs} PRs`
      );
    });
  } catch (error) {
    console.error("❌ Unhandled error:", error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Run it
main().catch((error) => {
  console.error("❌ Unhandled error:", error);
  process.exit(1);
});
