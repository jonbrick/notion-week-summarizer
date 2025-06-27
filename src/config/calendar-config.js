// Calendar configuration for week summarizer

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

module.exports = {
  CALENDAR_MAPPING,
  ALL_CALENDAR_CATEGORIES,
};
