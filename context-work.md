# WORK EXTRACTION GUIDE

## STEP 1: FIND THESE NUMBERS

### From Calendar Columns:

- **Total work hours**: Sum hours from all work calendars
- **Meeting hours**: Extract hours from "Default Work Cal" + "Rituals Cal"
- **Coding hours**: Extract hours from "Coding & Tickets Cal"
- **Design hours**: Extract hours from "Design Work Cal"

### From Summary Columns:

- **PR count**: Look for "X PRs" in "Work PR Summary" header
- **Commit count**: Look for "X commits" in "Work PR Summary" header
- **Task count**: Look for "(X)" in "Work Task Summary" header
- **Event count**: Count events in "Work Events Summary"

## STEP 2: FIND THESE STATUSES

### Rock Status (from "Work Rocks Summary"):

- **Achieved rocks**: Look for "✅ Achieved" - extract rock name
- **Good progress rocks**: Look for "👾 Made Good Progress" - extract rock name
- **Little progress rocks**: Look for "🚧 Made Little Progress" - extract rock name
- **Failed rocks**: Look for "🥊 Failed" - extract rock name

### PR Details (from "Work PR Summary"):

- Extract PR titles (text before "[X commits]")
- Note if it says "No PR events this week"

### Task Categories (from "Work Task Summary"):

- Count tasks in each category section
- Categories: Research, Design, Coding, Feedback, QA, Admin, Social, OOO

## STEP 3: CALCULATE KEY METRICS

- **Meeting percentage** = (Meeting hours ÷ Total work hours) × 100
- **Productive percentage** = (Coding + Design hours ÷ Total work hours) × 100

## STEP 4: APPLY CLASSIFICATION RULES

### Goes in "What went well":

- Any PRs shipped (list PR names)
- Rocks with ✅ or 👾 status (list rock names)
- Meeting percentage < 20%
- High productive percentage (> 60%)
- Any positive events attended

### Goes in "What didn't go well":

- Zero PRs shipped (if work week)
- Rocks with 🥊 or 🚧 status (list rock names)
- Meeting percentage > 20%
- Very low task count (< 3 without PTO/OOO context)

### Goes in "General":

- All raw numbers (hours, tasks, PRs)
- Meeting and productive percentages
- Event attendance

### Overview Decision:

- **Good week**: More "went well" items than "didn't go well"
- **Rough week**: More "didn't go well" items than "went well"
- **Mixed week**: Equal or unclear (provide context)
