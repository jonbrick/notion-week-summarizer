/**
 * Unified configuration for retro-personal-good.js and retro-personal-bad.js
 *
 * This config drives which sections appear in "What went well" vs "What didn't go so well"
 * and defines the criteria for determining good vs bad items within each section.
 */

module.exports = {
  // Order that sections appear in the final output
  sectionOrder: [
    "TRIPS",
    "EVENTS",
    "ROCKS",
    "HABITS",
    "CAL_SUMMARY",
    "CAL_EVENTS",
    "TASKS",
  ],

  // Data sources from Notion
  dataSources: {
    taskSummary: "Personal Task Summary",
    calSummary: "Personal Cal Summary",
  },

  // Section-level configuration - pure data/rules only
  sections: {
    TRIPS: {
      includeInGood: true,
      alwaysShowGoodSection: true,
      includeInBad: false,
      alwaysShowBadSection: false,
      emptyMessage: "No trips this week",
      title: "TRIPS",
    },

    EVENTS: {
      includeInGood: true,
      alwaysShowGoodSection: true,
      includeInBad: true,
      alwaysShowBadSection: false,
      emptyMessage: "No events this week",
      title: "EVENTS",
    },

    ROCKS: {
      includeInGood: true,
      alwaysShowGoodSection: false,
      includeInBad: true,
      alwaysShowBadSection: false,
      emptyMessage: "No rocks this week",
      title: "ROCKS",
    },

    HABITS: {
      includeInGood: true,
      alwaysShowGoodSection: false,
      includeInBad: true,
      alwaysShowBadSection: false,
      emptyMessage: "No habits tracked this week",
      title: "HABITS",
    },

    CAL_SUMMARY: {
      includeInGood: true,
      alwaysShowGoodSection: false,
      includeInBad: true,
      alwaysShowBadSection: false,
      emptyMessage: "No calendar summary this week",
      title: "CAL SUMMARY",
    },

    CAL_EVENTS: {
      includeInGood: true,
      alwaysShowGoodSection: false,
      includeInBad: true,
      alwaysShowBadSection: false,
      emptyMessage: "No calendar events this week",
      title: "CAL EVENTS",
    },

    TASKS: {
      includeInGood: true,
      alwaysShowGoodSection: false,
      includeInBad: false,
      alwaysShowBadSection: false,
      emptyMessage: "No tasks completed this week",
      title: "TASKS",
    },
  },

  /*
   * EVALUATION CRITERIA INSTRUCTIONS:
   *
   * This object defines what content gets included in good vs bad sections.
   *
   * Supported criteria types:
   * - "all": Include everything from the section
   * - "none": Include nothing from the section
   * - ["text", "emoji"]: Include only items containing these strings/emojis
   * - { not: ["text", "emoji"] }: Include everything EXCEPT items containing these
   *
   * Examples:
   * - good: "all" = All events go to good section
   * - bad: ["😔", "Wasted"] = Only sad/wasted events go to bad section
   * - good: { not: ["😔"] } = All events except sad ones go to good section
   */
  evaluationCriteria: {
    TRIPS: {
      good: "all",
      bad: "none",
    },

    EVENTS: {
      good: { not: ["😔", "Wasted"] },
      bad: ["😔", "Wasted"],
    },

    ROCKS: {
      good: ["✅", "👾", "Went well", "Made progress"],
      bad: ["🥊", "🚧", "Went bad", "Didn't go so well"],
    },

    HABITS: {
      good: ["✅"],
      bad: ["❌", "⚠️"],
    },

    CAL_SUMMARY: {
      good: ["✅", "☑️ Personal Time"],
      bad: ["❌"],
    },

    CAL_EVENTS: {
      good: ["✅"],
      bad: ["❌"],
    },

    TASKS: {
      good: ["✅"],
      bad: "none",
    },
  },

  // Category name mappings (used by extraction functions)
  categoryMappings: {
    "Interpersonal events": "Social time",
    Relationships: "Time with Relationships",
    Calls: "Calls time",
    Family: "Family time",
  },

  // Section output formatting
  formatting: {
    sectionHeader: (sectionName) => `===== ${sectionName} =====`,
    sectionSeparator: "\n",
    itemSeparator: "\n",
  },
};
