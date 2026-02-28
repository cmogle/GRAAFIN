import { SupabaseClient } from "@supabase/supabase-js";
import {
  SeasonPhase,
  WorkbenchModuleDescriptor,
  WorkbenchModuleKey,
  WorkbenchRankedModule,
  WorkbenchSignalBundle,
  WorkbenchSurface,
  WorkbenchVisibility,
} from "@/lib/coach/types";

const COACH_MODULES: WorkbenchModuleDescriptor[] = [
  { key: "risk_banner", title: "Risk Watch", description: "Elevate current risk flags and mitigation cues.", surface: "coach" },
  { key: "scenario_planner", title: "Scenario Planner", description: "Show outage and adaptation scenarios for current block context.", surface: "coach" },
  { key: "assumption_trace", title: "Assumptions", description: "Expose coach assumptions used to shape recommendations.", surface: "coach" },
  { key: "memory_trace", title: "Memory Applied", description: "Show durable athlete context influencing this response.", surface: "coach" },
  { key: "evidence_stack", title: "Evidence Stack", description: "Citations and source-backed rationale for the latest guidance.", surface: "coach" },
  { key: "action_rail", title: "Action Rail", description: "Fast follow-up actions and next-step prompts.", surface: "coach" },
];

const DASHBOARD_MODULES: WorkbenchModuleDescriptor[] = [
  { key: "readiness_focus", title: "Readiness Focus", description: "Prioritize the most relevant readiness signals for today.", surface: "dashboard" },
  { key: "block_progress", title: "Block Progress", description: "Track current block phase and race countdown alignment.", surface: "dashboard" },
  { key: "load_risk", title: "Load Risk", description: "Highlight load spike, monotony, and resilience risk trends.", surface: "dashboard" },
  { key: "wellness_recovery", title: "Wellness & Recovery", description: "Surface recovery, sleep, stress, and fueling context.", surface: "dashboard" },
  { key: "plan_adherence", title: "Plan Adherence", description: "Show plan completion and consistency against target structure.", surface: "dashboard" },
  { key: "query_theme_summary", title: "Query Themes", description: "Summarize recent questions shaping the current coaching focus.", surface: "dashboard" },
];

const MODULES_BY_SURFACE: Record<WorkbenchSurface, WorkbenchModuleDescriptor[]> = {
  coach: COACH_MODULES,
  dashboard: DASHBOARD_MODULES,
};

const RISK_WEIGHT_MODULES = new Set<WorkbenchModuleKey>(["risk_banner", "load_risk", "wellness_recovery", "scenario_planner"]);
const UNRESOLVED_WEIGHT_MODULES = new Set<WorkbenchModuleKey>(["action_rail", "query_theme_summary", "scenario_planner"]);
const FEEDBACK_POSITIVE = new Set(["thumb_up", "module_open"]);
const FEEDBACK_NEGATIVE = new Set(["thumb_down", "module_hide"]);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number) {
  return Number(value.toFixed(3));
}

function daysSince(iso: string | null | undefined) {
  if (!iso) return 28;
  const parsed = new Date(iso);
  if (Number.isNaN(+parsed)) return 28;
  return Math.max(0, (Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000));
}

function recencyDecay(days: number) {
  return Math.exp(-days / 14);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
    .filter((entry) => entry.length > 0);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function seasonMatch(moduleKey: WorkbenchModuleKey, seasonPhase: SeasonPhase) {
  if (seasonPhase === "recovery") {
    return moduleKey === "wellness_recovery" || moduleKey === "readiness_focus" ? 1 : 0.3;
  }
  if (seasonPhase === "race_week") {
    return moduleKey === "block_progress" || moduleKey === "readiness_focus" ? 1 : 0.35;
  }
  if (seasonPhase === "taper") {
    return moduleKey === "block_progress" || moduleKey === "load_risk" ? 0.9 : 0.45;
  }
  if (seasonPhase === "peak") {
    return moduleKey === "load_risk" || moduleKey === "scenario_planner" ? 0.9 : 0.55;
  }
  if (seasonPhase === "build") {
    return moduleKey === "plan_adherence" || moduleKey === "block_progress" ? 0.85 : 0.6;
  }
  return moduleKey === "plan_adherence" || moduleKey === "query_theme_summary" ? 0.8 : 0.55;
}

function intentModuleMap(intent: string): WorkbenchModuleKey[] {
  if (intent === "injury_adaptation") return ["risk_banner", "scenario_planner", "wellness_recovery"];
  if (intent === "race_strategy") return ["block_progress", "readiness_focus", "action_rail"];
  if (intent === "load_comparison") return ["load_risk", "readiness_focus", "block_progress"];
  if (intent === "external_evidence") return ["evidence_stack", "query_theme_summary", "action_rail"];
  if (intent === "plan_adjustment") return ["plan_adherence", "action_rail", "block_progress"];
  if (intent === "logistics_constraint") return ["scenario_planner", "action_rail", "query_theme_summary"];
  return ["readiness_focus", "action_rail", "query_theme_summary"];
}

export function getModuleCandidates(params: {
  intent: string;
  riskFlags: string[];
  seasonPhase: SeasonPhase;
}): WorkbenchModuleKey[] {
  const modules = new Set<WorkbenchModuleKey>(intentModuleMap(params.intent));
  if (params.riskFlags.length > 0) {
    modules.add("risk_banner");
    modules.add("load_risk");
    modules.add("wellness_recovery");
  }
  if (params.seasonPhase === "taper" || params.seasonPhase === "race_week") {
    modules.add("block_progress");
    modules.add("readiness_focus");
  }
  return Array.from(modules);
}

function moduleReason(params: {
  moduleKey: WorkbenchModuleKey;
  score: number;
  intentSignal: number;
  riskSignal: number;
  unresolvedSignal: number;
  feedbackSignal: number;
}) {
  const { moduleKey, score, intentSignal, riskSignal, unresolvedSignal, feedbackSignal } = params;
  const reasons: string[] = [];
  if (intentSignal >= 0.45) reasons.push("recent query intent trend");
  if (riskSignal >= 0.45) reasons.push("active risk context");
  if (unresolvedSignal >= 0.45) reasons.push("open questions");
  if (feedbackSignal >= 0.45) reasons.push("recent interactions");
  if (reasons.length === 0) reasons.push("baseline seasonal relevance");
  return `${moduleKey.replace(/_/g, " ")}: ${reasons.join(", ")} (score ${score.toFixed(2)})`;
}

function normalizeMax(values: number[]) {
  const max = values.length ? Math.max(...values) : 1;
  if (max <= 0) return values.map(() => 0);
  return values.map((value) => clamp(value / max, 0, 1));
}

type EventRow = {
  id: string;
  season_phase: SeasonPhase;
  metadata: Record<string, unknown>;
  created_at: string;
};

type FeatureRow = {
  event_id: string;
  intent: string;
  risk_flags: string[];
  module_candidates: WorkbenchModuleKey[];
  created_at: string;
};

type FeedbackRow = {
  feedback_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

type LayoutRow = {
  module_key: WorkbenchModuleKey;
  slot_index: number;
  visibility: WorkbenchVisibility;
  pinned: boolean;
  score: number;
  reason: string | null;
};

function parseEventRows(rows: unknown[]): EventRow[] {
  return rows
    .map((row) => {
      const record = asRecord(row);
      const phase = String(record.season_phase ?? "base") as SeasonPhase;
      const seasonPhase: SeasonPhase = ["base", "build", "peak", "taper", "race_week", "recovery"].includes(phase)
        ? phase
        : "base";
      return {
        id: String(record.id ?? ""),
        season_phase: seasonPhase,
        metadata: asRecord(record.metadata),
        created_at: String(record.created_at ?? new Date().toISOString()),
      };
    })
    .filter((row) => row.id.length > 0);
}

function parseFeatureRows(rows: unknown[]): FeatureRow[] {
  return rows
    .map((row) => {
      const record = asRecord(row);
      const candidates = normalizeStringArray(record.module_candidates) as WorkbenchModuleKey[];
      const riskFlags = normalizeStringArray(record.risk_flags);
      return {
        event_id: String(record.event_id ?? ""),
        intent: String(record.intent ?? "other"),
        risk_flags: riskFlags,
        module_candidates: candidates,
        created_at: String(record.created_at ?? new Date().toISOString()),
      };
    })
    .filter((row) => row.event_id.length > 0);
}

function parseFeedbackRows(rows: unknown[]): FeedbackRow[] {
  return rows
    .map((row) => {
      const record = asRecord(row);
      return {
        feedback_type: String(record.feedback_type ?? ""),
        payload: asRecord(record.payload),
        created_at: String(record.created_at ?? new Date().toISOString()),
      };
    })
    .filter((row) => row.feedback_type.length > 0);
}

function parseLayoutRows(rows: unknown[]): LayoutRow[] {
  return rows
    .map((row) => {
      const record = asRecord(row);
      const visibilityRaw = String(record.visibility ?? "auto");
      const visibility: WorkbenchVisibility = visibilityRaw === "manual_hidden" || visibilityRaw === "manual_shown"
        ? visibilityRaw
        : "auto";
      return {
        module_key: String(record.module_key ?? "") as WorkbenchModuleKey,
        slot_index: Number(record.slot_index ?? 0),
        visibility,
        pinned: Boolean(record.pinned),
        score: Number(record.score ?? 0),
        reason: record.reason == null ? null : String(record.reason),
      };
    })
    .filter((row) => row.module_key.length > 0);
}

export async function buildWorkbenchForSurface({
  supabase,
  userId,
  surface,
}: {
  supabase: SupabaseClient;
  userId: string;
  surface: WorkbenchSurface;
}): Promise<{ modules: WorkbenchRankedModule[]; profileVersion: string }> {
  const since = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const [eventsQuery, feedbackQuery, layoutsQuery] = await Promise.all([
    supabase
      .from("coach_query_events")
      .select("id,season_phase,metadata,created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(280),
    supabase
      .from("coach_feedback_events")
      .select("feedback_type,payload,created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("athlete_workbench_layouts")
      .select("module_key,slot_index,visibility,pinned,score,reason")
      .eq("user_id", userId)
      .eq("surface", surface)
      .order("slot_index", { ascending: true })
      .limit(100),
  ]);

  const events = parseEventRows(eventsQuery.data ?? []);
  const feedback = parseFeedbackRows(feedbackQuery.data ?? []);
  const layouts = parseLayoutRows(layoutsQuery.data ?? []);
  const eventIds = events.map((event) => event.id);

  const featuresQuery = eventIds.length
    ? await supabase
        .from("coach_query_features")
        .select("event_id,intent,risk_flags,module_candidates,created_at")
        .in("event_id", eventIds)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: [] as unknown[] };

  const features = parseFeatureRows(featuresQuery.data ?? []);
  const featuresByEvent = new Map(features.map((feature) => [feature.event_id, feature]));
  const layoutByModule = new Map(layouts.map((layout) => [layout.module_key, layout]));
  const moduleCatalog = MODULES_BY_SURFACE[surface];

  const intentRaw = moduleCatalog.map((module) => {
    let total = 0;
    for (const event of events) {
      const feature = featuresByEvent.get(event.id);
      if (!feature) continue;
      const days = daysSince(feature.created_at);
      const decay = recencyDecay(days);
      const implied = intentModuleMap(feature.intent);
      if (feature.module_candidates.includes(module.key) || implied.includes(module.key)) {
        total += decay;
      }
    }
    return total;
  });

  const riskRaw = moduleCatalog.map((module) => {
    if (!RISK_WEIGHT_MODULES.has(module.key)) return 0;
    let total = 0;
    for (const feature of features) {
      if (feature.risk_flags.length === 0) continue;
      total += recencyDecay(daysSince(feature.created_at));
    }
    return total;
  });

  const unresolvedRaw = moduleCatalog.map((module) => {
    if (!UNRESOLVED_WEIGHT_MODULES.has(module.key)) return 0;
    let total = 0;
    for (const event of events) {
      const unresolved = normalizeStringArray(event.metadata.unresolvedQuestions);
      if (!unresolved.length) continue;
      total += recencyDecay(daysSince(event.created_at));
    }
    return total;
  });

  const feedbackRaw = moduleCatalog.map((module) => {
    let total = 0;
    for (const item of feedback) {
      const moduleKey = String(item.payload.moduleKey ?? "") as WorkbenchModuleKey;
      if (moduleKey !== module.key) continue;
      const delta = FEEDBACK_POSITIVE.has(item.feedback_type) ? 1 : FEEDBACK_NEGATIVE.has(item.feedback_type) ? -1 : 0;
      total += delta * recencyDecay(daysSince(item.created_at));
    }
    return total;
  });

  const intentNorm = normalizeMax(intentRaw);
  const riskNorm = normalizeMax(riskRaw);
  const unresolvedNorm = normalizeMax(unresolvedRaw);

  const feedbackMin = feedbackRaw.length ? Math.min(...feedbackRaw) : 0;
  const feedbackMax = feedbackRaw.length ? Math.max(...feedbackRaw) : 0;
  const feedbackNorm = feedbackRaw.map((value) => {
    if (feedbackMax === feedbackMin) return 0.5;
    return clamp((value - feedbackMin) / (feedbackMax - feedbackMin), 0, 1);
  });

  const phaseCandidate = events[0]?.season_phase ?? "base";

  const scored = moduleCatalog.map((module, index): WorkbenchRankedModule => {
    const seasonSignal = seasonMatch(module.key, phaseCandidate);
    const score = clamp(
      0.35 * intentNorm[index] +
        0.25 * riskNorm[index] +
        0.2 * seasonSignal +
        0.1 * unresolvedNorm[index] +
        0.1 * feedbackNorm[index],
      0,
      1,
    );

    const override = layoutByModule.get(module.key);
    const visibility = override?.visibility ?? "auto";
    const pinned = override?.pinned ?? false;
    const autoShown = visibility === "manual_hidden" ? false : visibility === "manual_shown" ? true : score >= 0.55;

    return {
      moduleKey: module.key,
      title: module.title,
      description: module.description,
      surface,
      score: round3(score),
      reason: override?.reason ?? moduleReason({
        moduleKey: module.key,
        score,
        intentSignal: intentNorm[index],
        riskSignal: riskNorm[index],
        unresolvedSignal: unresolvedNorm[index],
        feedbackSignal: feedbackNorm[index],
      }),
      pinned,
      visibility,
      slotIndex: override?.slot_index ?? index,
      autoShown,
    };
  });

  const sorted = scored
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.autoShown !== b.autoShown) return a.autoShown ? -1 : 1;
      if (a.score !== b.score) return b.score - a.score;
      return a.slotIndex - b.slotIndex;
    })
    .map((module, index) => ({ ...module, slotIndex: index }));

  const profileVersion = `${phaseCandidate}:${events[0]?.created_at ?? new Date().toISOString()}`;
  return { modules: sorted, profileVersion };
}

export async function upsertWorkbenchLayout(params: {
  supabase: SupabaseClient;
  userId: string;
  surface: WorkbenchSurface;
  moduleKey: WorkbenchModuleKey;
  visibility?: WorkbenchVisibility;
  pinned?: boolean;
  slotIndex?: number;
  score?: number;
  reason?: string | null;
}) {
  const {
    supabase,
    userId,
    surface,
    moduleKey,
    visibility = "auto",
    pinned = false,
    slotIndex = 0,
    score = 0,
    reason = null,
  } = params;

  const payload = {
    user_id: userId,
    surface,
    module_key: moduleKey,
    visibility,
    pinned,
    slot_index: slotIndex,
    score,
    reason,
  };

  const { error } = await supabase.from("athlete_workbench_layouts").upsert(payload, {
    onConflict: "user_id,surface,module_key",
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function fetchWorkbenchSignals({
  supabase,
  userId,
}: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<WorkbenchSignalBundle> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const eventsQuery = await supabase
    .from("coach_query_events")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(120);

  const ids = (eventsQuery.data ?? []).map((row) => String((row as Record<string, unknown>).id ?? "")).filter(Boolean);
  if (!ids.length) {
    return { topIntents7d: [], topTopics7d: [] };
  }

  const featuresQuery = await supabase
    .from("coach_query_features")
    .select("intent,topics")
    .in("event_id", ids)
    .limit(240);

  const intentCounts = new Map<string, number>();
  const topicCounts = new Map<string, number>();
  for (const row of featuresQuery.data ?? []) {
    const record = asRecord(row);
    const intent = String(record.intent ?? "other");
    intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
    for (const topic of normalizeStringArray(record.topics)) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }

  const topIntents7d = [...intentCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([intent]) => intent);

  const topTopics7d = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  return { topIntents7d, topTopics7d };
}
