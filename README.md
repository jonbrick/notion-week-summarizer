# Notion Week Summarizer

This Node.js automation suite connects to Notion and Claude AI to pull weekly data from calendars, tasks, and habits, then automatically generate professional weekly summaries and retrospectives.

## ✨ Features

- **Comprehensive Data Pulling**: Automatically pulls from personal/work calendars, tasks, and habits
- **Interactive & Command-Line Modes**: Choose weeks and data sources interactively or via CLI arguments
- **Multi-Week Processing**: Handle single weeks or batch process multiple weeks at once
- **AI-Powered Summaries**: Uses Claude AI to create professional weekly summaries and retrospectives
- **Modular Architecture**: Separate scripts for different data sources (personal, work, habits)
- **Custom Context Support**: Optional context files for AI writing style and definitions

## 🚀 Quick Start

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Set up environment** (create `.env` file):

   ```env
   NOTION_TOKEN=your_notion_integration_token
   ANTHROPIC_API_KEY=your_claude_api_key
   TASKS_DATABASE_ID=your_tasks_database_id
   RECAP_DATABASE_ID=your_recap_database_id
   WEEKS_DATABASE_ID=your_weeks_database_id
   ```

3. **Pull weekly data**:

   ```bash
   # Pull all data for current week
   node pull-week.js

   # Pull specific data sources
   node pull-personal.js
   node pull-work.js
   node personal-habits-pull.js
   ```

4. **Generate summaries**:

   ```bash
   # Personal summary
   node summarize-personal.js --weeks 1,2,3

   # Work summary
   node summarize-work.js --weeks 1,2,3

   # Full week summary
   node summarize-week.js --weeks 1,2,3
   ```

## 📋 Notion Database Requirements

### Tasks Database

- **Task** (Title) - Task name
- **Due Date** (Date) - When task is due/completed
- **Type** (Select) - Categories:
  - 💼 Work
  - 🏃‍♂️ Physical Health
  - 🌱 Personal
  - 🍻 Interpersonal
  - ❤️ Mental Health
  - 🏠 Home
- **Status** (Status) - Must include "🟢 Done" option
- **Week Number** (Number) - Optional reference field

### Recap Database

- **Week Recap** (Title) - Week identifier (e.g., "Week 01 Recap")
- **⌛ Weeks** (Relation) - Links to Weeks database
- **Summary Fields** (Rich Text):
  - Work Summary
  - Physical Health Summary
  - Personal Summary
  - Interpersonal Summary
  - Mental Health Summary
  - Home Summary

### Weeks Database

- **Date Range (SET)** (Date Range) - Start and end date for each week
- **Title/Name** - Week identifier (e.g., "Week 01")

## 🎯 Usage Examples

### Data Pulling

```bash
# Pull all data for interactive week selection
node pull-week.js

# Pull all data for specific weeks
node pull-week.js --weeks 22,23,24

# Pull only personal data
node pull-personal.js --weeks 22

# Pull only work data
node pull-work.js --weeks 22

# Pull only habits data
node personal-habits-pull.js --weeks 22
```

### Summary Generation

```bash
# Generate personal retrospective
node summarize-personal.js --weeks 22

# Generate work summary
node summarize-work.js --weeks 22

# Generate comprehensive week summary
node summarize-week.js --weeks 22
```

### Category Numbers

- `0` - All Categories
- `1` - 💼 Work
- `2` - 🏃‍♂️ Physical Health
- `3` - 🌱 Personal
- `4` - 🍻 Interpersonal
- `5` - ❤️ Mental Health
- `6` - 🏠 Home

## 📝 Customization

### Context Files (Optional)

Create context files to customize AI behavior for different summary types:

**Personal Context** (`context/context-personal.md`):

```markdown
# Personal AI Summary Context

## Writing Style Rules

- Use personal, reflective tone
- Focus on growth and progress
- Be honest about challenges

## Definitions

- **Person Name**: Relationship context
- **Activity**: Personal meaning
```

**Work Context** (`context/context-work.md`):

```markdown
# Work AI Summary Context

## Writing Style Rules

- Use professional but natural language
- Focus on outcomes and impact
- Group related projects together

## Definitions

- **Project Name**: Context and scope
- **Team/Role**: Relationship context
```

### Default Configuration

Edit configuration files to change defaults:

```javascript
// In src/config/task-config.js
const DEFAULT_TARGET_WEEKS = [1];

// In src/config/calendar-config.js
const CALENDAR_CONFIGS = {
  personal: {
    /* settings */
  },
  work: {
    /* settings */
  },
};
```

## 🔧 How It Works

### Data Pulling Phase

1. **Calendar Pull**: Extracts events from Google Calendar (personal/work)
2. **Task Pull**: Queries Notion tasks database for completed items
3. **Habits Pull**: Collects habit tracking data from Notion
4. **Data Storage**: Saves all data to respective Notion databases

### Summary Generation Phase

1. **Week Discovery**: Finds recap pages by title (supports "Week 1" or "Week 01" format)
2. **Date Range**: Gets week's start/end dates from linked Weeks database
3. **Data Aggregation**: Combines calendar events, tasks, and habits for the week
4. **AI Processing**: Sends data to Claude AI with context for professional summarization
5. **Update**: Writes generated summaries and retrospectives back to Notion

## 📊 Sample Output

### Data Pulling

```bash
📅 Week Data Puller
🔄 Runs Personal + Work + Habits data pull

📋 This will run:
  • Personal Calendar Pull + Personal Task Pull + Personal Habits Pull
  • Work Calendar Pull + Work Task Pull
  • Habits Data Pull

🚀 Running pull-personal.js...
✅ pull-personal.js completed successfully

🚀 Running pull-work.js...
✅ pull-work.js completed successfully

🎉 Week data pull complete for week: 22
```

### Summary Generation

```bash
🚀 Starting personal retrospective for week: 22
📅 Week 22 date range: 2024-05-27 to 2024-06-02

🔄 Processing calendar events...
📋 Found 12 personal events
🔄 Processing completed tasks...
📋 Found 8 personal tasks
🔄 Processing habits data...
📋 Found habit tracking for 7 days

🤖 Generated retrospective: This week focused on health improvements and personal projects...

✅ Successfully updated Week 22 personal retrospective!
```

## 💰 Cost Estimation

- **Claude AI**: ~$0.01 per week (data pull + summaries)
- **Google Calendar API**: Free (within reasonable limits)
- **Notion API**: Free (within reasonable limits)
- **Annual cost** (52 weeks): ~$0.52
- Very cost-effective for comprehensive automation!

## 🛡️ Security

- All API keys stored securely in `.env` (gitignored)
- Context files can contain personal information (gitignored)
- Database IDs and sensitive configs protected in environment variables
- OAuth tokens refreshed automatically when needed

## 📄 Dependencies

- `@notionhq/client` - Notion API integration
- `@anthropic-ai/sdk` - Claude AI API
- `googleapis` - Google Calendar API integration
- `dotenv` - Environment variable management
- `fs` & `readline` - File operations and user input

---

**Built with**: Notion API, Claude AI, Google Calendar API, Node.js  
**Time saved**: Automated weekly data collection and retrospectives! 🎉
