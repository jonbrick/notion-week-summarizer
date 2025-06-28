const fs = require("fs");
require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");

// Initialize Anthropic client
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Load context from context.md file (optional)
 * @returns {string} Context content or empty string
 */
function loadContext() {
  try {
    return fs.readFileSync("./context.md", "utf8");
  } catch (error) {
    return ""; // Optional file, no error if missing
  }
}

/**
 * Load prompt template from file
 * @param {string} promptName - Name of the prompt file (without .txt)
 * @returns {string} Prompt template content
 */
function loadPrompt(promptName) {
  try {
    return fs.readFileSync(`./src/prompts/${promptName}.txt`, "utf8");
  } catch (error) {
    throw new Error(`Failed to load prompt ${promptName}: ${error.message}`);
  }
}

/**
 * Replace placeholders in prompt template
 * @param {string} template - Prompt template
 * @param {object} replacements - Key-value pairs for replacements
 * @returns {string} Processed prompt
 */
function processPrompt(template, replacements) {
  let prompt = template;

  for (const [key, value] of Object.entries(replacements)) {
    const placeholder = `{{${key}}}`;
    prompt = prompt.replace(new RegExp(placeholder, "g"), value);
  }

  return prompt;
}

/**
 * Generate AI summary for calendar events
 * @param {Array} eventDescriptions - Array of event descriptions
 * @param {string} promptContext - Context for the prompt (e.g., "work activity")
 * @returns {Promise<string>} Generated summary
 */
async function generateCalendarSummary(eventDescriptions, promptContext) {
  const context = loadContext();
  const promptTemplate = loadPrompt("calendar-summarization");

  const contextText = context
    ? `CONTEXT FOR BETTER SUMMARIES:\n${context}\n\n---\n\n`
    : "";

  const prompt = processPrompt(promptTemplate, {
    CONTEXT: contextText,
    PROMPT_CONTEXT: promptContext,
    EVENT_DESCRIPTIONS: eventDescriptions.map((desc) => desc).join("\n"),
  });

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].text.trim();
}

/**
 * Generate AI summary for tasks
 * @param {Array} taskNames - Array of task names
 * @param {string} promptContext - Context for the prompt (e.g., "work task")
 * @returns {Promise<string>} Generated summary
 */
async function generateTaskSummary(taskNames, promptContext) {
  const context = loadContext();
  const promptTemplate = loadPrompt("task-summarization");

  const contextText = context
    ? `CONTEXT FOR BETTER SUMMARIES:\n${context}\n\n---\n\n`
    : "";

  const prompt = processPrompt(promptTemplate, {
    CONTEXT: contextText,
    PROMPT_CONTEXT: promptContext,
    TASK_NAMES: taskNames.map((name) => name).join("\n"),
  });

  const message = await anthropic.messages.create({
    model: "claude-3-haiku-20240307",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].text.trim();
}

/**
 * Classify calendar event into category
 * @param {object} event - Calendar event object
 * @param {Array} targetCategories - Array of target category objects
 * @returns {Promise<string>} Category notionValue
 */
async function classifyCalendarEvent(event, targetCategories) {
  const context = loadContext();
  const promptTemplate = loadPrompt("calendar-classification");

  const contextText = context
    ? `CONTEXT FOR BETTER CLASSIFICATION:\n${context}\n\n---\n\n`
    : "";

  const eventTitle = event.summary || "Untitled event";
  const eventDescription = event.description || "";
  const eventText = `${eventTitle}${
    eventDescription ? ` - ${eventDescription}` : ""
  }`;

  const prompt = processPrompt(promptTemplate, {
    CONTEXT: contextText,
    EVENT_TEXT: eventText,
  });

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

module.exports = {
  generateCalendarSummary,
  generateTaskSummary,
  classifyCalendarEvent,
  loadContext,
  loadPrompt,
  processPrompt,
};
