# Onboarding Redesign Plan (Mobile-First, Fionnuala-Primary)

## Goals
- Remove setup friction and ambiguity on first launch.
- Reflect real system behavior (Strava sync is automatic, plan setup optional).
- Move user to high-utility actions in under 60 seconds.

## Guiding Principles
- One primary action per screen.
- Show system status, not setup instructions for already-automated steps.
- Prioritize `Today` cockpit and `Coach` first-value moments.
- Keep onboarding editable and resumable from `Profile`.

## New Flow (v1)
1. `Welcome / Sign-in`
   - CTA: `Continue with Google`.
   - Copy: "Sign in to load your synced training history and coach context."
   - Remove legacy setup checklist from login screen.
2. `Sync Warmup` (post-auth)
   - Show progress states:
     - `Checking latest activities`
     - `Sync complete` or `Sync in progress`
   - CTA: `Open Today`.
   - Secondary: `Go to Coach`.
3. `First Value`
   - Card 1: `Today readiness + session focus`.
   - Card 2: `Ask Coach` with 3 quick prompts.
   - Optional card: `Plan setup (optional this phase)`.
4. `Onboarding Complete`
   - Show persistent "Setup status" in Profile:
     - Account connected
     - Recent activity available
     - First coach conversation
     - Plan setup (optional)

## Information Architecture Changes
- Login page becomes auth-only + trust copy.
- Onboarding page becomes status + first-value launcher (no outdated setup tasks).
- Profile keeps advanced/manual controls, not primary onboarding CTAs.

## UX Copy Updates
- Replace:
  - "Connect Strava" -> "Strava sync runs automatically"
  - "Import training plan" -> "Plan setup (optional)"
- Keep tone: concise, evidence-based, no marketing filler.

## Technical Implementation Slices
1. `Slice A` (auth correctness + copy accuracy)
   - Stabilize OAuth callback error handling and `next` routing.
   - Update login/onboarding copy.
2. `Slice B` (post-auth warmup)
   - Add transient sync-status panel after first sign-in.
   - Reuse `/api/sync/trigger` + `getStravaStatus`.
3. `Slice C` (first-value prompts)
   - Preload coach quick prompts from cockpit/readiness context.
4. `Slice D` (profile setup center)
   - Add setup status module and optional plan prompt.

## Acceptance Criteria
- No OAuth loop under valid Supabase/Google redirect config.
- Login page contains no manual Strava connection instruction.
- First authenticated session reaches useful training insight within one tap.
- Onboarding completion does not require plan creation.
