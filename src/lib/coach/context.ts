import { SupabaseClient } from "@supabase/supabase-js";
import {
  CoachState,
  EvidenceItem,
  StateUpdate,
  applyStateUpdate,
  defaultCoachState,
} from "@/lib/coach/intelligence";

export type CoachObjective = {
  goalRaceName: string;
  goalRaceDate: string | null;
  targetFinishSeconds: number | null;
  targetWeeklyVolumeKm: number | null;
  notes: string | null;
};

export type ConversationState = {
  activeIntent: string;
  activeGoal: Record<string, unknown>;
  activeConstraints: string[];
  unresolvedQuestions: string[];
  entityMemory: Record<string, unknown>;
  currentBlockPhase: string | null;
  lastCommitments: string[];
  assumptions: string[];
  memoryApplied: string[];
  stateConfidence: number;
  updatedAt: string | null;
};

export function defaultConversationState(): ConversationState {
  return {
    activeIntent: "other",
    activeGoal: {},
    activeConstraints: [],
    unresolvedQuestions: [],
    entityMemory: {},
    currentBlockPhase: null,
    lastCommitments: [],
    assumptions: [],
    memoryApplied: [],
    stateConfidence: 0.6,
    updatedAt: null,
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : String(item ?? "").trim()))
    .filter((item) => item.length > 0);
}

export async function loadCoachObjective(supabase: SupabaseClient, userId: string): Promise<CoachObjective | null> {
  const { data, error } = await supabase
    .from("training_objectives")
    .select("goal_race_name,goal_race_date,target_finish_seconds,target_weekly_volume_km,notes")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    goalRaceName: String(data.goal_race_name ?? "Boston Marathon"),
    goalRaceDate: data.goal_race_date == null ? null : String(data.goal_race_date),
    targetFinishSeconds: data.target_finish_seconds == null ? null : Number(data.target_finish_seconds),
    targetWeeklyVolumeKm:
      data.target_weekly_volume_km == null ? null : Number(data.target_weekly_volume_km),
    notes: data.notes == null ? null : String(data.notes),
  };
}

export async function upsertPrimaryRaceTarget({
  supabase,
  userId,
  objective,
}: {
  supabase: SupabaseClient;
  userId: string;
  objective: CoachObjective | null;
}) {
  const raceName = objective?.goalRaceName?.trim() || "Boston Marathon";
  const raceDate = objective?.goalRaceDate ?? "2026-04-20";
  try {
    await supabase
      .from("race_targets")
      .update({ is_primary: false })
      .eq("user_id", userId)
      .eq("is_primary", true);

    await supabase.from("race_targets").upsert(
      {
        user_id: userId,
        race_name: raceName,
        race_date: raceDate,
        target_finish_seconds: objective?.targetFinishSeconds ?? null,
        source: objective ? "objective" : "system",
        is_primary: true,
        metadata: {
          targetWeeklyVolumeKm: objective?.targetWeeklyVolumeKm ?? null,
          notes: objective?.notes ?? null,
        },
      },
      { onConflict: "user_id,race_name,race_date" },
    );
  } catch {
    // race_targets may not be installed in every environment yet.
  }
}

export async function loadAthleteState(supabase: SupabaseClient, userId: string): Promise<CoachState> {
  try {
    const { data, error } = await supabase
      .from("athlete_state")
      .select("availability_state,running_allowed,expected_return_date,confidence,source,updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return defaultCoachState();
    return {
      availabilityState:
        data.availability_state === "medical_hold" ||
        data.availability_state === "injury_adaptation" ||
        data.availability_state === "return_build"
          ? data.availability_state
          : "normal",
      runningAllowed: data.running_allowed == null ? true : Boolean(data.running_allowed),
      expectedReturnDate: data.expected_return_date == null ? null : String(data.expected_return_date),
      confidence: Number(data.confidence ?? 0.6),
      source:
        data.source === "user" || data.source === "coach"
          ? data.source
          : "system",
      updatedAt: data.updated_at == null ? null : String(data.updated_at),
    };
  } catch {
    return defaultCoachState();
  }
}

export async function upsertAthleteState({
  supabase,
  userId,
  current,
  update,
}: {
  supabase: SupabaseClient;
  userId: string;
  current: CoachState;
  update: StateUpdate | null;
}) {
  const next = applyStateUpdate(current, update);
  try {
    await supabase.from("athlete_state").upsert(
      {
        user_id: userId,
        availability_state: next.availabilityState,
        running_allowed: next.runningAllowed,
        expected_return_date: next.expectedReturnDate,
        confidence: next.confidence,
        source: next.source,
      },
      { onConflict: "user_id" },
    );
  } catch {
    // Table may not exist in early deployments.
  }
  return next;
}

export async function loadConversationState({
  supabase,
  userId,
  threadId,
}: {
  supabase: SupabaseClient;
  userId: string;
  threadId: string | null;
}): Promise<ConversationState> {
  if (!threadId) return defaultConversationState();
  try {
    const { data, error } = await supabase
      .from("coach_conversation_state")
      .select(
        "active_intent,active_goal,active_constraints,unresolved_questions,entity_memory,current_block_phase,last_commitments,assumptions,memory_applied,state_confidence,updated_at",
      )
      .eq("user_id", userId)
      .eq("thread_id", threadId)
      .maybeSingle();

    if (error || !data) return defaultConversationState();
    return {
      activeIntent: String(data.active_intent ?? "other"),
      activeGoal: (data.active_goal as Record<string, unknown> | null) ?? {},
      activeConstraints: normalizeStringArray(data.active_constraints),
      unresolvedQuestions: normalizeStringArray(data.unresolved_questions),
      entityMemory: (data.entity_memory as Record<string, unknown> | null) ?? {},
      currentBlockPhase: data.current_block_phase == null ? null : String(data.current_block_phase),
      lastCommitments: normalizeStringArray(data.last_commitments),
      assumptions: normalizeStringArray(data.assumptions),
      memoryApplied: normalizeStringArray(data.memory_applied),
      stateConfidence: Number(data.state_confidence ?? 0.6),
      updatedAt: data.updated_at == null ? null : String(data.updated_at),
    };
  } catch {
    return defaultConversationState();
  }
}

export async function upsertConversationState({
  supabase,
  userId,
  threadId,
  state,
  coachState,
  updatedBy,
}: {
  supabase: SupabaseClient;
  userId: string;
  threadId: string | null;
  state: ConversationState;
  coachState: CoachState;
  updatedBy: "system" | "user" | "coach";
}) {
  if (!threadId) return;
  try {
    await supabase.from("coach_conversation_state").upsert(
      {
        user_id: userId,
        thread_id: threadId,
        active_intent: state.activeIntent,
        active_goal: state.activeGoal,
        active_constraints: state.activeConstraints,
        unresolved_questions: state.unresolvedQuestions,
        entity_memory: state.entityMemory,
        current_block_phase: state.currentBlockPhase,
        last_commitments: state.lastCommitments,
        availability_state: coachState.availabilityState,
        running_allowed: coachState.runningAllowed,
        expected_return_date: coachState.expectedReturnDate,
        assumptions: state.assumptions,
        memory_applied: state.memoryApplied,
        state_confidence: state.stateConfidence,
        updated_by: updatedBy,
      },
      { onConflict: "user_id,thread_id" },
    );
  } catch {
    // Table may not exist in early deployments.
  }
}

export async function loadEvidenceItems({
  supabase,
  userId,
  topicHint,
  limit = 6,
}: {
  supabase: SupabaseClient;
  userId: string;
  topicHint: string;
  limit?: number;
}): Promise<EvidenceItem[]> {
  const topic = topicHint.trim().toLowerCase() || "marathon";
  try {
    const { data: snippets } = await supabase
      .from("coach_evidence_snippets")
      .select("id,source_id,topic,claim,url,published_at,retrieved_at,confidence,fresh_until")
      .or(`user_id.eq.${userId},user_id.is.null`)
      .ilike("topic", `%${topic}%`)
      .order("fresh_until", { ascending: false })
      .limit(limit);

    const snippetRows = snippets ?? [];
    if (!snippetRows.length) {
      const { data: sources } = await supabase
        .from("coach_evidence_sources")
        .select("id,title,url,domain,topic_tags,evidence_grade,is_active")
        .eq("is_active", true)
        .limit(limit);
      return (sources ?? []).map((source) => ({
        id: String(source.id),
        title: String(source.title ?? "Curated source"),
        url: String(source.url ?? ""),
        domain: String(source.domain ?? ""),
        topic,
        claim: "Curated source available; specific snippet not cached yet.",
        confidence: source.evidence_grade === "A" ? 0.84 : source.evidence_grade === "B" ? 0.74 : 0.64,
        publishedAt: null,
        retrievedAt: null,
        relevanceScore: 0.55,
        sourceType: "curated",
      }));
    }

    const sourceIds = Array.from(new Set(snippetRows.map((row) => String(row.source_id ?? "")))).filter(Boolean);
    const { data: sources } = sourceIds.length
      ? await supabase
          .from("coach_evidence_sources")
          .select("id,title,url,domain")
          .in("id", sourceIds)
      : { data: [] as unknown[] };
    const sourceMap = new Map<string, Record<string, unknown>>(
      (sources ?? []).map((sourceRow) => {
        const source = sourceRow as Record<string, unknown>;
        return [String(source.id ?? ""), source];
      }),
    );

    return snippetRows.map((row) => {
      const source = sourceMap.get(String(row.source_id ?? ""));
      const title = String(source?.title ?? "Curated endurance source");
      const url = String(row.url ?? source?.url ?? "");
      const domain = String(source?.domain ?? "");
      const relevanceScore = clampRelevance(
        scoreTopicRelevance(String(row.topic ?? ""), topic) * Number(row.confidence ?? 0.7),
      );
      return {
        id: String(row.id),
        title,
        url,
        domain,
        topic: String(row.topic ?? topic),
        claim: String(row.claim ?? ""),
        confidence: Number(row.confidence ?? 0.7),
        publishedAt: row.published_at == null ? null : String(row.published_at),
        retrievedAt: row.retrieved_at == null ? null : String(row.retrieved_at),
        relevanceScore,
        sourceType: "curated",
      };
    });
  } catch {
    return [];
  }
}

function scoreTopicRelevance(topic: string, hint: string) {
  const normalizedTopic = topic.toLowerCase();
  const normalizedHint = hint.toLowerCase();
  if (!normalizedTopic || !normalizedHint) return 0.35;
  if (normalizedTopic === normalizedHint) return 1;
  if (normalizedTopic.includes(normalizedHint) || normalizedHint.includes(normalizedTopic)) return 0.8;
  return 0.45;
}

function clampRelevance(value: number) {
  return Math.max(0.2, Math.min(0.99, Number(value.toFixed(2))));
}
