import { createHash } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { CockpitPayload } from "@/lib/mobile/cockpit";

type Usage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};

type OpenAIResult = {
  text: string;
  usage?: Usage;
};

export type CoachMemoryItem = {
  id: string;
  memoryType: string;
  content: string;
  confidence: number;
  createdAt: string;
  updatedAt: string;
};

export type CoachSpecialistTrace = {
  agentName: string;
  model: string;
  latencyMs: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
};

export type CoachOrchestratorResult = {
  assistantMessage: string;
  confidence: number;
  riskFlags: string[];
  followUpQuestions: string[];
  suggestedActions: string[];
  citations: string[];
  traces: CoachSpecialistTrace[];
  usage?: Usage;
};

type SpecialistOutput = {
  agentName: string;
  summary: string;
  confidence: number;
  riskFlags: string[];
  details: Record<string, unknown>;
};

type MemoryCandidate = {
  memoryType: string;
  content: string;
  confidence: number;
  semanticKey?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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

function semanticKey(memoryType: string, content: string) {
  return createHash("sha1")
    .update(`${memoryType}:${content.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 40);
}

function buildSpecialists({
  cockpit,
  recentRunCount,
}: {
  cockpit: CockpitPayload;
  recentRunCount: number;
}): SpecialistOutput[] {
  const loadFlags: string[] = [];
  if (cockpit.readiness.loadRatio >= 1.2) loadFlags.push("load_spike");
  if (cockpit.readiness.monotony >= 1.8) loadFlags.push("high_monotony");

  const readinessFlags: string[] = [];
  if (cockpit.readiness.score < 60) readinessFlags.push("low_readiness");
  if (cockpit.readiness.missingData) readinessFlags.push("limited_data");

  const pacingFlags: string[] = [];
  if (recentRunCount < 3) pacingFlags.push("limited_run_samples");

  return [
    {
      agentName: "endurance-intelligence",
      summary:
        `Acute load ${cockpit.readiness.acuteLoad.toFixed(1)} vs chronic ${cockpit.readiness.chronicLoad.toFixed(1)} ` +
        `(ratio ${cockpit.readiness.loadRatio.toFixed(2)}). Monotony ${cockpit.readiness.monotony.toFixed(2)}.`,
      confidence: clamp(cockpit.readiness.confidence / 100, 0.35, 0.95),
      riskFlags: loadFlags,
      details: {
        acuteLoad: cockpit.readiness.acuteLoad,
        chronicLoad: cockpit.readiness.chronicLoad,
        loadRatio: cockpit.readiness.loadRatio,
        monotony: cockpit.readiness.monotony,
      },
    },
    {
      agentName: "readiness-specialist",
      summary:
        `Readiness score is ${cockpit.readiness.score.toFixed(1)} (${cockpit.readiness.status}) ` +
        `with confidence ${cockpit.readiness.confidence.toFixed(1)}%.`,
      confidence: clamp(cockpit.readiness.confidence / 100, 0.35, 0.98),
      riskFlags: readinessFlags,
      details: {
        score: cockpit.readiness.score,
        status: cockpit.readiness.status,
        confidence: cockpit.readiness.confidence,
      },
    },
    {
      agentName: "pacing-specialist",
      summary:
        `Recent run sample size is ${recentRunCount}. Today has ${cockpit.todayPlan.workouts.length} planned workout(s).`,
      confidence: recentRunCount >= 8 ? 0.8 : 0.58,
      riskFlags: pacingFlags,
      details: {
        recentRunCount,
        todayWorkoutCount: cockpit.todayPlan.workouts.length,
      },
    },
    {
      agentName: "visualization-agent",
      summary:
        `Visualization focus: 14-day readiness/load trend and explicit quick actions for today's plan.`,
      confidence: 0.84,
      riskFlags: [],
      details: {
        loadTrendPoints: cockpit.loadTrend.length,
        quickInsightCount: cockpit.quickInsights.length,
      },
    },
  ];
}

function fallbackCoachReply({
  userMessage,
  cockpit,
  specialists,
}: {
  userMessage: string;
  cockpit: CockpitPayload;
  specialists: SpecialistOutput[];
}): CoachOrchestratorResult {
  const topInsight = cockpit.quickInsights[0] ?? "Keep effort controlled and prioritize consistency.";
  const response =
    `You're asking: "${userMessage}".\n\n` +
    `Today: readiness ${cockpit.readiness.score.toFixed(0)} (${cockpit.readiness.status}), ` +
    `acute/chronic ${cockpit.readiness.loadRatio.toFixed(2)}.\n` +
    `Primary guidance: ${topInsight}\n\n` +
    `Suggested next action: run a low-risk session aligned with today's plan and re-check readiness tomorrow.`;

  return {
    assistantMessage: response,
    confidence: clamp(
      specialists.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, specialists.length),
      0.4,
      0.9,
    ),
    riskFlags: specialists.flatMap((item) => item.riskFlags),
    followUpQuestions: [
      "How did your last hard session feel at the end?",
      "Any niggles or unusual fatigue today?",
    ],
    suggestedActions: [
      "Open Today cockpit",
      "Review planned workout",
      "Log post-run RPE after session",
    ],
    citations: specialists.map((item) => item.agentName),
    traces: specialists.map((item) => ({
      agentName: item.agentName,
      model: "heuristic",
      latencyMs: 1,
      input: { userMessage },
      output: {
        summary: item.summary,
        confidence: item.confidence,
        riskFlags: item.riskFlags,
      },
    })),
  };
}

function safeNormalizeMemoryType(memoryType: string) {
  const normalized = memoryType.trim().toLowerCase();
  if (["goal", "constraint", "preference", "injury_note", "habit"].includes(normalized)) return normalized;
  return "preference";
}

function heuristicMemoryExtraction(userMessage: string): MemoryCandidate[] {
  const text = userMessage.trim();
  if (!text) return [];
  const lower = text.toLowerCase();
  const candidates: MemoryCandidate[] = [];

  if (lower.includes("goal") || lower.includes("target") || lower.includes("marathon")) {
    candidates.push({ memoryType: "goal", content: text, confidence: 0.62 });
  }
  if (lower.includes("can't") || lower.includes("cannot") || lower.includes("busy") || lower.includes("travel")) {
    candidates.push({ memoryType: "constraint", content: text, confidence: 0.58 });
  }
  if (lower.includes("prefer") || lower.includes("i like") || lower.includes("i enjoy")) {
    candidates.push({ memoryType: "preference", content: text, confidence: 0.56 });
  }
  if (lower.includes("injury") || lower.includes("pain") || lower.includes("niggle")) {
    candidates.push({ memoryType: "injury_note", content: text, confidence: 0.64 });
  }

  return candidates.slice(0, 3);
}

async function extractMemoryCandidatesWithModel({
  userMessage,
  assistantMessage,
}: {
  userMessage: string;
  assistantMessage: string;
}): Promise<MemoryCandidate[]> {
  const model = process.env.OPENAI_MEMORY_MODEL || "gpt-4.1-mini";
  const system =
    "Extract durable athlete memory candidates from the conversation. Return ONLY compact JSON." +
    " Schema: {\"items\":[{\"memoryType\":\"goal|constraint|preference|injury_note|habit\",\"content\":\"...\",\"confidence\":0.0-1.0}]}." +
    " Include only memories likely useful in future sessions.";
  const user =
    `User message:\n${userMessage}\n\nAssistant response:\n${assistantMessage}\n\nReturn JSON only.`;

  const result = await callResponsesApi({ system, user, model, maxOutputTokens: 280 });
  const parsed = tryParseJson<{ items?: MemoryCandidate[] }>(result.text);
  if (!parsed?.items || !Array.isArray(parsed.items)) return [];

  return parsed.items
    .map((item) => ({
      memoryType: safeNormalizeMemoryType(String(item.memoryType ?? "")),
      content: String(item.content ?? "").trim(),
      confidence: clamp(Number(item.confidence ?? 0.55), 0.35, 0.95),
    }))
    .filter((item) => item.content.length >= 8)
    .slice(0, 4);
}

export async function upsertMemoryCandidates({
  supabase,
  userId,
  sourceMessageId,
  candidates,
}: {
  supabase: SupabaseClient;
  userId: string;
  sourceMessageId: string | null;
  candidates: MemoryCandidate[];
}) {
  if (!candidates.length) return;
  try {
    await supabase
      .from("coach_memory_items")
      .upsert(
        candidates.map((item) => ({
          user_id: userId,
          memory_type: safeNormalizeMemoryType(item.memoryType),
          semantic_key: item.semanticKey ?? semanticKey(item.memoryType, item.content),
          content: item.content,
          confidence: clamp(item.confidence, 0.35, 0.99),
          source_message_id: sourceMessageId,
          archived_at: null,
        })),
        { onConflict: "user_id,semantic_key" },
      );
  } catch {
    // no-op if memory table isn't available yet
  }
}

export async function extractAndPersistMemory({
  supabase,
  userId,
  userMessage,
  assistantMessage,
  sourceMessageId,
}: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  assistantMessage: string;
  sourceMessageId: string | null;
}) {
  let candidates = heuristicMemoryExtraction(userMessage);

  if (process.env.OPENAI_API_KEY) {
    try {
      const modelCandidates = await extractMemoryCandidatesWithModel({ userMessage, assistantMessage });
      if (modelCandidates.length) candidates = modelCandidates;
    } catch {
      // keep heuristic fallback
    }
  }

  await upsertMemoryCandidates({
    supabase,
    userId,
    sourceMessageId,
    candidates,
  });
}

export async function persistAgentTrace({
  supabase,
  userId,
  threadId,
  messageId,
  trace,
}: {
  supabase: SupabaseClient;
  userId: string;
  threadId: string | null;
  messageId: string | null;
  trace: CoachSpecialistTrace;
}) {
  try {
    await supabase.from("coach_agent_traces").insert({
      user_id: userId,
      thread_id: threadId,
      message_id: messageId,
      agent_name: trace.agentName,
      model: trace.model,
      latency_ms: trace.latencyMs,
      input: trace.input,
      output: trace.output,
      error: trace.error ?? null,
    });
  } catch {
    // observability table is optional in early setup
  }
}

function buildContextSummary({
  cockpit,
  memoryItems,
  conversation,
}: {
  cockpit: CockpitPayload;
  memoryItems: CoachMemoryItem[];
  conversation: Array<{ role: string; content: string }>;
}) {
  const memorySummary = memoryItems.length
    ? memoryItems
        .slice(0, 12)
        .map((item) => `- [${item.memoryType}] ${item.content}`)
        .join("\n")
    : "- none";

  const chatSummary = conversation
    .slice(-8)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  return `Readiness ${cockpit.readiness.score.toFixed(1)} (${cockpit.readiness.status}), confidence ${cockpit.readiness.confidence.toFixed(1)}%.
Acute load ${cockpit.readiness.acuteLoad.toFixed(1)}, chronic load ${cockpit.readiness.chronicLoad.toFixed(1)}, ratio ${cockpit.readiness.loadRatio.toFixed(2)}, monotony ${cockpit.readiness.monotony.toFixed(2)}.
Today's planned workouts: ${cockpit.todayPlan.workouts.length}.
Quick insights: ${cockpit.quickInsights.join(" | ") || "none"}.

Persistent memory:
${memorySummary}

Recent conversation:
${chatSummary}`;
}

export async function orchestrateCoachReply({
  userMessage,
  cockpit,
  memoryItems,
  conversation,
  contextMode,
}: {
  userMessage: string;
  cockpit: CockpitPayload;
  memoryItems: CoachMemoryItem[];
  conversation: Array<{ role: string; content: string }>;
  contextMode: string;
}): Promise<CoachOrchestratorResult> {
  const recentRunCount = cockpit.loadTrend.length;
  const specialists = buildSpecialists({ cockpit, recentRunCount });

  const traces: CoachSpecialistTrace[] = specialists.map((item) => ({
    agentName: item.agentName,
    model: "heuristic-v1",
    latencyMs: 1,
    input: { readiness: cockpit.readiness, todayWorkoutCount: cockpit.todayPlan.workouts.length },
    output: {
      summary: item.summary,
      confidence: item.confidence,
      riskFlags: item.riskFlags,
      details: item.details,
    },
  }));

  if (!process.env.OPENAI_API_KEY) {
    return fallbackCoachReply({ userMessage, cockpit, specialists });
  }

  const model = process.env.OPENAI_ORCHESTRATOR_MODEL || "gpt-4.1";
  const system =
    "You are an evidence-based marathon coach. Be concise, specific, and practical. " +
    "Never provide medical diagnosis. Suggest only; do not imply autonomous app actions. " +
    "Return ONLY JSON with schema: " +
    "{\"recommendation\":\"string\",\"rationale\":\"string\",\"confidence\":0.0-1.0," +
    "\"risk_flags\":[\"string\"],\"follow_up_questions\":[\"string\"]," +
    "\"suggested_actions\":[\"string\"],\"citations\":[\"string\"]}.";
  const user =
    `Context mode: ${contextMode}\n` +
    `${buildContextSummary({ cockpit, memoryItems, conversation })}\n\n` +
    `Current user message:\n${userMessage}\n\n` +
    `Use the specialist perspectives:\n${specialists.map((s) => `- ${s.agentName}: ${s.summary}`).join("\n")}`;

  try {
    const startedAt = Date.now();
    const result = await callResponsesApi({ system, user, model, maxOutputTokens: 620 });
    const latencyMs = Date.now() - startedAt;

    const parsed = tryParseJson<{
      recommendation?: string;
      rationale?: string;
      confidence?: number;
      risk_flags?: string[];
      follow_up_questions?: string[];
      suggested_actions?: string[];
      citations?: string[];
    }>(result.text);

    if (!parsed?.recommendation || !parsed?.rationale) {
      throw new Error("Model returned non-JSON or missing required keys");
    }

    traces.push({
      agentName: "coach-orchestrator",
      model,
      latencyMs,
      input: {
        contextMode,
        memoryCount: memoryItems.length,
        conversationTurns: conversation.length,
      },
      output: parsed as Record<string, unknown>,
    });

    const riskFlags = Array.from(
      new Set([
        ...specialists.flatMap((s) => s.riskFlags),
        ...(Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map(String) : []),
      ]),
    );

    return {
      assistantMessage: `${parsed.recommendation}\n\nWhy: ${parsed.rationale}`,
      confidence: clamp(Number(parsed.confidence ?? 0.7), 0.25, 0.98),
      riskFlags,
      followUpQuestions: (parsed.follow_up_questions ?? []).map(String).slice(0, 3),
      suggestedActions: (parsed.suggested_actions ?? []).map(String).slice(0, 4),
      citations: (parsed.citations ?? []).map(String).slice(0, 6),
      traces,
      usage: result.usage,
    };
  } catch (error) {
    traces.push({
      agentName: "coach-orchestrator",
      model,
      latencyMs: 0,
      input: { contextMode },
      output: {},
      error: error instanceof Error ? error.message : "Unknown orchestrator error",
    });
    const fallback = fallbackCoachReply({ userMessage, cockpit, specialists });
    return {
      ...fallback,
      traces,
    };
  }
}
