import { CockpitPayload } from "@/lib/mobile/cockpit";
import { CoachMemoryItem, CoachSpecialistTrace } from "@/lib/coach/orchestrator";
import { ActiveBlockSummary } from "@/lib/coach/intelligence";
import {
  CoachIntent,
  CoachState,
  EvidenceItem,
  QueryRoute,
  ScenarioPlan,
  applyStateUpdate,
  buildAssumptions,
  buildScenarioPlan,
  classifyIntent,
  defaultCoachState,
  formatScenarioPlan,
  inferStateUpdate,
  planQueryRoutes,
  resolveReferences,
  shouldCompareBlocks,
  summarizeStateChanges,
} from "@/lib/coach/intelligence";
import { CoachObjective, ConversationState } from "@/lib/coach/context";
import { WellnessSnapshot } from "@/lib/wellness/context";

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type OpenAIResult = {
  text: string;
  usage?: Usage;
};

export type CoachOrchestratorV2Result = {
  assistantMessage: string;
  confidence: number;
  riskFlags: string[];
  followUpQuestions: string[];
  suggestedActions: string[];
  citations: string[];
  traces: CoachSpecialistTrace[];
  usage?: Usage;
  intent: CoachIntent;
  responseMode: "llm" | "guardrail_fallback";
  coachState: CoachState;
  activeBlock: ActiveBlockSummary | null;
  stateChanges: string[];
  evidenceItems: EvidenceItem[];
  assumptionsUsed: string[];
  memoryApplied: string[];
  queryRoute: QueryRoute;
  scenarioPlan: ScenarioPlan | null;
  unresolvedQuestions: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function coerceText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceText(item))
      .filter((item) => item.length > 0)
      .join("\n")
      .trim();
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "message", "summary", "recommendation", "rationale"]) {
      const candidate = coerceText(record[key]);
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

function coerceStringArray(value: unknown, limit: number): string[] {
  if (!value) return [];
  const rawItems = Array.isArray(value) ? value : [value];
  return rawItems
    .map((item) => coerceText(item))
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const fenced = raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(fenced) as T;
    } catch {
      return null;
    }
  }
}

function extractResponseText(data: Record<string, unknown>): string {
  const outputText = data.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) return outputText.trim();

  const output = data.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemContent = (item as { content?: unknown }).content;
    if (!Array.isArray(itemContent)) continue;
    for (const part of itemContent) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") chunks.push(text);
    }
  }
  return chunks.join("\n").trim();
}

async function callResponsesApi({
  system,
  user,
  model,
  maxOutputTokens = 700,
}: {
  system: string;
  user: string;
  model: string;
  maxOutputTokens?: number;
}): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      max_output_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(22_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  return {
    text: extractResponseText(payload),
    usage: payload.usage as Usage | undefined,
  };
}

function buildContextSummary(params: {
  cockpit: CockpitPayload;
  objective: CoachObjective | null;
  coachState: CoachState;
  activeBlock: ActiveBlockSummary | null;
  evidenceItems: EvidenceItem[];
  memoryItems: CoachMemoryItem[];
  conversation: Array<{ role: string; content: string }>;
  route: QueryRoute;
  intent: CoachIntent;
  scenarioPlan: ScenarioPlan | null;
  wellnessSnapshot: WellnessSnapshot | null;
}) {
  const {
    cockpit,
    objective,
    coachState,
    activeBlock,
    evidenceItems,
    memoryItems,
    conversation,
    route,
    intent,
    scenarioPlan,
    wellnessSnapshot,
  } = params;

  const objectiveSummary = objective
    ? `${objective.goalRaceName}${objective.goalRaceDate ? ` (${objective.goalRaceDate})` : ""}`
    : "Boston Marathon (2026-04-20 default)";
  const blockSummary = activeBlock
    ? `${activeBlock.raceName} ${activeBlock.raceDate} | active=${String(activeBlock.isActive)} | ` +
      `avgWeeklyKm ${activeBlock.avgWeeklyKm.toFixed(1)}, longRunCount ${activeBlock.longRunCount}, ` +
      `deltaWeeklyKm ${activeBlock.comparator.weeklyDeltaKm ?? "n/a"} vs prior median`
    : "No active structured block available";
  const memorySummary = memoryItems
    .slice(0, 10)
    .map((item) => `- [${item.memoryType}] ${item.content}`)
    .join("\n");
  const evidenceSummary = evidenceItems
    .slice(0, 6)
    .map((item) => `- ${item.title} (${item.domain}): ${item.claim}`)
    .join("\n");
  const scenarioSummary = scenarioPlan ? formatScenarioPlan(scenarioPlan) : "No scenario planner required for this turn.";

  const wellnessSummary = wellnessSnapshot
    ? `Wellness quality: ${wellnessSnapshot.dataQuality}. ` +
      `Risk flags: ${wellnessSnapshot.riskFlags.join(", ") || "none"}. ` +
      `Insights: ${wellnessSnapshot.insights.join(" | ") || "none"}.`
    : "Wellness inputs unavailable for this turn.";

  return [
    `Intent: ${intent}`,
    `Route: ${route}`,
    `Objective: ${objectiveSummary}`,
    `State: availability=${coachState.availabilityState}, runningAllowed=${String(coachState.runningAllowed)}, expectedReturn=${coachState.expectedReturnDate ?? "unknown"}.`,
    `Readiness: ${cockpit.readiness.score.toFixed(1)} (${cockpit.readiness.status}), load ratio ${cockpit.readiness.loadRatio.toFixed(2)}, monotony ${cockpit.readiness.monotony.toFixed(2)}.`,
    `Block summary: ${blockSummary}`,
    `Memory:\n${memorySummary || "- none"}`,
    `Curated evidence:\n${evidenceSummary || "- none"}`,
    `Wellness:\n${wellnessSummary}`,
    `Scenario planner:\n${scenarioSummary}`,
    `Recent conversation:\n${conversation.slice(-8).map((m) => `${m.role}: ${m.content}`).join("\n")}`,
  ].join("\n\n");
}

function pickMemoryApplied(params: {
  memoryItems: CoachMemoryItem[];
  message: string;
  conversationState: ConversationState;
}): string[] {
  const { memoryItems, message, conversationState } = params;
  const lower = message.toLowerCase();
  const scored = memoryItems
    .map((item) => {
      const content = item.content.toLowerCase();
      let score = item.confidence;
      if (lower.includes("boston") && content.includes("boston")) score += 0.4;
      if (lower.includes("injur") && item.memoryType === "injury_note") score += 0.4;
      if (lower.includes("prefer") && item.memoryType === "preference") score += 0.25;
      if (lower.includes("can't") && item.memoryType === "constraint") score += 0.25;
      return { text: `${item.memoryType}: ${item.content}`, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.text);

  const activeConstraints = conversationState.activeConstraints.slice(0, 2).map((constraint) => `constraint: ${constraint}`);
  return [...scored, ...activeConstraints].slice(0, 5);
}

function buildBaseSuggestions(params: {
  intent: CoachIntent;
  coachState: CoachState;
  scenarioPlan: ScenarioPlan | null;
  compareBlocks: boolean;
}): { actions: string[]; questions: string[] } {
  const { intent, coachState, scenarioPlan, compareBlocks } = params;

  if (!coachState.runningAllowed) {
    return {
      actions: [
        "Set expected return date",
        "Open Boston block comparator",
        "Log symptom update",
      ],
      questions: [
        "What did your clinician clear for today: rest, cross-training, or mobility only?",
        "Do you want a 3, 7, or 14-day outage adaptation first?",
      ],
    };
  }

  if (intent === "race_strategy") {
    return {
      actions: ["Review Boston strategy assumptions", "Open taper comparison", "Adjust week plan"],
      questions: ["Which Boston section are you most concerned about: pacing, fueling, or hills?"],
    };
  }
  if (intent === "load_comparison" || compareBlocks) {
    return {
      actions: ["Open block comparator", "Review planned workouts", "Update weekly volume target"],
      questions: ["Do you want comparison vs all prior blocks or the best-matched two blocks?"],
    };
  }
  if (scenarioPlan) {
    return {
      actions: ["Open scenario planner", "Set return gate checks", "Mark running availability"],
      questions: ["Which outage horizon feels realistic right now: 3, 7, or 14 days?"],
    };
  }
  return {
    actions: ["Open Today cockpit", "Review planned workout", "Open Coach context"],
    questions: ["Any schedule constraints this week that should modify sessions?"],
  };
}

function fallbackReply(params: {
  intent: CoachIntent;
  userMessage: string;
  cockpit: CockpitPayload;
  coachState: CoachState;
  activeBlock: ActiveBlockSummary | null;
  scenarioPlan: ScenarioPlan | null;
  assumptions: string[];
  memoryApplied: string[];
  evidenceItems: EvidenceItem[];
  stateChanges: string[];
  route: QueryRoute;
  traceSeed: CoachSpecialistTrace[];
  wellnessSnapshot: WellnessSnapshot | null;
}): CoachOrchestratorV2Result {
  const {
    intent,
    userMessage,
    cockpit,
    coachState,
    activeBlock,
    scenarioPlan,
    assumptions,
    memoryApplied,
    evidenceItems,
    stateChanges,
    route,
    traceSeed,
    wellnessSnapshot,
  } = params;
  const wellnessFlags = wellnessSnapshot?.riskFlags ?? [];
  const compareText =
    activeBlock && shouldCompareBlocks(intent)
      ? `Compared with prior blocks: weekly delta ${activeBlock.comparator.weeklyDeltaKm ?? "n/a"} km, ` +
        `long-run delta ${activeBlock.comparator.longRunDelta ?? "n/a"} (confidence ${activeBlock.comparator.confidence}).`
      : "Block comparison unavailable for this turn.";
  const scenarioText = scenarioPlan ? `\n\n${formatScenarioPlan(scenarioPlan)}` : "";
  const safetyText = !coachState.runningAllowed
    ? "You reported no current run clearance, so run prescriptions are paused. Focus is adaptation and impact planning."
    : "Training recommendations are based on readiness/load and current block context.";
  const evidenceText =
    route !== "internal" && evidenceItems.length
      ? `\n\nExternal evidence used: ${evidenceItems.slice(0, 2).map((item) => `${item.title} (${item.domain})`).join("; ")}.`
      : "";

  const wellnessText = wellnessFlags.length
    ? `\n\nWellness warning: ${wellnessFlags.join(", ")}.`
    : "";

  const body =
    `Direct answer: ${safetyText}\n` +
    `Today readiness is ${cockpit.readiness.score.toFixed(0)} (${cockpit.readiness.status}) with load ratio ${cockpit.readiness.loadRatio.toFixed(2)}.\n` +
    `${compareText}${scenarioText}${evidenceText}${wellnessText}\n\n` +
    `Next action: ${!coachState.runningAllowed ? "set return constraints and adapt this week plan." : "execute today's lowest-risk key session and re-check tomorrow."}`;

  const base = buildBaseSuggestions({
    intent,
    coachState,
    scenarioPlan,
    compareBlocks: shouldCompareBlocks(intent),
  });

  return {
    assistantMessage: body,
    confidence: clamp((cockpit.readiness.confidence / 100) * 0.88, 0.36, 0.92),
    riskFlags: Array.from(
      new Set([
        ...(cockpit.readiness.loadRatio >= 1.2 ? ["load_spike"] : []),
        ...(cockpit.readiness.monotony >= 1.8 ? ["high_monotony"] : []),
        ...(!coachState.runningAllowed ? ["medical_hold"] : []),
        ...wellnessFlags,
      ]),
    ),
    followUpQuestions: base.questions.slice(0, 3),
    suggestedActions: base.actions.slice(0, 4),
    citations: evidenceItems.slice(0, 4).map((item) => item.title),
    traces: [
      ...traceSeed,
      {
        agentName: "coach-orchestrator-v2",
        model: "heuristic-v2",
        latencyMs: 1,
        input: { userMessage },
        output: {
          intent,
          route,
          stateChanges,
          compareBlocks: shouldCompareBlocks(intent),
        },
      },
    ],
    intent,
    responseMode: "guardrail_fallback",
    coachState,
    activeBlock,
    stateChanges,
    evidenceItems: evidenceItems.slice(0, 6),
    assumptionsUsed: assumptions,
    memoryApplied,
    queryRoute: route,
    scenarioPlan,
    unresolvedQuestions: base.questions.slice(0, 2),
  };
}

export async function orchestrateCoachReplyV2(params: {
  userMessage: string;
  cockpit: CockpitPayload;
  memoryItems: CoachMemoryItem[];
  conversation: Array<{ role: string; content: string }>;
  contextMode: string;
  coachState: CoachState;
  conversationState: ConversationState;
  objective: CoachObjective | null;
  activeBlock: ActiveBlockSummary | null;
  evidenceItems: EvidenceItem[];
  wellnessSnapshot: WellnessSnapshot | null;
}): Promise<CoachOrchestratorV2Result> {
  const {
    userMessage,
    cockpit,
    memoryItems,
    conversation,
    contextMode,
    coachState,
    conversationState,
    objective,
    activeBlock,
    evidenceItems,
    wellnessSnapshot,
  } = params;
  const intent = classifyIntent(userMessage, (conversationState.activeIntent as CoachIntent | undefined) ?? "other");
  const route = planQueryRoutes(intent, userMessage);
  const referenceResolution = resolveReferences(userMessage, conversationState.entityMemory);
  const stateUpdate = inferStateUpdate(userMessage, coachState);
  const nextState = applyStateUpdate(coachState ?? defaultCoachState(), stateUpdate);
  const stateChanges = summarizeStateChanges(coachState ?? defaultCoachState(), nextState);
  const scenarioPlan =
    !nextState.runningAllowed || intent === "injury_adaptation"
      ? buildScenarioPlan({
          cockpit,
          coachState: nextState,
          activeBlock,
        })
      : null;
  const assumptions = buildAssumptions({
    activeBlock,
    coachState: nextState,
    route,
  });
  const memoryApplied = pickMemoryApplied({
    memoryItems,
    message: userMessage,
    conversationState,
  });

  const traces: CoachSpecialistTrace[] = [
    {
      agentName: "intent-classifier-v2",
      model: "heuristic-v2",
      latencyMs: 1,
      input: { userMessage },
      output: { intent, route },
    },
    {
      agentName: "state-reconciler-v2",
      model: "heuristic-v2",
      latencyMs: 1,
      input: { previousState: coachState, updateCandidate: stateUpdate },
      output: { nextState, stateChanges },
    },
    {
      agentName: "block-context-v2",
      model: "heuristic-v2",
      latencyMs: 1,
      input: { activeBlock },
      output: {
        compareBlocks: shouldCompareBlocks(intent),
        comparator: activeBlock?.comparator ?? null,
      },
    },
    {
      agentName: "wellness-context-v1",
      model: "heuristic-v1",
      latencyMs: 1,
      input: { dataQuality: wellnessSnapshot?.dataQuality ?? "none" },
      output: {
        riskFlags: wellnessSnapshot?.riskFlags ?? [],
        insights: wellnessSnapshot?.insights ?? [],
      },
    },
  ];

  if (!process.env.OPENAI_API_KEY) {
    return fallbackReply({
      intent,
      userMessage: referenceResolution.resolvedMessage,
      cockpit,
      coachState: nextState,
      activeBlock,
      scenarioPlan,
      assumptions,
      memoryApplied,
      evidenceItems,
      wellnessSnapshot,
      stateChanges,
      route,
      traceSeed: traces,
    });
  }

  const model = process.env.OPENAI_ORCHESTRATOR_MODEL || "gpt-4.1";
  const system =
    "You are a high-performance marathon coach AI. Be direct, context-aware, and concise. " +
    "Never ignore existing athlete state. If runningAllowed=false, do not prescribe running. " +
    "Return ONLY JSON with schema: " +
    "{\"answer\":\"string\",\"rationale\":\"string\",\"confidence\":0.0-1.0,\"risk_flags\":[\"string\"]," +
    "\"suggested_actions\":[\"string\"],\"next_best_questions\":[\"string\"],\"assumptions_used\":[\"string\"]," +
    "\"memory_applied\":[\"string\"],\"state_changes\":[\"string\"],\"evidence_ids\":[\"string\"],\"unresolved_questions\":[\"string\"]}.";

  const user =
    `Context mode: ${contextMode}\n` +
    `${buildContextSummary({
      cockpit,
      objective,
      coachState: nextState,
      activeBlock,
      evidenceItems,
      memoryItems,
      conversation,
      route,
      intent,
      scenarioPlan,
      wellnessSnapshot,
    })}\n\n` +
    `Current user message (resolved):\n${referenceResolution.resolvedMessage}\n\n` +
    `If confidence is low, say so clearly and keep recommendations bounded.`;

  try {
    const startedAt = Date.now();
    const result = await callResponsesApi({ system, user, model, maxOutputTokens: 760 });
    const latencyMs = Date.now() - startedAt;
    const parsed = tryParseJson<{
      answer?: string;
      rationale?: string;
      confidence?: number;
      risk_flags?: string[];
      suggested_actions?: string[];
      next_best_questions?: string[];
      assumptions_used?: string[];
      memory_applied?: string[];
      state_changes?: string[];
      evidence_ids?: string[];
      unresolved_questions?: string[];
    }>(result.text);

    const answer = coerceText(parsed?.answer);
    const rationale = coerceText(parsed?.rationale);
    if (!answer || !rationale) {
      throw new Error("Model output missing required answer/rationale.");
    }

    traces.push({
      agentName: "coach-orchestrator-v2",
      model,
      latencyMs,
      input: {
        intent,
        route,
        conversationTurns: conversation.length,
        memoryCount: memoryItems.length,
      },
      output: parsed as Record<string, unknown>,
    });

    const base = buildBaseSuggestions({
      intent,
      coachState: nextState,
      scenarioPlan,
      compareBlocks: shouldCompareBlocks(intent),
    });

    const evidenceIdSet = new Set(coerceStringArray(parsed?.evidence_ids, 8));
    const chosenEvidence = evidenceItems.filter(
      (item) => evidenceIdSet.has(item.id) || evidenceIdSet.has(item.title),
    );
    const selectedEvidence = (chosenEvidence.length ? chosenEvidence : evidenceItems).slice(0, 6);

    return {
      assistantMessage: `${answer}\n\nWhy: ${rationale}`,
      confidence: clamp(Number(parsed?.confidence ?? 0.7), 0.25, 0.98),
      riskFlags: Array.from(
        new Set([
          ...coerceStringArray(parsed?.risk_flags, 8),
          ...(nextState.runningAllowed ? [] : ["medical_hold"]),
          ...(wellnessSnapshot?.riskFlags ?? []),
        ]),
      ),
      followUpQuestions: [
        ...coerceStringArray(parsed?.next_best_questions, 3),
        ...base.questions,
      ].slice(0, 3),
      suggestedActions: [
        ...coerceStringArray(parsed?.suggested_actions, 4),
        ...base.actions,
      ].slice(0, 4),
      citations: selectedEvidence.map((item) => item.title),
      traces,
      usage: result.usage,
      intent,
      responseMode: "llm",
      coachState: nextState,
      activeBlock,
      stateChanges: Array.from(
        new Set([
          ...stateChanges,
          ...coerceStringArray(parsed?.state_changes, 6),
        ]),
      ),
      evidenceItems: selectedEvidence,
      assumptionsUsed: Array.from(
        new Set([
          ...assumptions,
          ...coerceStringArray(parsed?.assumptions_used, 6),
        ]),
      ),
      memoryApplied: Array.from(
        new Set([
          ...memoryApplied,
          ...coerceStringArray(parsed?.memory_applied, 6),
        ]),
      ),
      queryRoute: route,
      scenarioPlan,
      unresolvedQuestions: coerceStringArray(parsed?.unresolved_questions, 4),
    };
  } catch (error) {
    traces.push({
      agentName: "coach-orchestrator-v2",
      model,
      latencyMs: 0,
      input: { intent, route },
      output: {},
      error: error instanceof Error ? error.message : "Unknown v2 orchestrator error",
    });
    return fallbackReply({
      intent,
      userMessage: referenceResolution.resolvedMessage,
      cockpit,
      coachState: nextState,
      activeBlock,
      scenarioPlan,
      assumptions,
      memoryApplied,
      evidenceItems,
      wellnessSnapshot,
      stateChanges,
      route,
      traceSeed: traces,
    });
  }
}
