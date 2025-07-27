// Color mappings for Google Calendar events to Notion fields
// This file centralizes the color-to-field mappings for both work and personal calendars

// Work Calendar Color Mappings
const WORK_COLOR_MAPPING = {
  8: { category: "personal", name: "Personal Event Cal" }, // Gray
  3: { category: "coding", name: "Coding & Tickets Cal" }, // Purple
  2: { category: "design", name: "Design Work Cal" }, // Green
  5: { category: "review", name: "Review, Feedback, Crit Cal" }, // Yellow
  11: { category: "qa", name: "Design & Dev QA Cal" }, // Red
  9: { category: "rituals", name: "Rituals Cal" }, // New color
  1: { category: "research", name: "Research Cal" }, // Research color
};

// Personal Calendar Color Mappings
const PERSONAL_COLOR_MAPPING = {
  2: { category: "personal", name: "Personal Cal" }, // Sage/Green
  3: { category: "interpersonal", name: "Interpersonal Cal" }, // Purple
  5: { category: "home", name: "Home Cal" }, // Yellow
  8: { category: "physicalHealth", name: "Physical Health Cal" }, // Gray
  11: { category: "mentalHealth", name: "Mental Health Cal" }, // Red
};

// Work Calendar Field Mappings (category to Notion field name)
const WORK_FIELD_MAPPING = {
  default: "Default Work Cal",
  design: "Design Work Cal",
  coding: "Coding & Tickets Cal",
  review: "Review, Feedback, Crit Cal",
  qa: "Design & Dev QA Cal",
  rituals: "Rituals Cal",
  research: "Research Cal",
  summary: "Work Cal Summary",
};

// Personal Calendar Field Mappings (category to Notion field name)
const PERSONAL_FIELD_MAPPING = {
  personal: "Personal Cal",
  interpersonal: "Interpersonal Cal",
  home: "Home Cal",
  mentalHealth: "Mental Health Cal",
  physicalHealth: "Physical Health Cal",
  summary: "Personal Cal Summary",
};

// Helper function to get color mapping based on calendar type
function getColorMapping(calendarType) {
  switch (calendarType) {
    case "work":
      return WORK_COLOR_MAPPING;
    case "personal":
      return PERSONAL_COLOR_MAPPING;
    default:
      throw new Error(`Unknown calendar type: ${calendarType}`);
  }
}

// Helper function to get field mapping based on calendar type
function getFieldMapping(calendarType) {
  switch (calendarType) {
    case "work":
      return WORK_FIELD_MAPPING;
    case "personal":
      return PERSONAL_FIELD_MAPPING;
    default:
      throw new Error(`Unknown calendar type: ${calendarType}`);
  }
}

// Helper function to categorize event by color
function categorizeEventByColor(rawEvent, calendarType) {
  const colorId = rawEvent.colorId || "default";
  const eventType = rawEvent.eventType || "default";
  const responseStatus = getMyResponseStatus(rawEvent.attendees);

  // EventType filters
  if (eventType === "outOfOffice") {
    return createEventObject(rawEvent, "ignored", "Out of Office");
  }
  if (eventType === "workingLocation") {
    return createEventObject(rawEvent, "ignored", "Working Location");
  }

  // RSVP filter - declined meetings go to ignored
  if (responseStatus === "declined") {
    return createEventObject(rawEvent, "ignored", "Declined Event");
  }

  // Color-based categorization
  const colorMapping = getColorMapping(calendarType);
  const colorInfo = colorMapping[colorId];

  if (colorInfo) {
    return createEventObject(rawEvent, colorInfo.category, colorInfo.name);
  }

  // Default fallback for unmapped colors
  const defaultCategory = calendarType === "work" ? "default" : "personal";
  const defaultName =
    calendarType === "work" ? "Default Work Cal" : "Personal Cal";
  return createEventObject(rawEvent, defaultCategory, defaultName);
}

// Import helper functions from time-utils
const { extractEventDuration } = require("./time-utils");

// Helper function to get response status
function getMyResponseStatus(attendees) {
  if (!attendees || attendees.length === 0) {
    return null;
  }

  const myAttendance = attendees.find((attendee) => attendee.self === true);
  return myAttendance ? myAttendance.responseStatus : null;
}

// Helper function to create event object
function createEventObject(rawEvent, category, categoryName) {
  return {
    id: rawEvent.id,
    summary: rawEvent.summary || "No title",
    start: rawEvent.start?.dateTime || rawEvent.start?.date,
    end: rawEvent.end?.dateTime || rawEvent.end?.date,
    duration: extractEventDuration(rawEvent.start, rawEvent.end),
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

module.exports = {
  WORK_COLOR_MAPPING,
  PERSONAL_COLOR_MAPPING,
  WORK_FIELD_MAPPING,
  PERSONAL_FIELD_MAPPING,
  getColorMapping,
  getFieldMapping,
  categorizeEventByColor,
};
