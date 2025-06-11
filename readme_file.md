# Notion AI Task Summary Automation

Automated system that generates AI-powered summaries of completed tasks by category for weekly retrospectives in Notion. Uses Claude AI to create professional, concise summaries that respect your time and use natural language.

## ✨ Features

- **Smart Week Processing**: Handle single weeks or batch process multiple weeks
- **Intelligent Padding**: Works with both "Week 1" and "Week 01" naming conventions  
- **AI-Powered Summaries**: Professional, concise summaries that group similar tasks
- **Personal Context**: Customizable context file for definitions and writing style
- **Category Support**: Processes all task types (Work, Personal, Interpersonal, Physical Health, Mental Health, Home)
- **Natural Language**: Avoids corporate HR speak in favor of human, professional tone

## 🚀 Quick Start

1. **Clone and install**:
   ```bash
   git clone <your-repo>
   cd notion-scripts
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

3. **Configure weeks** (edit `summary.js` line 17):
   ```javascript
   const TARGET_WEEKS = [1, 2, 3, 4]; // Any weeks you want to process
   ```

4. **Run**:
   ```bash
   node summary.js
   ```

## 📋 Notion Setup Requirements

### 2025 Tasks Table
- **Task** (Title) - Task name
- **Due Date** (Date) - When task is due/completed
- **Type** (Select) - Categories:
  - 🏃‍♂️ Physical Health
  - 💼 Work  
  - 🌱 Personal
  - 🍻 Interpersonal
  - ❤️ Mental Health
  - 🏠 Home
- **Status** (Status) - Must include "🟢 Done" option
- **Week Number** (Number) - Optional, for reference

### 2025 Recap Table  
- **Week Recap** (Title) - Week identifier (e.g., "Week 01 Recap")
- **⌛ Weeks** (Relation) - Links to 2025 Weeks table
- **Summary Fields** (Rich Text):
  - Physical Health Summary
  - Work Summary
  - Personal Summary
  - Interpersonal Summary
  - Mental Health Summary
  - Home Summary

### 2025 Weeks Table
- **Date Range (SET)** (Date Range) - Start and end date for each week
- **Title/Name** - Week identifier (e.g., "Week 01")

## 🎯 Usage Examples

### Single Week
```javascript
const TARGET_WEEKS = [22];
```

### Multiple Weeks  
```javascript
const TARGET_WEEKS = [1, 2, 3, 4];
```

### Catch Up on a Month
```javascript
const TARGET_WEEKS = [15, 16, 17, 18, 19];
```

### Mixed Weeks
```javascript
const TARGET_WEEKS = [1, 11, 22, 33];
```

## 📝 Customization

### Personal Context File
Create `context.md` to customize AI behavior:

```markdown
# AI Summary Context

## Writing Style Rules
### Avoid Corporate HR Speak
- NEVER use: "participated in", "collaborated", "attended social events"
- Use natural verbs: "went to", "worked with", "hung out"

## Definitions
### People
- **Person Name**: Relationship or context

### Bars/Restaurants  
- **Place Name**: Type of establishment

### General
- **Abbreviation**: Full meaning
```

### Output Examples

**Before customization:**
> "Participated in social events with colleagues and attended multiple restaurants for dining experiences."

**After customization:**
> "Went to Pubkey with Alex and Pat, had dinner at Gene's with Jen."

## 🔧 Configuration

### Week Naming
The script automatically handles both formats:
- Single digit: "Week 1 Recap" → "Week 01 Recap"  
- Double digit: "Week 11 Recap" (no change needed)

### AI Settings
- **Model**: Claude 3 Haiku (cost-effective)
- **Max tokens**: 80 (keeps summaries concise)
- **Cost**: ~$0.003 per week summary

## 📊 Sample Output

```bash
🚀 Starting summary generation for weeks: 1, 2, 3, 4
📊 Processing 4 week(s)...

🗓️  === PROCESSING WEEK 1 ===
✅ Found Week 01 Recap!
📅 Week 01 date range: 2024-12-29 to 2025-01-04

🔄 Processing 🏃‍♂️ Physical Health...
📋 Found 0 Physical Health tasks
📝 No Physical Health tasks this week.

🔄 Processing 🍻 Interpersonal...
📋 Found 9 Interpersonal tasks
🤖 Generated summary: Went to Pubkey with Alex and Pat, had dinner at Gene's with Jen, attended all 3 Phish concerts.

✅ Successfully updated Week 01 recap!
🎉 Successfully completed all 4 week(s)!
```

## 🛡️ Security

- **API keys**: Protected in `.env` (not committed to git)
- **Personal context**: `context.md` excluded from git
- **Database IDs**: Stored securely in environment variables

## 🐛 Troubleshooting

### "Could not find Week X Recap"
- Check that your recap page is named exactly "Week XX Recap"
- Verify the page exists in your Recap database

### "Week X has no week relation"
- Ensure your recap page is linked to the correct week in the "⌛ Weeks" field

### "No tasks found"
- Verify tasks have Status = "🟢 Done"
- Check that Due Date falls within the week's date range
- Confirm task Type matches the expected categories

### Context not loading
- Ensure `context.md` exists in the same folder as `summary.js`
- Check file permissions and encoding (should be UTF-8)

## 💰 Cost Estimation

- **Per week**: ~$0.003 (0.3 cents)
- **Per year (52 weeks)**: ~$0.16
- **Batch processing 10 weeks**: ~$0.03

Very cost-effective for the time saved!

## 🔄 Version History

- **v1.0**: Basic single-week processing
- **v2.0**: Added multi-week array support  
- **v3.0**: Smart padding for week numbers
- **v4.0**: Personal context file integration
- **v5.0**: Improved natural language and corporate speak removal

## 📄 License

MIT License - Feel free to customize for your own workflow!

---

**Built with**: Notion API, Claude AI, Node.js
**Time saved**: Hours of manual weekly review work automated away! 🎉