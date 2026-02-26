import { NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  if (!featureFlags.dailyCheckinV1) {
    return NextResponse.json({ error: "Check-in feature is disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("coach_checkins")
    .select("id,checkin_date,body,readiness_score,metadata,created_at")
    .eq("user_id", user.id)
    .order("checkin_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    checkin: data
      ? {
          id: String(data.id),
          date: String(data.checkin_date),
          body: String(data.body),
          readinessScore: data.readiness_score == null ? null : Number(data.readiness_score),
          metadata: data.metadata ?? {},
          createdAt: String(data.created_at),
        }
      : null,
  });
}
