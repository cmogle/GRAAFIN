# V0 Prompt Pack — Fionnuala Run Coach

Use these prompts directly in [v0.dev](https://v0.dev) (Vercel AI Designer).

---

## 0) Global shell prompt (run first)

```txt
Design a premium, clean web app UI called “Fionnuala Run Coach”.

Tech/style constraints:
- Next.js App Router friendly structure
- Tailwind CSS classes only
- Use shadcn/ui-style components (Card, Badge, Button, Input, Table, Tabs, Progress)
- Icon style: lucide-react
- Light mode only for now
- Color palette: slate + blue accent, subtle success/warning/error badges
- Layout: sticky top nav + left sidebar + main content area
- Responsive behavior:
  - Desktop: sidebar visible
  - Mobile: sidebar collapses into sheet/menu button
- Typography:
  - Headings: semibold, compact
  - Body: readable, low-noise
- Visual tone: calm, data-focused, coaching product

Create reusable layout components:
1) TopNav (brand + status pill)
2) SidebarNav (Dashboard, Query, Plan, Alerts, Profile)
3) AppShell wrapper
4) Reusable KPI card component
5) Reusable SectionCard component

Important:
- Return production-grade React component code with Tailwind classes.
- Keep components modular and reusable.
- No backend calls yet; use mock data props.
```

---

## 1) Dashboard screen prompt

```txt
Create a Dashboard screen for a running coach app using the AppShell layout.

Page title:
- “Hi Fionnuala 👋”
Subtitle:
- “Weekly training snapshot powered by live Strava data.”

Sections to include:

1) KPI row (4 cards)
- Strava Connection: Connected / Not connected badge
- Weekly Distance: e.g. 52.4 km
- Run Count: e.g. 6
- Avg Pace: e.g. 5:08/km

2) Sync Status card
- Last successful sync timestamp
- Latest activity summary
- Primary button: “Trigger Sync”
- Secondary text: “Manual refresh via Strava sync webhook”

3) Coaching Alerts card (right column on desktop)
- List of 2-3 alert items with color-coded badges
- Example statuses: Warning, Risk, Stable

4) Recent Activities table
Columns:
- Date
- Run name
- Distance
- Moving Time
- Avg Pace
Use 8-10 mock rows.

Design details:
- Rounded cards (xl/2xl), subtle borders and shadows
- Clear spacing rhythm
- Mobile-first responsive stacking
```

---

## 2) Query Coach screen prompt

```txt
Create a “Query Coach” page in the same AppShell.

Goal:
A natural-language analytics page where the runner asks questions about training data.

Layout:
- Left/main: question input panel
- Right: answer/result panel
- On mobile: stack vertically

Components:
1) Question card
- Label: “Ask a question”
- Multiline textarea
- Primary button: “Run query”
- Quick prompt chips:
  - “Am I on track this week?”
  - “How much did I run in the last 14 days?”
  - “How many easy runs vs workouts this month?”
  - “Which sessions had highest HR drift?”

2) Answer card
- Title: “Coach answer”
- Text response area (supports multiline)
- Optional mini metrics row (distance, sessions, compliance)
- Placeholder chart container area (for future chart payloads)

Style:
- Keep it clean and analytical
- Use muted backgrounds for chips
- Make CTA obvious
```

---

## 3) Training Plan screen prompt

```txt
Create a “Training Plan & Objectives” page in the same AppShell.

Purpose:
Capture race objective and weekly workout structure.

Sections:

1) Objective form card
Fields:
- Goal race (text)
- Goal race date (date)
- Goal finish time (hh:mm:ss)
- Goal weekly volume (km)
- Optional notes
Buttons:
- Save objective
- Reset

2) Weekly Plan table card
Columns:
- Day
- Workout Type (Easy, Intervals, Tempo, Long, Rest)
- Details
- Planned Distance
- Planned Duration
- Status (Planned/Done/Skipped)
- Actions (Edit/Delete)
Include mock rows Mon-Sun.

3) Summary strip
- Total planned weekly km
- Key session count
- Long run distance

Design:
- Spreadsheet-like clarity without looking enterprise-heavy
- Good empty state for “No plan created yet”
```

---

## 4) Alerts & Readiness screen prompt

```txt
Create a “Readiness & Alerts” page in the same AppShell.

Sections:

1) KPI cards (4)
- Readiness score (0-100) with status color
- Load score
- Consistency score
- Recovery score

2) Readiness trend card
- Placeholder line chart area for last 14 days
- Small legend chips

3) Alerts timeline card
- Chronological items with severity:
  - Red: high risk
  - Amber: caution
  - Blue/Green: informational
Each item includes:
- title
- short description
- timestamp
- recommended action text

4) Recommended actions card
- 3 bullet recommendations generated from alerts
- Example: “Reduce next quality session volume by 15%”

Style:
- Make severity visually obvious but not alarming
- Keep it coach-like and practical
```

---

## 5) Profile & Connections screen prompt

```txt
Create a “Profile & Connections” page in the same AppShell.

Sections:

1) Athlete profile card
- Name
- Timezone
- Preferred units (km / min/km)
- Goal race

2) Connected services card
Rows with status badges:
- Google (Connected)
- Strava (Connected)
- Supabase (Active)
- OpenAI (Not configured)
Actions:
- Reconnect
- Test connection

3) Environment/Config card
- Read-only keys presence indicators (no secret values shown)
- Last sync run
- Last data refresh

4) Danger zone (collapsed by default)
- Disconnect service buttons
- Confirmation modal requirement

Style:
- Simple systems page
- Strong status clarity
```
