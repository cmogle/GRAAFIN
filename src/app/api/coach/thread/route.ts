import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

function asPositiveInt(raw: string | null, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.trunc(parsed);
}

function normalizeContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["text", "content", "message"]) {
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

export async function GET(request: NextRequest) {
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

  const threadId = request.nextUrl.searchParams.get("threadId");
  const limit = Math.min(120, asPositiveInt(request.nextUrl.searchParams.get("limit"), 60));

  let effectiveThreadId = threadId;
  if (!effectiveThreadId) {
    const { data: latestThread } = await supabase
      .from("coach_threads")
      .select("id,title,updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    effectiveThreadId = latestThread?.id ? String(latestThread.id) : null;
  }

  if (!effectiveThreadId) {
    return NextResponse.json({ thread: null, messages: [] });
  }

  const [{ data: thread }, { data: messages, error: messageError }] = await Promise.all([
    supabase
      .from("coach_threads")
      .select("id,title,context_mode,created_at,updated_at")
      .eq("id", effectiveThreadId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("coach_messages")
      .select("id,role,content,confidence,citations,metadata,created_at")
      .eq("thread_id", effectiveThreadId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(limit),
  ]);

  if (messageError) {
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }

  const normalizedMessages = (messages ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      ...item,
      content: normalizeContent(item.content),
    };
  });

  return NextResponse.json({
    thread: thread ?? null,
    messages: normalizedMessages,
  });
}
