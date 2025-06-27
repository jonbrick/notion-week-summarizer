// Task configuration for week summarizer

// Task categories configuration
const ALL_TASK_CATEGORIES = [
  {
    notionValue: "💼 Work",
    summaryField: "Work Task Summary",
    promptContext: "work task",
  },
  {
    notionValue: "💪 Physical Health",
    summaryField: "Physical Health Task Summary",
    promptContext: "health task",
  },
  {
    notionValue: "🌱 Personal",
    summaryField: "Personal Task Summary",
    promptContext: "personal task",
  },
  {
    notionValue: "🍻 Interpersonal",
    summaryField: "Interpersonal Task Summary",
    promptContext: "interpersonal task",
  },
  {
    notionValue: "❤️ Mental Health",
    summaryField: "Mental Health Task Summary",
    promptContext: "mental health task",
  },
  {
    notionValue: "🏠 Home",
    summaryField: "Home Task Summary",
    promptContext: "home task",
  },
];

// Shared defaults for both scripts
const DEFAULT_TARGET_WEEKS = [1]; // Default: just week 1

const DEFAULT_ACTIVE_CATEGORIES = [
  "💼 Work",
  "💪 Physical Health",
  "🌱 Personal",
  "🍻 Interpersonal",
  "❤️ Mental Health",
  "🏠 Home",
];

module.exports = {
  ALL_TASK_CATEGORIES,
  DEFAULT_TARGET_WEEKS,
  DEFAULT_ACTIVE_CATEGORIES,
};
