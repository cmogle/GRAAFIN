import { QueryLearningSummary } from "@/lib/coach/types";

export type CoachState = {
  availabilityState: "normal" | "injury_adaptation" | "medical_hold" | "return_build";
  runningAllowed: boolean;
  expectedReturnDate: string | null;
  confidence: number;
  source: string;
  updatedAt: string | null;
};

export type ActiveBlock = {
  raceName: string;
  raceDate: string;
  weekIndex: number | null;
  weekCount?: number;
  comparator: {
    weeklyDeltaKm: number | null;
    confidence: "low" | "moderate" | "high";
  };
};

export type EvidenceItem = {
  id: string;
  title: string;
  url: string;
  domain: string;
  claim: string;
  confidence: number;
  publishedAt: string | null;
};

export type ScenarioPlan = {
  items: Array<{
    outageDays: number;
    missedSessions: number;
    missedKm: number;
    riskLevel: "low" | "moderate" | "high";
    planImpact: string;
    returnFocus: string;
  }>;
};

export type ChatMetadata = {
  suggestedActions: string[];
  followUpQuestions: string[];
  riskFlags: string[];
  intent?: string | null;
  responseMode?: string | null;
  coachState?: CoachState | null;
  activeBlock?: ActiveBlock | null;
  stateChanges?: string[];
  evidenceItems?: EvidenceItem[];
  assumptionsUsed?: string[];
  memoryApplied?: string[];
  queryRoute?: string | null;
  scenarioPlan?: ScenarioPlan | null;
  unresolvedQuestions?: string[];
  learning?: QueryLearningSummary | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at?: string;
  confidence?: number | null;
  metadata?: ChatMetadata | null;
};

export type ThreadPayload = {
  thread: { id: string } | null;
  messages: Array<Partial<ChatMessage> & { id?: unknown; role?: unknown; content?: unknown }>;
  coachUnavailable?: boolean;
  warning?: unknown;
};

export type ContextPayload = {
  objective?: { goalRaceName?: string; goalRaceDate?: string | null } | null;
  coachState?: CoachState | null;
  activeBlock?: ActiveBlock | null;
  generatedAt?: string;
  adaptation?: {
    seasonPhase?: string;
    topIntents7d?: string[];
    topTopics7d?: string[];
    recommendedModules?: Array<{ moduleKey: string; score: number; reason: string; autoShown: boolean }>;
  } | null;
};

export function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => normalizeContent(item)).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "message", "recommendation", "rationale"]) {
      const candidate = normalizeContent(record[key]);
      if (candidate) return candidate;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return "";
}

export function normalizeRole(value: unknown): ChatMessage["role"] {
  return value === "assistant" || value === "system" ? value : "user";
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeContent(item).trim()).filter(Boolean);
}

export function normalizeEvidence(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: normalizeContent(row.id),
        title: normalizeContent(row.title),
        url: normalizeContent(row.url),
        domain: normalizeContent(row.domain),
        claim: normalizeContent(row.claim),
        confidence: typeof row.confidence === "number" ? row.confidence : Number(row.confidence ?? 0.7),
        publishedAt: row.publishedAt == null ? null : normalizeContent(row.publishedAt),
      };
    })
    .filter((item) => item.title.length > 0);
}

export function normalizeMetadata(value: unknown): ChatMetadata {
  const metadataRaw = (value ?? {}) as Record<string, unknown>;
  return {
    suggestedActions: normalizeStringArray(metadataRaw.suggestedActions),
    followUpQuestions: normalizeStringArray(metadataRaw.followUpQuestions),
    riskFlags: normalizeStringArray(metadataRaw.riskFlags),
    intent: metadataRaw.intent == null ? null : normalizeContent(metadataRaw.intent),
    responseMode: metadataRaw.responseMode == null ? null : normalizeContent(metadataRaw.responseMode),
    coachState: (metadataRaw.coachState as CoachState | null | undefined) ?? null,
    activeBlock: (metadataRaw.activeBlock as ActiveBlock | null | undefined) ?? null,
    stateChanges: normalizeStringArray(metadataRaw.stateChanges),
    evidenceItems: normalizeEvidence(metadataRaw.evidenceItems),
    assumptionsUsed: normalizeStringArray(metadataRaw.assumptionsUsed),
    memoryApplied: normalizeStringArray(metadataRaw.memoryApplied),
    queryRoute: metadataRaw.queryRoute == null ? null : normalizeContent(metadataRaw.queryRoute),
    scenarioPlan: (metadataRaw.scenarioPlan as ScenarioPlan | null | undefined) ?? null,
    unresolvedQuestions: normalizeStringArray(metadataRaw.unresolvedQuestions),
    learning: (metadataRaw.learning as QueryLearningSummary | null | undefined) ?? null,
  };
}

export function normalizeMessages(rawMessages: ThreadPayload["messages"]): ChatMessage[] {
  return (rawMessages ?? []).map((raw, index) => {
    return {
      id: typeof raw.id === "string" ? raw.id : `msg-${Date.now()}-${index}`,
      role: normalizeRole(raw.role),
      content: normalizeContent(raw.content),
      created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
      confidence: typeof raw.confidence === "number" ? raw.confidence : null,
      metadata: normalizeMetadata(raw.metadata),
    };
  });
}

export function badgeToneForState(state: CoachState | null): string {
  if (!state) return "bg-slate-100 text-slate-700";
  if (!state.runningAllowed || state.availabilityState === "medical_hold") return "bg-rose-100 text-rose-700";
  if (state.availabilityState === "injury_adaptation") return "bg-amber-100 text-amber-700";
  if (state.availabilityState === "return_build") return "bg-sky-100 text-sky-700";
  return "bg-emerald-100 text-emerald-700";
}

export function daysUntilRace(raceDateIso: string | null | undefined): number | null {
  if (!raceDateIso) return null;
  const parsed = new Date(`${raceDateIso}T00:00:00.000Z`);
  if (Number.isNaN(+parsed)) return null;
  return Math.max(0, Math.ceil((parsed.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function humanStateLabel(state: CoachState | null): { label: string; tone: string } {
  if (!state) return { label: "Training normally", tone: "bg-emerald-100 text-emerald-700" };
  if (state.availabilityState === "injury_adaptation") {
    return { label: "Adapting around injury", tone: "bg-amber-100 text-amber-700" };
  }
  if (state.availabilityState === "medical_hold" || !state.runningAllowed) {
    return { label: "Running paused", tone: "bg-rose-100 text-rose-700" };
  }
  if (state.availabilityState === "return_build") {
    return { label: "Building back", tone: "bg-sky-100 text-sky-700" };
  }
  return { label: "Training normally", tone: "bg-emerald-100 text-emerald-700" };
}

export function confidenceLabel(value: number | null | undefined): { text: string; tone: string } | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value >= 0.75) return { text: "High confidence", tone: "text-emerald-600" };
  if (value >= 0.5) return { text: "Moderate confidence", tone: "text-slate-500" };
  return { text: "Low confidence", tone: "text-amber-600" };
}

export function riskBannerProps(flags: string[]): { text: string; tone: string } | null {
  if (flags.includes("medical_hold")) return { text: "Running paused - medical hold", tone: "border-rose-200 bg-rose-50 text-rose-800" };
  if (flags.includes("load_spike")) return { text: "Load spike detected", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  if (flags.includes("high_monotony")) return { text: "High training monotony", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  if (!flags.length) return null;
  return { text: `Risk: ${flags[0].replace(/_/g, " ")}`, tone: "border-amber-200 bg-amber-50 text-amber-800" };
}

export function resolveActionTarget(action: string): { type: "navigate"; href: string } | { type: "prefill"; text: string } {
  const lower = action.toLowerCase();
  if (lower.includes("cockpit") || lower.includes("today")) return { type: "navigate", href: "/dashboard" };
  if (lower.includes("plan") || lower.includes("workout")) return { type: "navigate", href: "/plan" };
  if (lower.includes("block") || lower.includes("compar")) return { type: "navigate", href: "/trends" };
  return { type: "prefill", text: action };
}

export function getContextualPrompts(ctx: ContextPayload | null): string[] {
  const runningAllowed = ctx?.coachState?.runningAllowed;
  const weekIndex = ctx?.activeBlock?.weekIndex;
  const topIntent = ctx?.adaptation?.topIntents7d?.[0] ?? "";
  const seasonPhase = ctx?.adaptation?.seasonPhase ?? "";
  if (topIntent === "injury_adaptation") {
    return [
      "What can I do while I'm not running?",
      "How should I structure recovery this week?",
      "What should my return ramp look like?",
      "Show me outage scenarios",
    ];
  }
  if (
    topIntent === "race_strategy" ||
    seasonPhase === "taper" ||
    seasonPhase === "race_week"
  ) {
    return [
      "Am I tapered enough?",
      "What should race week look like?",
      "What's my pacing strategy?",
      "What are the biggest race risks now?",
    ];
  }
  if (runningAllowed === false) {
    return [
      "What can I do while I'm not running?",
      "How will this break affect my race?",
      "What should my return ramp look like?",
      "Show me outage scenarios",
    ];
  }
  if (typeof weekIndex === "number" && weekIndex >= 10) {
    return [
      "Am I tapered enough?",
      "What should race week look like?",
      "What's my pacing strategy?",
      "What are the biggest race risks now?",
    ];
  }
  if (typeof weekIndex === "number") {
    return [
      "Am I on track for Boston from where I am right now?",
      "Compare this week to my best historical marathon blocks.",
      "What is the single highest-value adjustment for this week?",
      "Use curated best practices and my own data to refine my plan.",
    ];
  }
  return [
    "What does my training load look like?",
    "Help me set up a block.",
    "Where are my strengths and weaknesses?",
    "Suggest a focus for this week.",
  ];
}

export function getCalendarDay(dateString: string | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(+date)) return "";
  return date.toDateString();
}

export function formatDateSeparator(dateString: string | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (Number.isNaN(+date)) return "";
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const deltaDays = Math.round((today.getTime() - target.getTime()) / (24 * 60 * 60 * 1000));
  if (deltaDays === 0) return "Today";
  if (deltaDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
