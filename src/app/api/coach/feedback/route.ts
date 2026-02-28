import { NextRequest, NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

type FeedbackPayload = {
  eventId?: string | null;
  feedbackType?: string;
  payload?: Record<string, unknown>;
};

const ALLOWED_FEEDBACK_TYPES = new Set(["thumb_up", "thumb_down", "module_open", "module_hide"]);

export async function POST(request: NextRequest) {
  if (!featureFlags.coachWorkbenchV1) {
    return NextResponse.json({ error: "Coach workbench is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as FeedbackPayload;
  const feedbackType = typeof body.feedbackType === "string" ? body.feedbackType.trim() : "";
  if (!ALLOWED_FEEDBACK_TYPES.has(feedbackType)) {
    return NextResponse.json({ error: "Invalid feedbackType" }, { status: 400 });
  }

  const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

  const { error } = await supabase.from("coach_feedback_events").insert({
    user_id: user.id,
    event_id: typeof body.eventId === "string" && body.eventId.length > 0 ? body.eventId : null,
    feedback_type: feedbackType,
    payload,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, createdAt: new Date().toISOString() });
}
