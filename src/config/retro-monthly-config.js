/**
 * Monthly retro configuration
 * Controls detail display for monthly summaries AND monthly habit evaluation rules
 */

// CAL EVENTS detail control - based on summarize-personal-cal.js categories
const calEventDetails = [
  {
    displayName: "Personal Time",
    showDetails: false,
  },
  {
    displayName: "Interpersonal Time",
    showDetails: false,
  },
  {
    displayName: "Physical Health Time",
    showDetails: false,
  },
  {
    displayName: "Mental Health Time",
    showDetails: false,
  },
  {
    displayName: "Workout Events",
    showDetails: false,
  },
  {
    displayName: "Reading Time",
    showDetails: false,
  },
  {
    displayName: "Coding Time",
    showDetails: false,
  },
  {
    displayName: "Art Time",
    showDetails: false,
  },
  {
    displayName: "Video Game Time",
    showDetails: false,
  },
  {
    displayName: "Personal PR",
    showDetails: false,
  },
];

// TASKS detail control - show individual tasks vs just category totals
const taskDetails = [
  {
    displayName: "Personal Tasks",
    showDetails: false,
  },
  {
    displayName: "Physical Health Tasks",
    showDetails: false,
  },
  {
    displayName: "Interpersonal Tasks",
    showDetails: false,
  },
  {
    displayName: "Mental Health Tasks",
    showDetails: false,
  },
  {
    displayName: "Home Tasks",
    showDetails: true,
  },
];

// Monthly habit evaluation thresholds - MOVED FROM retro-extraction-config.js
const monthlyHabitEvals = {
  earlyWakeUp: {
    pattern: /(\d+)\s+early wake up,\s+(\d+)\s+days sleeping in/,
    goodPerWeek: 4,
    warningPerWeek: 2,
    emoji: "🛌",
    description: "sleeping habits",
  },
  daysSober: {
    pattern: /(\d+)\s+days sober,\s+(\d+)\s+days drinking/,
    goodPerWeek: 4,
    warningPerWeek: 2,
    emoji: "🍻",
    description: "drinking habits",
  },
  workouts: {
    pattern: /(\d+)\s+workouts/,
    goodPerWeek: 3,
    warningPerWeek: 1,
    emoji: "💪",
    description: "workout habits",
  },
  avgWeight: {
    pattern: /([\d.]+)\s+avg weight/,
    goodAbsolute: 195,
    warningAbsolute: 200,
    operator: "<=",
    emoji: "⚖️",
    description: "body weight",
  },
  // Hobby habits with complex scoring - fixed absolute thresholds
  hobbyHabits: {
    patterns: {
      coding: /(\d+)\s+days coding/,
      reading: /(\d+)\s+days reading/,
      art: /(\d+)\s+days making art/,
      gaming: /(\d+)\s+days playing video games/,
    },
    goodAbsolute: 5, // Fixed threshold, not scaled by weeks
    warningAbsolute: 1, // Fixed threshold, not scaled by weeks
    emoji: "📖",
    description: "hobby habits",
  },
};

module.exports = {
  calEventDetails,
  taskDetails,
  monthlyHabitEvals, // Export the habit evaluation rules
};
