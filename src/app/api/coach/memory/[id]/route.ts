import { NextRequest, NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!featureFlags.coachMemoryV1) {
    return NextResponse.json({ error: "Memory feature is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  const content = typeof body?.content === "string" ? body.content.trim() : null;
  const confidence = body?.confidence == null ? null : Number(body.confidence);
  const memoryType = typeof body?.type === "string" ? body.type.trim().toLowerCase() : null;

  const payload: Record<string, unknown> = {};
  if (content) payload.content = content;
  if (memoryType) payload.memory_type = memoryType.slice(0, 40);
  if (confidence != null && Number.isFinite(confidence)) {
    payload.confidence = Math.max(0.01, Math.min(0.99, confidence));
  }

  if (!Object.keys(payload).length) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("coach_memory_items")
    .update(payload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id,memory_type,content,confidence,created_at,updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Memory item not found" }, { status: 404 });
  }

  return NextResponse.json({
    item: {
      id: String(data.id),
      type: String(data.memory_type),
      content: String(data.content),
      confidence: Number(data.confidence ?? 0.6),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!featureFlags.coachMemoryV1) {
    return NextResponse.json({ error: "Memory feature is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { data, error } = await supabase
    .from("coach_memory_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Memory item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
