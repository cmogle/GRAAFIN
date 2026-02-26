# Coach Chat UX Upgrade — Implementation Plan

## Context

GRAAFIN is a marathon training PWA with a GPT-enabled Coach as its core differentiator. The coach chat (`/coach`) has a powerful backend — intent classification, state inference, scenario planning, evidence routing, memory — but the UI presents most of this as raw developer output or hides it entirely. The chat feels like a chatbot, not a coach. This plan upgrades the coach chat UX through seven targeted changes, all UI-only, requiring no new API routes, database changes, or backend modifications.

The primary user is Fionnuala, training for Boston 2026.

---

## Files to Modify

| File | Role |
|------|------|
| `src/components/coach/coach-chat-panel.tsx` | Primary file (641 lines) — all 7 changes applied here |
| `src/components/coach/coach-chat-helpers.ts` | **New file** — extracted types, normalizers, and pure helper functions |
| `src/components/coach/coach-avatar.tsx` | **New file** — small CoachAvatar component |

### Reference files (read-only)
- `src/lib/coach/intelligence.ts` — canonical `ActiveBlockSummary` type (has `weekCount` on line 84)
- `src/app/api/coach/context/route.ts` — context endpoint returns `ActiveBlockSummary` with `weekCount`
- `src/components/top-nav.tsx` — Lucide icon + branding pattern reference
- `src/lib/utils.ts` — `cn()` utility for conditional Tailwind classes

---

## Implementation Order

Changes are ordered by dependency — each builds on the previous without conflicts.

### 1. Coach Identity

**Goal:** Replace developer-facing "GPT Coach" with a warm, identifiable coach presence.

**Steps:**
- Add `HeartPulse` import from `lucide-react` (line 4)
- Create `CoachAvatar` component (new file `coach-avatar.tsx`): a `HeartPulse` icon in an emerald circle, two sizes (`sm` for message bubbles, `md` for header)
- Header (lines 402-404): Replace `"GPT Coach"` with `"Coach"`, replace subtitle `"Evidence-based calm · suggest-only"` with `"Grounded in your data"`; add `CoachAvatar size="md"` next to the title
- Assistant message bubbles (lines 516-527): Wrap in a flex row with `CoachAvatar size="sm"` to the left of the bubble
- Loading indicator (lines 566-572): Add `CoachAvatar size="sm"` next to "Coach is thinking..."

### 2. Context Strip Humanisation

**Goal:** Translate system state labels into language the athlete understands.

**Steps:**
- Extend client-side `ActiveBlock` type (line 15-23): add optional `weekCount?: number`
- Create `daysUntilRace(raceDateIso)` helper — returns number of days or null
- Create `humanStateLabel(state)` helper — maps availability state to `{ label, tone }`:
  - `"normal"` → "Training normally" (emerald)
  - `"injury_adaptation"` → "Adapting around injury" (amber)
  - `"medical_hold"` → "Running paused" (rose)
  - `"return_build"` → "Building back" (sky)
- Replace context badge block (lines 415-429):
  - Race badge: `"Boston Marathon · 53 days"` (countdown from race date, fall back to name only if no date)
  - Block badge: `"Week 8 of 12"` — **hidden entirely** when no active block (instead of showing "n/a")
  - State badge: human label with colour from `humanStateLabel()`
  - **Remove** the "Mode: llm" badge entirely

### 3. Contextual Quick Prompts

**Goal:** Show prompts relevant to the athlete's current state instead of static defaults.

**Steps:**
- Replace static `quickPrompts` array (lines 88-93) with `getContextualPrompts(ctx: ContextPayload | null): string[]`
- Selection logic:
  - `coachState.runningAllowed === false` → injury/outage prompts ("What can I do while I'm not running?", "How will this break affect my race?", "What should my return ramp look like?", "Show me outage scenarios")
  - `activeBlock.weekIndex >= 10` → taper/race-week prompts ("Am I tapered enough?", "Race-week schedule?", "Pacing strategy?", "Biggest risks?")
  - `activeBlock.weekIndex != null` (normal in-block) → block-aware prompts (same as current defaults)
  - Default (no block) → general prompts ("What does my training load look like?", "Help me set up a block", "Strengths and weaknesses?", "Suggest a focus")
- Update JSX usage (line 497): `getContextualPrompts(context).map(...)`

### 4. Confidence + Assumptions Disclosure

**Goal:** Show the athlete how confident the coach is and what it's assuming.

**Steps:**
- Create `confidenceLabel(value: number | null)` helper → `{ text, tone }`:
  - `>= 0.75` → "High confidence" (emerald-600)
  - `>= 0.5` → "Moderate confidence" (slate-500)
  - `< 0.5` → "Low confidence" (amber-600)
  - `null` → empty (no label shown)
- Replace the uppercase "Coach" message label (line 527) with: `Coach · High confidence` (confidence part uses the colour from the helper)
- After `stateChanges` display, before `scenarioPlan` display (around line 541), add:
  - Collapsible `<details>` for `assumptionsUsed` — heading: "Coach is assuming (N)"
  - Italic text for `memoryApplied` — "Using your preferences: preference for morning runs, injury note from Feb 12"

### 5. Conversation Structure

**Goal:** Make multi-day, multi-topic conversations scannable.

**Steps:**
- Create `formatDateSeparator(dateString)` helper — returns "Today", "Yesterday", or "Monday, Feb 23" etc.
- Create `getCalendarDay(dateString)` helper — returns `toDateString()` or empty for undefined
- Update message rendering loop (lines 514-563): wrap each message in a fragment that conditionally inserts:
  - **Date separator** when `created_at` day differs from previous message (centred text divider with lines)
  - **Topic shift divider** when consecutive assistant messages have different `intent` values (subtle "topic shift" label)
- Modify `startNewChat()` (line 384): add `window.confirm("Start fresh? Your coach keeps your training history and memory.")` when messages exist; skip prompt when list is empty

### 6. Risk Flag Banner

**Goal:** Make risk flags impossible to miss by promoting them above the conversation.

**Steps:**
- Add `AlertTriangle` to Lucide imports
- Create `riskBannerProps(flags: string[])` helper → `{ text, tone } | null`:
  - `medical_hold` → "Running paused — medical hold" (rose)
  - `load_spike` → "Load spike detected" (amber)
  - `high_monotony` → "High training monotony" (amber)
  - Other → generic "Risk: {flag}" (amber)
- Insert a slim banner between `</header>` and the scroll area (between lines 475-477)
- Banner reads from `latestAssistant.metadata.riskFlags` (already a `useMemo` at line 241), so it auto-updates when messages change

### 7. Actionable Suggested Actions

**Goal:** Make suggested action pills do something when tapped.

**Steps:**
- Add `import { useRouter } from "next/navigation"` and initialise `const router = useRouter()` in component body
- Create `resolveActionTarget(action: string)` helper → `{ type: "navigate", href } | { type: "prefill", text }`:
  - Contains "cockpit" or "Today" → `/dashboard`
  - Contains "plan" or "workout" → `/plan`
  - Contains "block" or "compar" → `/trends`
  - Default → prefill composer with the action text
- Replace static `<span>` pills (lines 552-559) with `<button>` elements that call `router.push()` or `setInput()` + `composerRef.current?.focus()`

---

## Component Extraction

After all changes, the file would reach ~850-900 lines. Extract to keep the main file at ~650-700:

**`src/components/coach/coach-chat-helpers.ts`** (~200 lines):
- All type definitions (`CoachState`, `ActiveBlock`, `ContextPayload`, `ChatMetadata`, `EvidenceItem`, `ScenarioPlan`, `ChatMessage`, `ThreadPayload`)
- All normalizer functions (`normalizeContent`, `normalizeRole`, `normalizeStringArray`, `normalizeEvidence`, `normalizeMetadata`, `normalizeMessages`)
- All pure helpers (`daysUntilRace`, `humanStateLabel`, `confidenceLabel`, `riskBannerProps`, `resolveActionTarget`, `getContextualPrompts`, `formatDateSeparator`, `getCalendarDay`, `badgeToneForState`)

**`src/components/coach/coach-avatar.tsx`** (~15 lines):
- `CoachAvatar` component

---

## Edge Cases & Gotchas

- **`weekCount` missing from client type:** The `ActiveBlock` type omits `weekCount` but the API already returns it. Add as optional, default to 12 in display.
- **`created_at` undefined on temp messages:** Locally-created messages (before API round-trip) have no timestamp. Date separator logic handles undefined by returning empty string — no separator appears.
- **`confidence` null for transient replies:** `confidenceLabel` returns empty for null — no indicator shown. Desired behavior.
- **`intent` null on v1 fallback:** Topic dividers require v2 orchestrator. Degrades gracefully — no dividers appear.
- **`resolveActionTarget` false positives:** "plan" matches "explain" — but "explain" is not a generated suggested action in the current system. Monitor if prompts expand.
- **Mobile layout:** Risk banner adds ~32px height between header and scroll area. The `flex-1 overflow-y-auto` scroll container handles this correctly.
- **Wellness integration:** The orchestrator-v2 and chat API route now include a `WellnessSnapshot` integration (`src/lib/wellness/context.ts`) with its own risk flags. The risk banner handles wellness-originated risk flags naturally since they are merged into the `riskFlags` array by the orchestrator. No special handling needed in the chat panel — the generic "Risk: {flag}" catch-all covers unmatched flag strings.

---

## Verification Checklist

**Identity:**
- [ ] Header shows "Coach" with HeartPulse avatar, subtitle "Grounded in your data"
- [ ] Each assistant bubble has small avatar to its left
- [ ] Loading state includes avatar

**Context strip:**
- [ ] Race badge shows countdown days ("Boston Marathon · 53 days")
- [ ] Block badge shows "Week 8 of 12" or is hidden when no block
- [ ] State badge shows human label with correct colour
- [ ] "Mode: llm" badge is gone

**Quick prompts:**
- [ ] Prompts adapt when `runningAllowed === false`
- [ ] Prompts adapt for taper weeks (weekIndex >= 10)
- [ ] Prompts show in-block text when block is active
- [ ] Prompts show default text when no block

**Confidence & assumptions:**
- [ ] Confidence label appears on assistant messages (high/moderate/low with colours)
- [ ] Assumptions collapsible appears when `assumptionsUsed` is non-empty
- [ ] Memory applied note appears when `memoryApplied` is non-empty

**Conversation structure:**
- [ ] Date separators between messages from different days
- [ ] "Today" / "Yesterday" labels work correctly
- [ ] Topic shift dividers appear on intent changes
- [ ] "New chat" shows confirmation when messages exist, skips when empty

**Risk banner:**
- [ ] Banner appears below header for medical_hold (rose), load_spike (amber), high_monotony (amber)
- [ ] Banner disappears when new message has no risk flags

**Suggested actions:**
- [ ] Action pills are tappable buttons with hover states
- [ ] Navigation actions route to correct pages
- [ ] Default actions prefill the composer

**General:**
- [ ] Mobile viewport (375px) renders correctly
- [ ] `next build` succeeds with no errors
- [ ] No regressions in existing chat send/receive flow
