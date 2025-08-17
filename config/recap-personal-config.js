/**
 * Configuration for recap-data-personal.js
 * Defines evaluation rules and formatting for combining good/bad columns into overview
 */

module.exports = {
  // Notion column names
  dataSources: {
    goodColumn: "Personal - What went well?",
    badColumn: "Personal - What didn't go so well?",
    overviewColumn: "Personal - Overview?",
  },

  // Section processing types
  sectionTypes: {
    TRIPS: "simple",
    EVENTS: "simple",
    ROCKS: "simple",
    "CAL EVENTS": "calEvents",
    TASKS: "tasks",
    HABITS: "habits",
  },

  // Evaluation rules for different section types
  evaluationRules: {
    // CAL_EVENTS: Based on hours parsed from "(X events, Y hours)"
    calEvents: {
      categories: {
        // Hours thresholds for evaluation
        ranges: [
          { min: 0, max: 1, label: "Some" },
          { min: 1, max: 10, label: "Some" },
          { min: 10, max: 20, label: "Lots" },
          { min: 20, max: Infinity, label: "Tons" },
        ],
      },
    },

    // TASKS: Based on count parsed from "Category (X)"
    tasks: {
      categories: {
        ranges: [
          { min: 0, max: 1, label: "Some" },
          { min: 1, max: 5, label: "Some" },
          { min: 5, max: 10, label: "Lots" },
          { min: 10, max: Infinity, label: "Tons" },
        ],
      },
    },

    // HABITS: Based on scoring system
    habits: {
      scoring: {
        // Scoring rules
        goodHabit: 1, // Lines containing "good"
        badHabit: -1, // Lines containing "bad"
        notGreatHabit: 0, // Lines containing "not great"
      },
      // Overall evaluation based on total score
      overallEvaluation: [
        { min: -Infinity, max: -2, label: "Unhealthy week this week" },
        { min: -1, max: 1, label: "Ok healthy habits this week" },
        { min: 2, max: Infinity, label: "Healthy week this week" },
      ],
    },
  },

  // Formatting options
  formatting: {
    sectionHeader: (title) => `===== ${title} =====`,
    sectionSeparator: "\n",
    itemSeparator: ", ",
    categoryHeader: (evaluation, category) =>
      `${evaluation} ${category.toLowerCase()}`,

    // How to combine items within sections
    combinationRules: {
      simple: "concatenate", // Just join good + bad items
      evaluated: "categorized", // Group by subcategory with evaluations
    },
  },

  // Order sections should appear in output (inherit from extraction config?)
  sectionOrder: ["TRIPS", "EVENTS", "ROCKS", "CAL EVENTS", "TASKS", "HABITS"],
};
