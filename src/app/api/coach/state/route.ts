import { NextRequest, NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import {
  defaultConversationState,
  loadAthleteState,
  loadConversationState,
  upsertAthleteState,
  upsertConversationState,
} from "@/lib/coach/context";

type StatePayload = {
  threadId?: string;
  availabilityState?: "normal" | "injury_adaptation" | "medical_hold" | "return_build";
  runningAllowed?: boolean;
  expectedReturnDate?: string | null;
  note?: string;
};

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export async function POST(request: NextRequest) {
  if (!featureFlags.coachContextV2) {
    return NextResponse.json({ error: "Coach context v2 is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as StatePayload;
  const threadId = typeof body.threadId === "string" ? body.threadId : null;
  const currentAthleteState = await loadAthleteState(supabase, user.id);
  const conversationState = threadId
    ? await loadConversationState({ supabase, userId: user.id, threadId })
    : defaultConversationState();

  const nextAthleteState = await upsertAthleteState({
    supabase,
    userId: user.id,
    current: currentAthleteState,
    update: {
      availabilityState: body.availabilityState,
      runningAllowed: typeof body.runningAllowed === "boolean" ? body.runningAllowed : undefined,
      expectedReturnDate:
        body.expectedReturnDate === undefined ? undefined : normalizeDate(body.expectedReturnDate),
      source: "user",
      confidence: 0.95,
      note: typeof body.note === "string" ? body.note.trim() : undefined,
    },
  });

  if (threadId) {
    await upsertConversationState({
      supabase,
      userId: user.id,
      threadId,
      state: {
        ...conversationState,
        activeConstraints: Array.from(
          new Set([
            ...conversationState.activeConstraints,
            ...(typeof body.note === "string" && body.note.trim().length > 0 ? [body.note.trim()] : []),
          ]),
        ).slice(0, 12),
        updatedAt: new Date().toISOString(),
      },
      coachState: nextAthleteState,
      updatedBy: "user",
    });
  }

  return NextResponse.json({
    ok: true,
    coachState: nextAthleteState,
    updatedAt: new Date().toISOString(),
  });
}
