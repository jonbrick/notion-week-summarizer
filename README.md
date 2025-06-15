# 🤖 Notion AI Task Summary Automation

Automated system that generates AI-powered summaries of completed tasks by category for weekly retrospectives in Notion. Features an interactive terminal interface, command-line arguments, and macOS Automator integration for Spotlight access!

## ✨ Features

- **🎯 Three Ways to Run**:
  - Interactive mode with numbered menus
  - Command-line arguments for automation
  - Spotlight integration via Automator app
- **Smart Week Processing**: Handle single weeks or batch process multiple weeks
- **Intelligent Padding**: Works with both "Week 1" and "Week 01" naming conventions
- **AI-Powered Summaries**: Professional, concise summaries that group similar tasks
- **Personal Context**: Customizable context file for definitions and writing style
- **Category Support**: Processes all task types (Work, Personal, Interpersonal, Physical Health, Mental Health, Home)
- **Natural Language**: Avoids corporate HR speak in favor of human, professional tone

## 🚀 Quick Start

### Initial Setup

1. **Clone and install**:

   ```bash
   git clone <your-repo>
   cd notion-scripts/week-summarizer
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

3. **Create context file** (optional):
   ```bash
   touch context.md
   # Add your personal definitions and style preferences
   ```

## 🎮 Three Ways to Use

### 1. Interactive Mode (Terminal)

Just run without arguments:

```bash
node summary.js
```

You'll see:

```
🎯 Notion Week Summary Generator
📌 Defaults: Week 1 | All categories

? Which weeks to process? (comma-separated, e.g., 1,2,3): 5,6,7
? Which categories to process?
  0 - All Categories
  1 - 💼 Work
  2 - 🏃‍♂️ Physical Health
  3 - 🌱 Personal
  4 - 🍻 Interpersonal
  5 - ❤️ Mental Health
  6 - 🏠 Home
? Enter numbers (e.g., 1,3 or 0 for all): 1,3

📊 Processing weeks: 5, 6, 7
📋 Processing categories: 💼 Work, 🌱 Personal
Continue? (y/n): y
```

**Pro tip**: Hit Enter at any prompt to use your configured defaults!

### 2. Command-Line Mode

For automation or quick runs:

```bash
# Process week 1 with all categories
node summary.js --weeks 1 --categories 0

# Process weeks 5,6,7 with just Work and Personal
node summary.js --weeks 5,6,7 --categories 1,3

# Process week 22 with all except Home
node summary.js --weeks 22 --categories 1,2,3,4,5
```

### 3. Backdoor Mode (Edit Defaults)

Edit `summary.js` lines 24-34 to set your preferred defaults:

```javascript
// 1️⃣ DEFAULT WEEKS TO PROCESS
const DEFAULT_TARGET_WEEKS = [20, 21, 22, 23]; // Your regular weeks

// 2️⃣ DEFAULT CATEGORIES TO PROCESS
const DEFAULT_ACTIVE_CATEGORIES = [
  "💼 Work",
  // "🏃‍♂️ Physical Health",  // Commented out
  "🌱 Personal",
  // "🍻 Interpersonal",      // Commented out
  "❤️ Mental Health",
  "🏠 Home",
];
```

Then just run `node summary.js` and hit Enter twice to use these defaults!

## 🤖 Automator Setup (Spotlight Integration)

Turn this into a Spotlight-accessible app for the ultimate convenience!

### Creating the Automator App

1. **Open Automator** and create a new **Application**

2. **Add "Run AppleScript" action** with this code:

```applescript
on run {input, parameters}
    -- Week Selection Dialog
    set weekPrompt to "Which weeks to process?" & return & return & "Enter week numbers separated by commas" & return & "(e.g., 1 or 1,2,3 or 5,6,7,8)"

    set weekInput to text returned of (display dialog weekPrompt default answer "1" buttons {"Cancel", "Continue"} default button "Continue" with title "📊 Week Summary Generator")

    -- Parse and validate weeks
    set weekList to weekInput

    -- Category Selection Dialog
    set categoryPrompt to "Which categories to process?" & return & return & ¬
        "0 - All Categories" & return & ¬
        "1 - 💼 Work" & return & ¬
        "2 - 🏃‍♂️ Physical Health" & return & ¬
        "3 - 🌱 Personal" & return & ¬
        "4 - 🍻 Interpersonal" & return & ¬
        "5 - ❤️ Mental Health" & return & ¬
        "6 - 🏠 Home" & return & return & ¬
        "Enter numbers (e.g., 1,3 or 0 for all):"

    set categoryInput to text returned of (display dialog categoryPrompt default answer "0" buttons {"Cancel", "Continue"} default button "Continue" with title "📊 Week Summary Generator")

    -- Parse categories for display
    set categoryDisplay to ""
    if categoryInput is "0" then
        set categoryDisplay to "All categories"
    else
        set categoryDisplay to "Selected categories: " & categoryInput
    end if

    -- Confirmation Dialog
    set confirmPrompt to "Ready to process:" & return & return & ¬
        "📅 Weeks: " & weekList & return & ¬
        "📋 " & categoryDisplay & return & return & ¬
        "Continue with summary generation?"

    display dialog confirmPrompt buttons {"Cancel", "Generate"} default button "Generate" with title "📊 Week Summary Generator" with icon note

    -- Return the parameters for the shell script
    return {"--weeks", weekList, "--categories", categoryInput}

end run
```

3. **Add "Run Shell Script" action** with:

   - Shell: `/bin/zsh` (or `/bin/bash`)
   - Pass input: **as arguments** ⚠️ IMPORTANT!
   - Code:

   ```bash
   export PATH="/Users/YOUR_USERNAME/.nvm/versions/node/vXX.XX.X/bin:$PATH"
   cd /path/to/your/notion-scripts/week-summarizer
   node summary.js $@
   osascript -e 'display dialog "📊 Week summary generated successfully!" buttons {"OK"} default button "OK"'
   ```

4. **Save as Application**:
   - Name: "Week Summary" (or whatever you like)
   - Where: Applications folder
   - Add a 🤖 emoji icon for style!

### Using from Spotlight

1. Press `Cmd + Space`
2. Type "Week" (or your app name)
3. Press Enter
4. Follow the dialogs!

### How It Works

The magic happens through argument passing:

1. **AppleScript** collects your input and returns an array:

   ```applescript
   return {"--weeks", "1,2,3", "--categories", "0"}
   ```

2. **Shell receives** these as separate arguments (`$1`, `$2`, `$3`, `$4`)

3. **Node script** parses them:
   ```javascript
   // Detects --weeks and --categories flags
   // Uses those values instead of showing prompts
   ```

This is why we use `{"--weeks", weekList, ...}` instead of a single string!

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

### Quick Catchup

```bash
# Last 4 weeks, all categories
node summary.js --weeks 20,21,22,23 --categories 0
```

### Targeted Review

```bash
# Just work summaries for Q1
node summary.js --weeks 1,2,3,4,5,6,7,8,9,10,11,12,13 --categories 1
```

### Health Check

```bash
# Physical and Mental Health for recent weeks
node summary.js --weeks 22,23,24 --categories 2,5
```

## 📝 Personal Context Customization

Create `context.md` to teach the AI your preferences:

```markdown
# AI Summary Context

## Writing Style Rules

### Avoid Corporate HR Speak

- NEVER use: "participated in", "collaborated", "attended social events"
- Use natural verbs: "went to", "worked with", "hung out"

## Definitions

### People

- **Pat**: Friend from work
- **Jen**: Partner

### Places

- **Pubkey**: Local bar
- **Gene's**: Italian restaurant

### Abbreviations

- **ECG**: Educational card game
```

## 💰 Cost Estimation

- **Per week**: ~$0.003 (0.3 cents)
- **Per year (52 weeks)**: ~$0.16
- **Batch processing 20 weeks**: ~$0.06

Incredibly cost-effective for the time saved!

## 🛡️ Security Best Practices

- **API keys**: Always in `.env` (never commit!)
- **Context file**: Personal info stays in `context.md` (gitignored)
- **Database IDs**: Environment variables only

## 🐛 Troubleshooting

### Interactive Mode Issues

**Defaults not showing correctly**: Check that `DEFAULT_TARGET_WEEKS` and `DEFAULT_ACTIVE_CATEGORIES` are properly formatted arrays

**Categories not processing**: Ensure category numbers are 0-6 (0 for all)

### Automator Issues

**"SyntaxError: Unexpected identifier"**: This means AppleScript is mixed with JavaScript. Check that:

- AppleScript is ONLY in the "Run AppleScript" action
- `summary.js` contains only JavaScript

**Arguments not passing**: Ensure Shell Script action has "Pass input: as arguments"

**Can't find node**: Update the PATH in your shell script to match your node installation:

```bash
which node  # Run this in terminal to find your node path
```

### Notion Issues

**"Could not find Week X Recap"**: Check naming matches exactly (e.g., "Week 01 Recap")

**"No week relation"**: Ensure recap pages are linked to week pages via ⌛ Weeks field

**No tasks found**: Verify:

- Tasks have Status = "🟢 Done"
- Due Date falls within week's date range
- Task Type matches category names exactly

## 📚 Technical Details

### Category Numbering System

- 0 = All Categories (special case)
- 1 = 💼 Work
- 2 = 🏃‍♂️ Physical Health
- 3 = 🌱 Personal
- 4 = 🍻 Interpersonal
- 5 = ❤️ Mental Health
- 6 = 🏠 Home

### Argument Parsing

The script checks for `--weeks` and `--categories` flags:

- If found: Uses command-line values
- If not found: Runs interactive mode
- Empty input in interactive: Uses defaults

### Why AppleScript Returns an Array

Returning `{"--weeks", weekList, "--categories", categoryInput}` creates 4 separate arguments instead of 1 concatenated string. This is crucial for proper parsing!

## 🔄 Version History

- **v1.0**: Basic single-week processing
- **v2.0**: Multi-week array support
- **v3.0**: Smart padding for week numbers
- **v4.0**: Personal context file integration
- **v5.0**: Natural language improvements
- **v6.0**: Interactive mode with numbered categories
- **v7.0**: Command-line arguments support
- **v8.0**: Automator/Spotlight integration 🤖

## 🎉 Tips & Tricks

1. **Set up common patterns** as defaults for quick Enter-Enter runs
2. **Use Spotlight** for ad-hoc summaries during weekly reviews
3. **Command-line mode** is perfect for cron jobs or scripting
4. **Context file** makes summaries match your communication style
5. **Check debug.log** if Automator acts weird

---

**Built with**: Notion API, Claude AI, Node.js, AppleScript
**Time saved**: Hours of manual weekly review automated to seconds! 🚀
