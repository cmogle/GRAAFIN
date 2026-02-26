import { NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { runCoachEvalSuite } from "@/lib/coach/eval";

export async function GET() {
  if (!featureFlags.coachContextV2) {
    return NextResponse.json({ error: "Coach context v2 is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const suite = runCoachEvalSuite();
  return NextResponse.json(suite);
}
