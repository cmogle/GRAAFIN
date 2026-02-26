import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";
import { buildWellnessSnapshot } from "@/lib/wellness/context";

export async function GET() {
  if (!featureFlags.wellnessSleepV1 && !featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Wellness features are disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const snapshot = await buildWellnessSnapshot({ supabase, userId: user.id });
  return NextResponse.json(snapshot);
}
