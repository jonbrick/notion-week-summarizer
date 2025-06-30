// src/utils/time-utils.js
// Time utility functions for calendar event processing

/**
 * Calculate duration between two datetime strings in minutes
 * Handles timezone conversion automatically
 * @param {string} startDateTime - ISO datetime string (e.g., "2025-06-23T10:00:00-04:00")
 * @param {string} endDateTime - ISO datetime string
 * @returns {number} - Duration in minutes, or null if invalid
 */
function calculateEventDuration(startDateTime, endDateTime) {
  if (!startDateTime || !endDateTime) {
    return null;
  }

  try {
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);

    // Check if dates are valid
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return null;
    }

    // Calculate difference in milliseconds, then convert to minutes
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMinutes = Math.round(diffMs / (1000 * 60));

    // Ensure positive duration
    return diffMinutes > 0 ? diffMinutes : null;
  } catch (error) {
    console.error("Error calculating duration:", error);
    return null;
  }
}

/**
 * Convert minutes to human-readable format
 * @param {number} minutes - Duration in minutes
 * @returns {string} - Formatted duration (e.g., "2.5 hours", "30 minutes")
 */
function formatDuration(minutes) {
  if (!minutes || minutes <= 0) {
    return "0 minutes";
  }

  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = minutes / 60;

  // If it's a clean hour amount (2.0, 3.0, etc.)
  if (hours % 1 === 0) {
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  // If it's a half hour (2.5, 3.5, etc.)
  if (hours % 0.5 === 0) {
    return `${hours} hours`;
  }

  // For complex durations, round to nearest 0.25 hours
  const roundedHours = Math.round(hours * 4) / 4;
  return `${roundedHours} hours`;
}

/**
 * Check if an event is all-day based on the start/end structure
 * @param {object} event - Google Calendar event object
 * @returns {boolean} - True if all-day event
 */
function isAllDayEvent(event) {
  // All-day events use 'date' instead of 'dateTime'
  return event.start && event.start.date && !event.start.dateTime;
}

/**
 * Extract duration from a Google Calendar event
 * @param {object} event - Google Calendar event object
 * @returns {object} - {minutes: number, hours: number, formatted: string} or null
 */
function extractEventDuration(event) {
  if (isAllDayEvent(event)) {
    return {
      minutes: null,
      hours: null,
      formatted: "all day",
      isAllDay: true,
    };
  }

  const minutes = calculateEventDuration(
    event.start?.dateTime,
    event.end?.dateTime
  );

  if (minutes === null) {
    return null;
  }

  return {
    minutes: minutes,
    hours: minutes / 60,
    formatted: formatDuration(minutes),
    isAllDay: false,
  };
}

module.exports = {
  calculateEventDuration,
  formatDuration,
  isAllDayEvent,
  extractEventDuration,
};
