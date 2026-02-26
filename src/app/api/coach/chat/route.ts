import { NextRequest, NextResponse } from "next/server";
import { buildCockpitPayload } from "@/lib/mobile/cockpit";
import {
  CoachMemoryItem,
  extractAndPersistMemory,
  orchestrateCoachReply,
  persistAgentTrace,
} from "@/lib/coach/orchestrator";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

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
      return NextResponse.json({ error: tableMissingMessage(userMessageError) }, { status: 500 });
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

    const [{ data: memoryRows }, { data: messageRows }, cockpit] = await Promise.all([
      memoryPromise,
      supabase
        .from("coach_messages")
        .select("id,role,content,created_at")
        .eq("user_id", user.id)
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
        .limit(40),
      buildCockpitPayload({ supabase, userId: user.id }),
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

    const coach = await orchestrateCoachReply({
      userMessage: message,
      cockpit,
      memoryItems,
      conversation,
      contextMode,
    });
    const assistantContent = normalizeContent(coach.assistantMessage);

    const { data: assistantRow } = await supabase
      .from("coach_messages")
      .insert({
        user_id: user.id,
        thread_id: thread.id,
        role: "assistant",
        content: assistantContent,
        confidence: coach.confidence,
        citations: coach.citations,
        metadata: {
          riskFlags: coach.riskFlags,
          suggestedActions: coach.suggestedActions,
          followUpQuestions: coach.followUpQuestions,
          usage: coach.usage ?? null,
        },
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

    await Promise.all([
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
      ...coach.traces.map((trace) =>
        persistAgentTrace({
          supabase,
          userId: user.id,
          threadId: thread?.id ?? null,
          messageId: assistantMessageId,
          trace,
        })),
    ]);

    return NextResponse.json({
      threadId: thread.id,
      assistantMessage: assistantContent,
      citations: coach.citations,
      confidence: coach.confidence,
      suggestedActions: coach.suggestedActions,
      riskFlags: coach.riskFlags,
      followUpQuestions: coach.followUpQuestions,
      usage: coach.usage ?? null,
      generatedAt: new Date().toISOString(),
      userMessageId: userMessageRow?.id ?? null,
      assistantMessageId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: tableMissingMessage(error) },
      { status: 500 },
    );
  }
}
