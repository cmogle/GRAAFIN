import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

export async function POST(request: NextRequest) {
  if (!featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Nutrition feature is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const entryId = typeof body.entryId === "string" ? body.entryId : "";
  if (!entryId) return NextResponse.json({ error: "entryId is required" }, { status: 400 });

  const recognizedItems = Array.isArray(body.recognizedItems) ? body.recognizedItems : [];
  const status = recognizedItems.length > 0 ? "processed" : "pending";

  const { data, error } = await supabase
    .from("wellness_nutrition_entries")
    .update({
      recognition_status: status,
      recognized_items: recognizedItems,
      confidence: recognizedItems.length > 0 ? 0.7 : 0.55,
      source: "camera",
    })
    .eq("id", entryId)
    .eq("user_id", user.id)
    .select("id,recognition_status,recognized_items,confidence,updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Nutrition entry not found" }, { status: 404 });

  return NextResponse.json({
    item: data,
    note:
      recognizedItems.length > 0
        ? "Recognition payload saved."
        : "Recognition is queued; no recognized items supplied yet.",
  });
}
