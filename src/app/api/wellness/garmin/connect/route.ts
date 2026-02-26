import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { featureFlags } from "@/lib/feature-flags";

type ConnectPayload = {
  action?: "connect" | "disconnect";
};

export async function POST(request: NextRequest) {
  if (!featureFlags.wellnessSleepV1 && !featureFlags.wellnessNutritionV1) {
    return NextResponse.json({ error: "Wellness features are disabled" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as ConnectPayload;
  const action = body.action === "disconnect" ? "disconnect" : "connect";
  const now = new Date().toISOString();

  const { error } = await supabase.from("wellness_data_sources").upsert(
    {
      user_id: user.id,
      provider: "other",
      status: action === "connect" ? "connected" : "disconnected",
      metadata: {
        providerName: "garmin_connect_export",
        mode: "export_file",
        connectedAt: action === "connect" ? now : null,
        updatedAt: now,
      },
      last_synced_at: action === "connect" ? now : null,
    },
    { onConflict: "user_id,provider" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    connected: action === "connect",
    mode: "export_file",
    message:
      action === "connect"
        ? "Garmin export mode connected. Use import to sync Garmin Connect data."
        : "Garmin export mode disconnected.",
  });
}
