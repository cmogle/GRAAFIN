import { CockpitPayload } from "@/lib/mobile/cockpit";

export type CoachIntent =
  | "status_check"
  | "plan_adjustment"
  | "race_strategy"
  | "load_comparison"
  | "injury_adaptation"
  | "external_evidence"
  | "logistics_constraint"
  | "other";

export type AvailabilityState = "normal" | "injury_adaptation" | "medical_hold" | "return_build";

export type QueryRoute = "internal" | "external" | "mixed";

export type CoachState = {
  availabilityState: AvailabilityState;
  runningAllowed: boolean;
  expectedReturnDate: string | null;
  confidence: number;
  source: "system" | "user" | "coach";
  updatedAt: string | null;
};

export type StateUpdate = {
  availabilityState?: AvailabilityState;
  runningAllowed?: boolean;
  expectedReturnDate?: string | null;
  confidence?: number;
  source?: "system" | "user" | "coach";
  note?: string;
  constraintsToAdd?: string[];
};

export type ReferenceResolution = {
  resolvedMessage: string;
  note: string | null;
};

export type ScenarioPlanItem = {
  outageDays: number;
  missedSessions: number;
  missedKm: number;
  riskLevel: "low" | "moderate" | "high";
  planImpact: string;
  returnFocus: string;
};

export type ScenarioPlan = {
  items: ScenarioPlanItem[];
  blockWeek: number | null;
  weeksToRace: number | null;
  generatedAt: string;
};

export type EvidenceItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  topic: string;
  claim: string;
  confidence: number;
  publishedAt: string | null;
  retrievedAt: string | null;
  relevanceScore: number;
  sourceType: "curated" | "community";
};

export type ActiveBlockSummary = {
  blockKey: string;
  raceName: string;
  raceDate: string;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  avgWeeklyKm: number;
  longRunCount: number;
  qualitySessionDensity: number;
  taperSimilarity: number | null;
  confidence: number;
  weekIndex: number | null;
  weekCount: number;
  comparator: {
    priorBlockCount: number;
    priorMedianWeeklyKm: number | null;
    weeklyDeltaKm: number | null;
    longRunDelta: number | null;
    confidence: "low" | "moderate" | "high";
  };
};

const INJURY_WORDS = ["injury", "pain", "sprain", "fracture", "rib", "ankle", "niggle", "hurt"];
const HOLD_WORDS = ["not cleared", "cannot run", "can't run", "no running", "surgeon", "doctor said no"];
const CLEAR_WORDS = ["cleared", "all clear", "okay to run", "can run again", "resumed running"];
const EXTERNAL_WORDS = ["best practice", "research", "studies", "evidence", "community", "what do elite", "outside"];
const LOAD_WORDS = ["load", "ratio", "readiness", "on track", "sustainable", "acwr", "acute", "chronic"];
const STRATEGY_WORDS = ["boston", "race day", "strategy", "pace plan", "split", "fueling", "taper"];
const ADJUSTMENT_WORDS = ["adjust", "change", "modify", "adapt", "update plan", "week plan", "session focus"];
const LOGISTICS_WORDS = ["travel", "work trip", "busy", "schedule", "time", "kids", "commute"];

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function classifyIntent(message: string, fallbackIntent: CoachIntent = "other"): CoachIntent {
  const text = message.trim().toLowerCase();
  if (!text) return fallbackIntent;

  if (includesAny(text, EXTERNAL_WORDS)) return "external_evidence";
  if (includesAny(text, INJURY_WORDS)) return "injury_adaptation";
  if (includesAny(text, LOAD_WORDS)) return "load_comparison";
  if (includesAny(text, STRATEGY_WORDS)) return "race_strategy";
  if (includesAny(text, ADJUSTMENT_WORDS)) return "plan_adjustment";
  if (includesAny(text, LOGISTICS_WORDS)) return "logistics_constraint";
  if (text.includes("how am i") || text.includes("where am i") || text.includes("status")) return "status_check";
  return fallbackIntent;
}

export function planQueryRoutes(intent: CoachIntent, message: string): QueryRoute {
  if (intent === "external_evidence") return "mixed";
  const lower = message.toLowerCase();
  if (includesAny(lower, EXTERNAL_WORDS) && includesAny(lower, LOAD_WORDS.concat(STRATEGY_WORDS))) return "mixed";
  if (includesAny(lower, EXTERNAL_WORDS)) return "external";
  return "internal";
}

export function inferStateUpdate(message: string, current: CoachState): StateUpdate | null {
  const lower = message.toLowerCase();
  const next: StateUpdate = {};
  let changed = false;

  if (includesAny(lower, HOLD_WORDS)) {
    next.availabilityState = "medical_hold";
    next.runningAllowed = false;
    next.confidence = 0.9;
    next.source = "user";
    next.note = "Athlete explicitly reported no medical clearance to run.";
    changed = true;
  } else if (includesAny(lower, CLEAR_WORDS)) {
    next.availabilityState = "return_build";
    next.runningAllowed = true;
    next.confidence = 0.85;
    next.source = "user";
    next.note = "Athlete reported medical clearance to resume running.";
    changed = true;
  } else if (includesAny(lower, INJURY_WORDS)) {
    next.availabilityState = current.runningAllowed ? "injury_adaptation" : current.availabilityState;
    next.runningAllowed = current.runningAllowed;
    next.confidence = clamp(current.confidence + 0.08, 0.5, 0.95);
    next.source = "user";
    next.note = "Athlete reported symptoms/injury context requiring adaptation.";
    changed = true;
  }

  const constraintsToAdd: string[] = [];
  if (lower.includes("travel")) constraintsToAdd.push("travel constraint");
  if (lower.includes("busy")) constraintsToAdd.push("high time pressure");
  if (lower.includes("work")) constraintsToAdd.push("work schedule limitation");
  if (constraintsToAdd.length) {
    next.constraintsToAdd = constraintsToAdd;
    changed = true;
  }

  if (!changed) return null;
  return next;
}

export function applyStateUpdate(current: CoachState, update: StateUpdate | null): CoachState {
  if (!update) return current;
  return {
    availabilityState: update.availabilityState ?? current.availabilityState,
    runningAllowed: update.runningAllowed ?? current.runningAllowed,
    expectedReturnDate:
      update.expectedReturnDate === undefined ? current.expectedReturnDate : update.expectedReturnDate,
    confidence: clamp(update.confidence ?? current.confidence, 0.1, 0.99),
    source: update.source ?? current.source,
    updatedAt: new Date().toISOString(),
  };
}

export function resolveReferences(message: string, entityMemory: Record<string, unknown>): ReferenceResolution {
  const text = message.trim();
  if (!text) return { resolvedMessage: text, note: null };

  const lower = text.toLowerCase();
  const hasReference =
    /\b(that|it|same|this|those|them)\b/.test(lower) ||
    lower.includes("as before") ||
    lower.includes("again");
  if (!hasReference) return { resolvedMessage: text, note: null };

  const lastTopic = typeof entityMemory.lastTopic === "string" ? entityMemory.lastTopic : null;
  const lastConstraint = typeof entityMemory.lastConstraint === "string" ? entityMemory.lastConstraint : null;
  const resolvedContext = [lastTopic, lastConstraint].filter(Boolean).join("; ");
  if (!resolvedContext) return { resolvedMessage: text, note: null };

  return {
    resolvedMessage: `${text}\n\n[resolved_reference_context: ${resolvedContext}]`,
    note: `Resolved reference using recent context (${resolvedContext}).`,
  };
}

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(+date)) return null;
  const now = new Date();
  const deltaMs = date.getTime() - now.getTime();
  return Math.max(0, Math.ceil(deltaMs / (24 * 60 * 60 * 1000)));
}

export function buildScenarioPlan(params: {
  cockpit: CockpitPayload;
  coachState: CoachState;
  activeBlock: ActiveBlockSummary | null;
  outageDays?: number[];
}): ScenarioPlan {
  const { cockpit, coachState, activeBlock } = params;
  const outageDays = params.outageDays ?? [3, 7, 14];
  const weeksToRace = daysUntil(activeBlock?.raceDate ?? null);
  const weeklyTarget = Math.max(
    activeBlock?.avgWeeklyKm ?? 0,
    activeBlock?.comparator.priorMedianWeeklyKm ?? 0,
    35,
  );
  const sessionPerWeek = Math.max(cockpit.todayPlan.workouts.length * 3, 4);

  const items = outageDays.map((days) => {
    const missedKm = Number(((weeklyTarget * days) / 7).toFixed(1));
    const missedSessions = Math.max(1, Math.round((sessionPerWeek * days) / 7));
    const severity = missedKm / Math.max(1, weeklyTarget);

    let riskLevel: "low" | "moderate" | "high" = "low";
    if (severity >= 1.4 || days >= 14) riskLevel = "high";
    else if (severity >= 0.8 || days >= 7) riskLevel = "moderate";

    const planImpact =
      days <= 3
        ? "Minor disruption if return progression is controlled."
        : days <= 7
          ? "Moderate disruption; one quality cycle may need compression."
          : "Material disruption; rebuild block priorities and trim non-essential intensity.";

    const returnFocus =
      coachState.runningAllowed && days <= 3
        ? "Resume with easy aerobic sessions, then reintroduce quality after symptom check."
        : "Protect return ramp: easy volume first, delay intensity until stability is confirmed.";

    return { outageDays: days, missedSessions, missedKm, riskLevel, planImpact, returnFocus };
  });

  return {
    items,
    blockWeek: activeBlock?.weekIndex ?? null,
    weeksToRace,
    generatedAt: new Date().toISOString(),
  };
}

export function formatScenarioPlan(plan: ScenarioPlan): string {
  const headerBits: string[] = [];
  if (plan.blockWeek != null) headerBits.push(`block week ${plan.blockWeek}`);
  if (plan.weeksToRace != null) headerBits.push(`${plan.weeksToRace} days to race`);
  const header = headerBits.length ? `Scenario planner (${headerBits.join(" · ")}):` : "Scenario planner:";

  const rows = plan.items.map(
    (item) =>
      `- ${item.outageDays}d outage: miss ~${item.missedKm.toFixed(1)} km / ${item.missedSessions} sessions, ` +
      `${item.riskLevel} risk. ${item.planImpact} Return focus: ${item.returnFocus}`,
  );
  return [header, ...rows].join("\n");
}

export function buildAssumptions(params: {
  activeBlock: ActiveBlockSummary | null;
  coachState: CoachState;
  route: QueryRoute;
}): string[] {
  const assumptions: string[] = [];
  if (!params.activeBlock) assumptions.push("No active structured block found; using current load trend as baseline.");
  if (!params.coachState.expectedReturnDate && !params.coachState.runningAllowed) {
    assumptions.push("Return-to-run date unknown; outage scenarios use 3/7/14 day horizons.");
  }
  if (params.route !== "internal") assumptions.push("External evidence is constrained to curated sources.");
  return assumptions;
}

export function summarizeStateChanges(previous: CoachState, next: CoachState): string[] {
  const out: string[] = [];
  if (previous.availabilityState !== next.availabilityState) {
    out.push(`availability_state:${previous.availabilityState}->${next.availabilityState}`);
  }
  if (previous.runningAllowed !== next.runningAllowed) {
    out.push(`running_allowed:${String(previous.runningAllowed)}->${String(next.runningAllowed)}`);
  }
  if (previous.expectedReturnDate !== next.expectedReturnDate) {
    out.push(`expected_return_date:${previous.expectedReturnDate ?? "null"}->${next.expectedReturnDate ?? "null"}`);
  }
  return out;
}

export function defaultCoachState(): CoachState {
  return {
    availabilityState: "normal",
    runningAllowed: true,
    expectedReturnDate: null,
    confidence: 0.6,
    source: "system",
    updatedAt: null,
  };
}

export function shouldCompareBlocks(intent: CoachIntent) {
  return intent === "plan_adjustment" || intent === "load_comparison" || intent === "race_strategy";
}
