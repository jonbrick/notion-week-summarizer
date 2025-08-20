# Notion Week Summarizer

A comprehensive automation suite that transforms your scattered weekly data into organized, structured insights. Connects Notion and Google Calendar to automatically pull, categorize, and format your personal and work activities into professional weekly retrospectives.

## ✨ What It Does

**Turns this chaos:**

- 47 calendar events across 9 calendars
- 23 completed tasks in Notion
- 15 habit tracking entries
- 98 commits across 14 personal projects

**Into this insight:**

```
===== TRIPS =====
💜 Family Trip - 2025 Portland Easter Weekend

===== HABITS =====
💪 Great workout habits (5 workouts this week)
🛌 Poor sleep habits (1 early wake up, 6 days sleeping in)

===== CAL EVENTS =====
✅ Tons of interpersonal time (23.3 hours, 6 events, 4 days):
Hillstone & Res with Alex on Sun, Dye Easter Eggs w J and cousins on Sat...

✅ Some family time (0.3 hours, 1 event, 1 day):
Mom check-in on Mon

===== TASKS =====
✅ Personal Tasks (9)
Two black 64 cartridges, Amazon returns to Sara, Curate Vicki's Tribute Dropbox...

✅ Admin (2)
Plan Apr, Plan week 16
```

## 🏗️ Architecture

### Three-Phase Pipeline

1. **📥 Data Pull**: Extracts from 15+ sources (calendars, tasks, habits, GitHub commits)
2. **📊 Data Summarization**: Categorizes and formats raw data with intelligent grouping
3. **📝 Structured Output**: Organizes data into standardized weekly retrospective format

### Smart Data Processing

- **Calendar Events**: Auto-categorizes by color/calendar (Personal, Work, Interpersonal, etc.)
- **Task Categorization**: Automatically sorts tasks (Personal, Admin, Home, Physical Health)
- **Habit Evaluation**: Tracks patterns across multiple metrics with intelligent scoring
- **GitHub Integration**: Processes personal project commits with automatic grouping
- **Admin Task Detection**: Identifies planning/reflection tasks (recap, retro, plan, journal)

## 🚀 Quick Start

### Installation

```bash
git clone <your-repo>
cd notion-week-summarizer
npm install
```

### Environment Setup

Create `.env` file:

```env
# Core APIs
NOTION_TOKEN=your_notion_integration_token

# Notion Databases
TASKS_DATABASE_ID=your_tasks_database_id
RECAP_DATABASE_ID=your_recap_database_id
WEEKS_DATABASE_ID=your_weeks_database_id

# Google Calendar IDs
PERSONAL_CALENDAR_ID=your_main_personal_calendar
WORK_CALENDAR_ID=your_work_calendar

# Specialized Calendar IDs (Optional)
WORKOUT_CALENDAR_ID=your_workout_calendar
READING_CALENDAR_ID=your_reading_calendar
VIDEO_GAMES_CALENDAR_ID=your_gaming_calendar
PERSONAL_CODING_CALENDAR_ID=your_coding_calendar
ART_CALENDAR_ID=your_art_calendar

# Habit Tracking Calendars (Optional)
WAKE_UP_EARLY_CALENDAR_ID=early_wake_tracking
SLEEP_IN_CALENDAR_ID=sleep_in_tracking
SOBER_DAYS_CALENDAR_ID=sobriety_tracking
DRINKING_DAYS_CALENDAR_ID=drinking_tracking
BODY_WEIGHT_CALENDAR_ID=weight_tracking
```

### One-Command Weekly Processing

```bash
# Complete weekly pipeline for current week
node 5-run-week-personal.js

# Process specific week with full pipeline
node 5-run-week-personal.js
> Which week? 25
> This will run ALL steps for Week 25:
>    1) Pull data
>    2) Summarize data (tasks + cal)
>    3) Generate structured output
> Continue? y
```

## 📋 Usage Examples

### Individual Script Execution

```bash
# Data pulling (modular)
node 1-pull-data-personal.js --weeks 22,23,24
node scripts/data-pulls/pull-personal-calendar.js --weeks 22
node scripts/data-pulls/pull-personal-tasks.js --weeks 22

# Data summarization
node 2-summarize-data-personal.js --weeks 22
node scripts/summarize-data/summarize-personal-tasks.js --weeks 22
node scripts/summarize-data/summarize-personal-cal.js --weeks 22

# Final output generation
node scripts/output/generate-weekly-summary.js --weeks 22
```

### Batch Processing

```bash
# Process multiple weeks
node 5-run-week-personal.js --weeks 20,21,22,23,24

# Process with fail-fast mode
node 1-pull-data-personal.js --weeks 22 --fail-fast
```

## 🗄️ Notion Database Requirements

### Recap Database (Primary Output)

**Purpose**: Stores all weekly summaries and retrospectives

**Required Properties**:

- **Week Recap** (Title) - "Week 01 Recap" format
- **⌛ Weeks** (Relation) - Links to Weeks database for date ranges
- **Personal Task Summary** (Rich Text) - Raw task and calendar data
- **Personal Cal Summary** (Rich Text) - Processed calendar summaries
- **Weekly Summary** (Rich Text) - Final structured weekly output

### Tasks Database

**Purpose**: Task management with automatic categorization

**Required Properties**:

- **Task** (Title) - Task description
- **Due Date** (Date) - Completion date for filtering
- **Type** (Select) - Categories: 💼 Work, 🏃‍♂️ Physical Health, 🌱 Personal, 🍻 Interpersonal, ❤️ Mental Health, 🏠 Home
- **Status** (Status) - Must include "🟢 Done" status
- **Week Number** (Number) - Optional week reference

### Weeks Database

**Purpose**: Date range management for weeks

**Required Properties**:

- **Date Range (SET)** (Date Range) - Week start/end dates
- **Title** (Title) - "Week 01" format

## 🎯 Smart Features

### Calendar Event Categorization

**By Calendar Source**:

- Personal → Personal Time
- Work → Work Events
- Workout → Workout Events
- Reading → Reading Time

**By Event Color** (Google Calendar):

- Red → Urgent events
- Orange → Important events
- Green → Good/positive events

**Intelligent Grouping**:

- **Interpersonal Events**: Auto-detects and sub-categorizes into:

  - General interpersonal time
  - Relationship time (keywords: "jen")
  - Family time (keywords: "mom", "dad", "family", "fam")
  - Calls (keywords: "call", "ft", "facetime")

- **Mental Health Events**: Auto-detects and sub-categorizes into:
  - General mental health time
  - Awake time (keywords: "awake", "leg pain", "anxiety") → ❌ status
  - Wasted days (keywords: "wasted day") → ❌ status, counts days not hours

### Task Intelligence

**Admin Task Detection**: Automatically identifies planning tasks containing:

- "recap", "retro", "plan", "journal" → Moves to separate Admin category

**Category Mapping**:

- Personal Tasks → ✅ (good indicator)
- Admin Tasks → ✅ (productive planning)
- Home Tasks → ✅ (life maintenance)
- Physical Health → ✅ (wellness)

### Habit Evaluation

**Multi-Metric Tracking**:

- Early wake ups vs sleeping in → Sleep quality scoring
- Sober days vs drinking days → Health habit tracking
- Workout frequency → Fitness consistency
- Hobby engagement (coding, reading, art, gaming) → Life balance

**Smart Scoring**: Evaluates habit combinations for overall weekly health assessment

## 🤖 AI Integration

### Context-Aware Summaries

The system sends structured data to Claude AI with specific context for generating:

**"What went well?" Section**:

- Focuses on achievements, positive habits, meaningful events
- Filters for ✅ tasks, quality time with people, productive activities

**"What didn't go so well?" Section**:

- Highlights improvement areas, negative habits, missed opportunities
- Filters for ❌ habits, wasted time, health concerns

**Combined Overview**:

- Synthesizes both perspectives into balanced weekly insight
- Maintains actionable tone focused on growth

### Cost Efficiency

- **Free tier friendly** for Google Calendar API (within limits)
- **Free tier friendly** for Notion API (within limits)
- **No per-usage costs** for the core automation

## 🔧 Configuration & Customization

### Calendar Configuration

Edit `scripts/data-pulls/pull-personal-calendar.js` to modify:

```javascript
// Event categorization by calendar
const CALENDAR_CATEGORY_MAP = {
  [process.env.PERSONAL_CALENDAR_ID]: "Personal",
  [process.env.WORKOUT_CALENDAR_ID]: "Physical Health",
  [process.env.READING_CALENDAR_ID]: "Reading",
  // Add your calendars...
};

// Event categorization by color
const COLOR_CATEGORY_MAP = {
  1: "urgent", // Red
  6: "important", // Orange
  2: "good", // Green
  // Customize colors...
};
```

### Task Categorization

Edit `scripts/summarize-data/summarize-personal-tasks.js`:

```javascript
const taskCategoriesConfig = [
  { category: "Personal Tasks", include: true, order: 1 },
  { category: "Physical Health Tasks", include: true, order: 2 },
  { category: "Home Tasks", include: true, order: 5 },
  { category: "Admin", include: true, order: 6 },
  // Add your categories...
];

// Admin task keywords (automatic detection)
const adminKeywords = ["recap", "retro", "plan", "journal"];
```

### Retrospective Configuration

Edit `src/config/retro-extraction-config.js` for future AI integration:

```javascript
evaluationCriteria: {
  TASKS: {
    good: ["✅"],        // Include completed tasks in positive section
    bad: "none",         // No tasks in negative section
  },
  EVENTS: {
    good: { not: ["😔", "Wasted"] },  // Exclude sad/wasted events
    bad: ["😔", "Wasted"],            // Include only negative events
  },
  HABITS: {
    good: ["✅"],        // Good habits
    bad: ["❌", "⚠️"],   // Bad/concerning habits
  },
}
```

## 📊 Sample Output Sections

### Complete Weekly Overview

```
===== TRIPS =====
💜 Family Trip - 2025 Portland Easter Weekend on Fri - Sun

===== EVENTS =====
🚀 Work Milestone - Metrics Explorer shipped on Tue
💜 Family Event - 2025 Easter Celebration on Sat - Sun

===== ROCKS =====
👾 Made progress - Vick Funeral Prep (🌱 Personal)
👾 Made progress - Being healthy (🏃‍♂️ Physical)

===== HABITS =====
💪 Great workout habits (5 workouts)
🛌 Poor sleep habits (1 early wake up, 6 days sleeping in)
🍻 Moderate drinking habits (3 days sober, 4 days drinking)
📖 Poor hobby engagement (0 days reading, 1 day coding, 3 days gaming)

===== CAL SUMMARY =====
✅ Personal Time (15 events, 16.5 hours, 7 days)
❌ Reading Time (0 events, 0 hours, 0 days)
❌ Art Time (0 events, 0 hours, 0 days)

===== CAL EVENTS =====
✅ Tons of interpersonal time (6 events, 23.3 hours, 4 days):
Hillstone & Res with Alex on Sun, Park and Res with Alex on Thu, Dye Easter Eggs w J and cousins on Sat

✅ Some family time (1 event, 0.3 hours, 1 day):
Mom check-in on Mon

✅ Regular calls time (6 events, 5.5 hours, 4 days):
Sky call on Sun, Brian call on Sun, Dad call on Tue, Mom call on Tue

❌ Wasted Days (1 day):
Wasted day on Fri (11.0h)

✅ Some workout events (1 event, 1.0 hours, 1 day):
Lunch workout on Thu (1.0h)

===== TASKS =====
✅ Personal Tasks (9)
Two black 64 cartridges, Amazon returns to Sara, Curate Vicki's Tribute Dropbox, File tax extension, Order Kepler Sazerac, Videos for Mom & Dad, Vicki tribute photos, Research Evita, Try on Suit

✅ Admin (2)
Plan Apr, Plan week 16
```

## 🔄 Workflow Integration

### Weekly Routine

1. **Sunday Planning**: Run data pull for previous week
2. **Monday Reflection**: Generate retrospectives and overview
3. **Batch Processing**: Process multiple weeks monthly for trends

### Monthly Analysis

```bash
# Generate monthly reports (planned feature)
node 6-generate-month-summary.js --month 4
```

## 🛠️ Technical Architecture

### Modular Design

- **Data Pulls**: Individual scripts for each data source (calendars, tasks, habits)
- **Summarization**: Separate processing for tasks vs calendar events
- **Retrospectives**: Independent good/bad analysis with configurable criteria
- **Utils**: Shared functions for Notion API, date handling, formatting

### Error Handling

- **Fail-fast mode**: Stop on first error for debugging
- **Graceful degradation**: Continue processing other weeks if one fails
- **Detailed logging**: Comprehensive console output for troubleshooting

### Performance

- **API Rate Limiting**: Respects Notion and Google Calendar limits
- **Batch Processing**: Efficiently handles multiple weeks
- **Caching**: Minimizes redundant API calls within single runs

---

**Built with**: Notion API, Google Calendar API, Node.js  
**Time saved**: Transform hours of manual weekly review into 2 minutes of automated data organization! 🎉

**Perfect for**: Knowledge workers, productivity enthusiasts, quantified self practitioners, anyone wanting structured weekly data collection without the manual overhead.
