import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

function toNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

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
  const mealTime = typeof body.mealTime === "string" ? body.mealTime : new Date().toISOString();
  const source = typeof body.source === "string" ? body.source : "manual";
  const photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : null;

  const payload = {
    user_id: user.id,
    meal_time: mealTime,
    meal_type: typeof body.mealType === "string" ? body.mealType : null,
    description: typeof body.description === "string" ? body.description : null,
    calories: toNumber(body.calories),
    carbs_g: toNumber(body.carbsG),
    protein_g: toNumber(body.proteinG),
    fat_g: toNumber(body.fatG),
    hydration_ml: toNumber(body.hydrationMl),
    photo_url: photoUrl,
    recognition_status: photoUrl ? "pending" : "none",
    recognized_items: Array.isArray(body.recognizedItems) ? body.recognizedItems : [],
    source,
    confidence: toNumber(body.confidence) ?? (photoUrl ? 0.55 : 0.75),
    raw_data: body.rawData && typeof body.rawData === "object" ? body.rawData : {},
  };

  const { data, error } = await supabase
    .from("wellness_nutrition_entries")
    .insert(payload)
    .select("id,meal_time,description,recognition_status,calories,protein_g,carbs_g,hydration_ml,created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
