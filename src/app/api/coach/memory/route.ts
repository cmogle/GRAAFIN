import { NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
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

  const { data, error } = await supabase
    .from("coach_memory_items")
    .select("id,memory_type,content,confidence,created_at,updated_at")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json(
      {
        error: error.message.includes("does not exist")
          ? "Coach memory table missing. Run docs/SUPABASE_COACH_SCHEMA.sql."
          : error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      type: String(row.memory_type),
      content: String(row.content),
      confidence: Number(row.confidence ?? 0.6),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
  });
}
