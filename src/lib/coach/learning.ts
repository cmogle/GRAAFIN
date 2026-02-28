import { SupabaseClient } from "@supabase/supabase-js";
import { QueryLearningInput, QueryLearningSummary, SeasonPhase, WorkbenchModuleKey } from "@/lib/coach/types";
import { buildWorkbenchForSurface, fetchWorkbenchSignals, getModuleCandidates } from "@/lib/coach/workbench";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(+parsed)) return null;
  return parsed;
}

export function deriveSeasonPhase(raceDate: string | null): SeasonPhase {
  const parsedRaceDate = safeDate(raceDate);
  if (!parsedRaceDate) return "base";
  const days = Math.ceil((parsedRaceDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "recovery";
  if (days <= 13) return "race_week";
  if (days <= 41) return "taper";
  if (days <= 83) return "peak";
  if (days <= 126) return "build";
  return "base";
}

function normalizeWords(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length >= 4);
}

function unique(words: string[]) {
  return Array.from(new Set(words));
}

function extractTopics(queryText: string, assistantText: string): string[] {
  const words = normalizeWords(`${queryText} ${assistantText}`);
  const signalWords = words.filter((word) => {
    return (
      word.includes("boston") ||
      word.includes("injur") ||
      word.includes("taper") ||
      word.includes("race") ||
      word.includes("pace") ||
      word.includes("load") ||
      word.includes("read") ||
      word.includes("sleep") ||
      word.includes("fuel") ||
      word.includes("plan") ||
      word.includes("recover")
    );
  });
  return unique(signalWords).slice(0, 8);
}

function extractConstraintSignals(message: string) {
  const lower = message.toLowerCase();
  const out: string[] = [];
  if (lower.includes("travel")) out.push("travel");
  if (lower.includes("busy")) out.push("time_pressure");
  if (lower.includes("work")) out.push("work_schedule");
  if (lower.includes("kids")) out.push("family_logistics");
  if (lower.includes("cannot run") || lower.includes("can't run")) out.push("no_running");
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : String(entry ?? "").trim()))
    .filter((entry) => entry.length > 0);
}

async function loadLearningPreference(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("coach_learning_preferences")
    .select("allow_global_learning,allow_raw_retention,raw_retention_days")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return {
      allowGlobalLearning: false,
      allowRawRetention: true,
      rawRetentionDays: 365,
    };
  }

  return {
    allowGlobalLearning: Boolean(data.allow_global_learning),
    allowRawRetention: data.allow_raw_retention == null ? true : Boolean(data.allow_raw_retention),
    rawRetentionDays: Number(data.raw_retention_days ?? 365),
  };
}

async function computeNoveltyScore(params: {
  supabase: SupabaseClient;
  userId: string;
  intent: string;
  topics: string[];
}) {
  const { supabase, userId, intent, topics } = params;
  const eventsQuery = await supabase
    .from("coach_query_events")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40);

  const eventIds = (eventsQuery.data ?? [])
    .map((row) => String((row as Record<string, unknown>).id ?? ""))
    .filter((id) => id.length > 0);

  if (!eventIds.length) return 0.9;

  const featuresQuery = await supabase
    .from("coach_query_features")
    .select("intent,topics")
    .in("event_id", eventIds)
    .limit(80);

  const rows = (featuresQuery.data ?? []).map((row) => asRecord(row));
  const sameIntentCount = rows.filter((row) => String(row.intent ?? "other") === intent).length;
  const allTopics = new Set(rows.flatMap((row) => normalizeStringArray(row.topics)));
  const overlap = topics.length ? topics.filter((topic) => allTopics.has(topic)).length / topics.length : 0;

  const intentPenalty = clamp(sameIntentCount / 12, 0, 0.8);
  const overlapPenalty = clamp(overlap * 0.35, 0, 0.35);
  return clamp(1 - intentPenalty - overlapPenalty, 0.05, 0.98);
}

export async function persistQueryLearningEvent(params: {
  supabase: SupabaseClient;
  input: QueryLearningInput;
}): Promise<QueryLearningSummary> {
  const { supabase, input } = params;
  const seasonPhase = deriveSeasonPhase(input.raceDate);
  const topics = extractTopics(input.queryText, input.assistantText);
  const mergedConstraints = Array.from(
    new Set([...input.activeConstraints, ...extractConstraintSignals(input.queryText)]),
  ).slice(0, 12);

  const [preference, noveltyScore] = await Promise.all([
    loadLearningPreference(supabase, input.userId),
    computeNoveltyScore({
      supabase,
      userId: input.userId,
      intent: input.intent,
      topics,
    }),
  ]);

  const moduleCandidates = getModuleCandidates({
    intent: input.intent,
    riskFlags: input.riskFlags,
    seasonPhase,
  });

  const metadata = {
    intent: input.intent,
    route: input.queryRoute,
    confidence: input.confidence,
    riskFlags: input.riskFlags,
    stateChanges: input.stateChanges,
    unresolvedQuestions: input.unresolvedQuestions,
    assumptionsUsed: input.assumptionsUsed,
    memoryApplied: input.memoryApplied,
  };

  const queryText = preference.allowRawRetention ? input.queryText : null;

  const eventPayload = {
    user_id: input.userId,
    thread_id: input.threadId,
    user_message_id: input.userMessageId,
    assistant_message_id: input.assistantMessageId,
    query_text: queryText,
    assistant_text: input.assistantText,
    metadata,
    season_phase: seasonPhase,
    global_eligible: preference.allowGlobalLearning,
  };

  const eventResponse = input.userMessageId
    ? await supabase
        .from("coach_query_events")
        .upsert(eventPayload, { onConflict: "user_message_id" })
        .select("id,created_at")
        .single()
    : await supabase
        .from("coach_query_events")
        .insert(eventPayload)
        .select("id,created_at")
        .single();

  const eventId = String(eventResponse.data?.id ?? "");

  if (!eventId) {
    return {
      eventId: null,
      intent: input.intent,
      seasonPhase,
      modules: [],
      profileVersion: `${seasonPhase}:${new Date().toISOString()}`,
    };
  }

  await supabase.from("coach_query_features").upsert(
    {
      event_id: eventId,
      intent: input.intent,
      query_route: input.queryRoute,
      topics,
      constraints: mergedConstraints,
      risk_flags: input.riskFlags,
      novelty_score: clamp(noveltyScore, 0, 1),
      confidence: clamp(input.confidence, 0, 1),
      module_candidates: moduleCandidates,
    },
    { onConflict: "event_id" },
  );

  const workbench = await buildWorkbenchForSurface({
    supabase,
    userId: input.userId,
    surface: "coach",
  });

  return {
    eventId,
    intent: input.intent,
    seasonPhase,
    modules: workbench.modules.slice(0, 6),
    profileVersion: workbench.profileVersion,
  };
}

export async function deriveAdaptationSnapshot(params: {
  supabase: SupabaseClient;
  userId: string;
  raceDate: string | null;
}) {
  const { supabase, userId, raceDate } = params;
  const seasonPhase = deriveSeasonPhase(raceDate);
  const [{ modules: coachModules }, { topIntents7d, topTopics7d }] = await Promise.all([
    buildWorkbenchForSurface({ supabase, userId, surface: "coach" }),
    fetchWorkbenchSignals({ supabase, userId }),
  ]);

  return {
    seasonPhase,
    topIntents7d,
    topTopics7d,
    recommendedModules: coachModules.slice(0, 6).map((module) => ({
      moduleKey: module.moduleKey,
      score: module.score,
      reason: module.reason,
      autoShown: module.autoShown,
    })),
  };
}

export function serializeModuleKeys(modules: WorkbenchModuleKey[]) {
  return modules.map((module) => module.toString());
}
