# Notion AI Task Summary Automation

This Node.js automation script connects to Notion and Claude AI to automatically generate concise weekly summaries of completed tasks by category, turning your task lists into professional recap content for retrospectives.

## ✨ Features

- **Interactive & Command-Line Modes**: Choose weeks and categories interactively or via CLI arguments
- **Multi-Week Processing**: Handle single weeks or batch process multiple weeks at once
- **AI-Powered Summaries**: Uses Claude AI (Haiku) to create professional 1-3 sentence summaries
- **Smart Category Filtering**: Process all 6 categories or select specific ones
- **Custom Context Support**: Optional `context.md` file for AI writing style and definitions
- **Date Range Filtering**: Automatically finds tasks within each week's date range

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

3. **Run interactively**:

   ```bash
   node summary.js
   ```

4. **Run with command-line args**:

   ```bash
   # Process specific weeks and categories
   node summary.js --weeks 1,2,3 --categories 1,3,5

   # Process all categories for multiple weeks
   node summary.js --weeks 15,16,17,18 --categories 0
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

### Interactive Mode

```bash
node summary.js
# Follow prompts to select weeks and categories
```

### Command Line Examples

```bash
# Single week, all categories
node summary.js --weeks 22 --categories 0

# Multiple weeks, specific categories (Work and Personal)
node summary.js --weeks 1,2,3,4 --categories 1,3

# Catch up on a month
node summary.js --weeks 15,16,17,18,19 --categories 0
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

### Context File (Optional)

Create `context.md` to customize AI behavior:

```markdown
# AI Summary Context

## Writing Style Rules

- Use natural language, avoid corporate speak
- Be concise and professional
- Group similar tasks together

## Definitions

- **Person Name**: Relationship context
- **Abbreviation**: Full meaning
```

### Default Configuration

Edit `summary.js` to change defaults:

```javascript
// Default weeks to process
const DEFAULT_TARGET_WEEKS = [1];

// Default categories (all active by default)
const DEFAULT_ACTIVE_CATEGORIES = [
  "💼 Work",
  "🏃‍♂️ Physical Health",
  // ... etc
];
```

## 🔧 How It Works

1. **Week Discovery**: Finds recap pages by title (supports "Week 1" or "Week 01" format)
2. **Date Range**: Gets week's start/end dates from linked Weeks database
3. **Task Filtering**: Queries tasks with:
   - Due Date within week range
   - Status = "🟢 Done"
   - Matching category type
4. **AI Summary**: Sends task names to Claude AI with context for professional summarization
5. **Update**: Writes generated summaries back to recap page fields

## 📊 Sample Output

```bash
🚀 Starting summary generation for weeks: 1, 2, 3
📊 Processing 3 week(s)...
📋 Active categories: 💼 Work, 🍻 Interpersonal, 🌱 Personal

🗓️  === PROCESSING WEEK 1 ===
✅ Found Week 01 Recap!
📅 Week 01 date range: 2024-12-29 to 2025-01-04

🔄 Processing 💼 Work...
📋 Found 5 Work tasks
🤖 Generated summary: Completed project setup, attended team meetings, and finished Q4 documentation.

✅ Successfully updated Week 01 recap with selected category summaries!
🎉 Successfully completed all 3 week(s)!
```

## 💰 Cost Estimation

- **Claude Haiku**: ~$0.003 per week summary
- **Annual cost** (52 weeks): ~$0.16
- Very cost-effective for automation!

## 🛡️ Security

- API keys stored securely in `.env` (gitignored)
- Personal context file excluded from version control
- Database IDs protected in environment variables

## 📄 Dependencies

- `@notionhq/client` - Notion API integration
- `@anthropic-ai/sdk` - Claude AI API
- `dotenv` - Environment variable management
- `fs` & `readline` - File operations and user input

---

**Built with**: Notion API, Claude AI, Node.js  
**Time saved**: Automated weekly retrospectives! 🎉
