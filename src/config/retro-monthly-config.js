/**
 * Monthly retro configuration
 * Controls detail display for monthly summaries - toggle on/off when output gets too verbose
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

module.exports = {
  calEventDetails,
  taskDetails,
};
