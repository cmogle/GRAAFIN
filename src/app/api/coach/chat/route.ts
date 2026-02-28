import { NextRequest, NextResponse } from "next/server";
import { buildCockpitPayload } from "@/lib/mobile/cockpit";
import {
  CoachMemoryItem,
  extractAndPersistMemory,
  orchestrateCoachReply,
  persistAgentTrace,
} from "@/lib/coach/orchestrator";
import { orchestrateCoachReplyV2, type CoachOrchestratorV2Result } from "@/lib/coach/orchestrator-v2";
import { loadOrBuildMarathonBlocks } from "@/lib/coach/blocks";
import {
  defaultConversationState,
  loadAthleteState,
  loadCoachObjective,
  loadConversationState,
  loadEvidenceItems,
  upsertAthleteState,
  upsertConversationState,
  upsertPrimaryRaceTarget,
} from "@/lib/coach/context";
import { persistQueryLearningEvent } from "@/lib/coach/learning";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { buildWellnessSnapshot } from "@/lib/wellness/context";

type ThreadRow = {
  id: string;
  title: string | null;
  context_mode: string | null;
};

type MessageRow = {
  id: string;
  role: string;
  content: unknown;
  created_at: string;
};

function tableMissingMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : (() => {
            if (error && typeof error === "object") {
              const record = error as Record<string, unknown>;
              const parts = [
                typeof record.message === "string" ? record.message : "",
                typeof record.details === "string" ? record.details : "",
                typeof record.hint === "string" ? record.hint : "",
              ].filter(Boolean);
              if (parts.length > 0) return parts.join(" ");
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            }
            return String(error);
          })();
  if (message.toLowerCase().includes("does not exist") || message.includes("42P01")) {
    return "Coach tables are not installed. Run docs/SUPABASE_COACH_SCHEMA.sql in Supabase.";
  }
  return message;
}

function isCoachTableMissingMessage(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("coach tables are not installed") ||
    lower.includes("could not find the table 'public.coach_threads'") ||
    lower.includes("could not find the table 'public.coach_messages'") ||
    lower.includes("does not exist") ||
    lower.includes("42p01")
  );
}

function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => normalizeContent(item)).filter(Boolean).join("\n").trim();
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

function extractConstraintSignals(message: string): string[] {
  const lower = message.toLowerCase();
  const out: string[] = [];
  if (lower.includes("travel")) out.push("travel");
  if (lower.includes("busy")) out.push("time pressure");
  if (lower.includes("work")) out.push("work schedule");
  if (lower.includes("kids")) out.push("family logistics");
  if (lower.includes("cannot run") || lower.includes("can't run")) out.push("no running availability");
  return out;
}

export async function POST(request: NextRequest) {
  if (!featureFlags.coachV1) {
    return NextResponse.json({ error: "Coach feature is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  const contextMode = String(body?.contextMode ?? "balanced").trim().slice(0, 24) || "balanced";
  const requestedThreadId = typeof body?.threadId === "string" ? body.threadId : null;

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > 1600) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const generateTransientCoachReply = async () => {
    const cockpit = await buildCockpitPayload({ supabase, userId: user.id });
    const coach = await orchestrateCoachReply({
      userMessage: message,
      cockpit,
      memoryItems: [],
      conversation: [{ role: "user", content: message }],
      contextMode,
    });
    const assistantContent = normalizeContent(coach.assistantMessage);

    return NextResponse.json({
      threadId: null,
      assistantMessage: assistantContent,
      citations: coach.citations,
      confidence: coach.confidence,
      suggestedActions: coach.suggestedActions,
      riskFlags: coach.riskFlags,
      followUpQuestions: coach.followUpQuestions,
      usage: coach.usage ?? null,
      generatedAt: new Date().toISOString(),
      userMessageId: null,
      assistantMessageId: null,
      transient: true,
      warning:
        "Coach persistence is not available yet. Run docs/SUPABASE_COACH_SCHEMA.sql in this Supabase project.",
      responseMode: "guardrail_fallback",
      intent: "other",
      coachState: null,
      activeBlock: null,
      stateChanges: [],
      evidenceItems: [],
      assumptionsUsed: [],
      memoryApplied: [],
      queryRoute: "internal",
      scenarioPlan: null,
      unresolvedQuestions: [],
      learning: null,
    });
  };

  try {
    let thread: ThreadRow | null = null;
    if (requestedThreadId) {
      const { data } = await supabase
        .from("coach_threads")
        .select("id,title,context_mode")
        .eq("id", requestedThreadId)
        .eq("user_id", user.id)
        .maybeSingle();
      thread = (data as ThreadRow | null) ?? null;
    }

    if (!thread) {
      const { data, error } = await supabase
        .from("coach_threads")
        .insert({
          user_id: user.id,
          title: message.slice(0, 64),
          context_mode: contextMode,
        })
        .select("id,title,context_mode")
        .single();

      if (error) {
        const mapped = tableMissingMessage(error);
        if (isCoachTableMissingMessage(mapped)) {
          return await generateTransientCoachReply();
        }
        return NextResponse.json({ error: tableMissingMessage(error) }, { status: 500 });
      }
      thread = data as ThreadRow;
    }

    const { data: userMessageRow, error: userMessageError } = await supabase
      .from("coach_messages")
      .insert({
        user_id: user.id,
        thread_id: thread.id,
        role: "user",
        content: message,
      })
      .select("id,role,content,created_at")
      .single();

    if (userMessageError) {
      const mapped = tableMissingMessage(userMessageError);
      if (isCoachTableMissingMessage(mapped)) {
        return await generateTransientCoachReply();
      }
      return NextResponse.json({ error: mapped }, { status: 500 });
    }

    const memoryPromise = featureFlags.coachMemoryV1
      ? supabase
          .from("coach_memory_items")
          .select("id,memory_type,content,confidence,created_at,updated_at")
          .eq("user_id", user.id)
          .is("archived_at", null)
          .order("updated_at", { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as unknown[] });

    const coachV2Enabled =
      featureFlags.coachContextV2 ||
      featureFlags.coachBlocksV2 ||
      featureFlags.coachRouterV1 ||
      featureFlags.coachEvidenceV1;

    const [{ data: memoryRows }, { data: messageRows }, cockpit, objective, athleteState, conversationState, blockContext, wellnessSnapshot] = await Promise.all([
      memoryPromise,
      supabase
        .from("coach_messages")
        .select("id,role,content,created_at")
        .eq("user_id", user.id)
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
        .limit(40),
      buildCockpitPayload({ supabase, userId: user.id }),
      coachV2Enabled ? loadCoachObjective(supabase, user.id) : Promise.resolve(null),
      coachV2Enabled ? loadAthleteState(supabase, user.id) : Promise.resolve(null),
      coachV2Enabled
        ? loadConversationState({ supabase, userId: user.id, threadId: thread.id })
        : Promise.resolve(defaultConversationState()),
      coachV2Enabled && featureFlags.coachBlocksV2
        ? loadOrBuildMarathonBlocks({ supabase, userId: user.id })
        : Promise.resolve({ activeBlock: null, blocks: [], source: "computed" as const }),
      coachV2Enabled && (featureFlags.wellnessSleepV1 || featureFlags.wellnessNutritionV1)
        ? buildWellnessSnapshot({ supabase, userId: user.id })
        : Promise.resolve(null),
    ]);

    const memoryItems: CoachMemoryItem[] = (memoryRows ?? []).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        id: String(item.id ?? ""),
        memoryType: String(item.memory_type ?? "preference"),
        content: String(item.content ?? ""),
        confidence: Number(item.confidence ?? 0.6),
        createdAt: String(item.created_at ?? ""),
        updatedAt: String(item.updated_at ?? ""),
      };
    });

    const conversation = (messageRows as MessageRow[] | null | undefined)?.map((row) => ({
      role: row.role,
      content: normalizeContent(row.content),
    })) ?? [{ role: "user", content: message }];

    const evidenceItems =
      coachV2Enabled && featureFlags.coachEvidenceV1
        ? await loadEvidenceItems({
            supabase,
            userId: user.id,
            topicHint: message,
            limit: 6,
          })
        : [];

    let coachV2: CoachOrchestratorV2Result | null = null;
    let coach = null as Awaited<ReturnType<typeof orchestrateCoachReply>> | null;

    if (coachV2Enabled) {
      coachV2 = await orchestrateCoachReplyV2({
        userMessage: message,
        cockpit,
        memoryItems,
        conversation,
        contextMode,
        coachState: athleteState ?? {
          availabilityState: "normal",
          runningAllowed: true,
          expectedReturnDate: null,
          confidence: 0.6,
          source: "system",
          updatedAt: null,
        },
        conversationState,
        objective,
        activeBlock: blockContext.activeBlock,
        evidenceItems,
        wellnessSnapshot,
      });
    } else {
      coach = await orchestrateCoachReply({
        userMessage: message,
        cockpit,
        memoryItems,
        conversation,
        contextMode,
      });
    }

    const resolvedCoach = coachV2 ?? coach;
    if (!resolvedCoach) {
      return NextResponse.json({ error: "Coach response unavailable" }, { status: 500 });
    }
    const assistantContent = normalizeContent(resolvedCoach.assistantMessage);
    const assistantMetadata = {
      riskFlags: resolvedCoach.riskFlags,
      suggestedActions: resolvedCoach.suggestedActions,
      followUpQuestions: resolvedCoach.followUpQuestions,
      usage: resolvedCoach.usage ?? null,
      intent: coachV2?.intent ?? null,
      responseMode: coachV2?.responseMode ?? "llm",
      coachState: coachV2?.coachState ?? null,
      activeBlock: coachV2?.activeBlock ?? null,
      stateChanges: coachV2?.stateChanges ?? [],
      evidenceItems: coachV2?.evidenceItems ?? [],
      assumptionsUsed: coachV2?.assumptionsUsed ?? [],
      memoryApplied: coachV2?.memoryApplied ?? [],
      queryRoute: coachV2?.queryRoute ?? "internal",
      scenarioPlan: coachV2?.scenarioPlan ?? null,
      unresolvedQuestions: coachV2?.unresolvedQuestions ?? [],
    };

    const { data: assistantRow } = await supabase
      .from("coach_messages")
      .insert({
        user_id: user.id,
        thread_id: thread.id,
        role: "assistant",
        content: assistantContent,
        confidence: resolvedCoach.confidence,
        citations: resolvedCoach.citations,
        metadata: assistantMetadata,
      })
      .select("id,created_at")
      .single();

    await supabase
      .from("coach_threads")
      .update({
        updated_at: new Date().toISOString(),
        context_mode: contextMode,
      })
      .eq("id", thread.id)
      .eq("user_id", user.id);

    const assistantMessageId = assistantRow?.id ? String(assistantRow.id) : null;
    const userMessageId = userMessageRow?.id ? String(userMessageRow.id) : null;
    const nextConstraintSignals = extractConstraintSignals(message);
    const nextActiveConstraints = Array.from(
      new Set([...(conversationState.activeConstraints ?? []), ...nextConstraintSignals]),
    ).slice(0, 12);

    const updateTasks: Array<Promise<unknown>> = [
      ...(featureFlags.coachMemoryV1
        ? [
            extractAndPersistMemory({
              supabase,
              userId: user.id,
              userMessage: message,
              assistantMessage: assistantContent,
              sourceMessageId: assistantMessageId,
            }),
          ]
        : []),
      ...resolvedCoach.traces.map((trace) =>
        persistAgentTrace({
          supabase,
          userId: user.id,
          threadId: thread?.id ?? null,
          messageId: assistantMessageId,
          trace,
        })),
    ];

    if (coachV2Enabled && coachV2) {
      updateTasks.push(
        upsertAthleteState({
          supabase,
          userId: user.id,
          current:
            athleteState ?? {
              availabilityState: "normal",
              runningAllowed: true,
              expectedReturnDate: null,
              confidence: 0.6,
              source: "system",
              updatedAt: null,
            },
          update: {
            availabilityState: coachV2.coachState.availabilityState,
            runningAllowed: coachV2.coachState.runningAllowed,
            expectedReturnDate: coachV2.coachState.expectedReturnDate,
            confidence: coachV2.coachState.confidence,
            source: "coach",
          },
        }),
      );

      updateTasks.push(
        upsertConversationState({
          supabase,
          userId: user.id,
          threadId: thread.id,
          state: {
            ...conversationState,
            activeIntent: coachV2.intent,
            activeGoal: {
              raceName: objective?.goalRaceName ?? "Boston Marathon",
              raceDate: objective?.goalRaceDate ?? "2026-04-20",
              targetFinishSeconds: objective?.targetFinishSeconds ?? null,
            },
            activeConstraints: nextActiveConstraints,
            unresolvedQuestions:
              coachV2.unresolvedQuestions.length > 0
                ? coachV2.unresolvedQuestions
                : coachV2.followUpQuestions.slice(0, 2),
            entityMemory: {
              ...conversationState.entityMemory,
              lastTopic: message.slice(0, 180),
              lastConstraint: nextConstraintSignals[0] ?? null,
              lastAssistantMode: coachV2.responseMode,
            },
            currentBlockPhase:
              coachV2.activeBlock?.weekIndex != null
                ? `week-${coachV2.activeBlock.weekIndex}`
                : conversationState.currentBlockPhase,
            lastCommitments: coachV2.suggestedActions.slice(0, 3),
            assumptions: coachV2.assumptionsUsed,
            memoryApplied: coachV2.memoryApplied,
            stateConfidence: coachV2.confidence,
            updatedAt: new Date().toISOString(),
          },
          coachState: coachV2.coachState,
          updatedBy: "coach",
        }),
      );

      if (featureFlags.coachBlocksV2) {
        updateTasks.push(
          upsertPrimaryRaceTarget({
            supabase,
            userId: user.id,
            objective,
          }),
        );
      }
    }

    await Promise.all(updateTasks);
    let learning = null as Awaited<ReturnType<typeof persistQueryLearningEvent>> | null;
    if (featureFlags.coachWorkbenchV1) {
      try {
        learning = await persistQueryLearningEvent({
          supabase,
          input: {
            userId: user.id,
            threadId: thread.id,
            userMessageId,
            assistantMessageId,
            queryText: message,
            assistantText: assistantContent,
            intent: coachV2?.intent ?? "other",
            queryRoute: coachV2?.queryRoute ?? "internal",
            confidence: Number(resolvedCoach.confidence ?? 0.6),
            riskFlags: resolvedCoach.riskFlags ?? [],
            stateChanges: coachV2?.stateChanges ?? [],
            unresolvedQuestions:
              coachV2?.unresolvedQuestions.length
                ? coachV2.unresolvedQuestions
                : resolvedCoach.followUpQuestions.slice(0, 2),
            assumptionsUsed: coachV2?.assumptionsUsed ?? [],
            memoryApplied: coachV2?.memoryApplied ?? [],
            activeConstraints: nextActiveConstraints,
            raceDate: objective?.goalRaceDate ?? coachV2?.activeBlock?.raceDate ?? null,
          },
        });
      } catch {
        learning = null;
      }
    }
    if (learning && assistantMessageId) {
      await supabase
        .from("coach_messages")
        .update({ metadata: { ...assistantMetadata, learning } })
        .eq("id", assistantMessageId)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      threadId: thread.id,
      assistantMessage: assistantContent,
      citations: resolvedCoach.citations,
      confidence: resolvedCoach.confidence,
      suggestedActions: resolvedCoach.suggestedActions,
      riskFlags: resolvedCoach.riskFlags,
      followUpQuestions: resolvedCoach.followUpQuestions,
      usage: resolvedCoach.usage ?? null,
      generatedAt: new Date().toISOString(),
      userMessageId,
      assistantMessageId,
      intent: coachV2?.intent ?? null,
      responseMode: coachV2?.responseMode ?? "llm",
      coachState: coachV2?.coachState ?? null,
      activeBlock: coachV2?.activeBlock ?? null,
      stateChanges: coachV2?.stateChanges ?? [],
      evidenceItems: coachV2?.evidenceItems ?? [],
      assumptionsUsed: coachV2?.assumptionsUsed ?? [],
      memoryApplied: coachV2?.memoryApplied ?? [],
      queryRoute: coachV2?.queryRoute ?? "internal",
      scenarioPlan: coachV2?.scenarioPlan ?? null,
      unresolvedQuestions: coachV2?.unresolvedQuestions ?? [],
      learning,
    });
  } catch (error) {
    const mapped = tableMissingMessage(error);
    if (isCoachTableMissingMessage(mapped)) {
      return await generateTransientCoachReply();
    }
    return NextResponse.json(
      { error: mapped },
      { status: 500 },
    );
  }
}
