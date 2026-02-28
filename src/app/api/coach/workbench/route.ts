import { NextRequest, NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { buildWorkbenchForSurface } from "@/lib/coach/workbench";
import { WorkbenchSurface } from "@/lib/coach/types";

function parseSurface(raw: string | null): WorkbenchSurface {
  return raw === "dashboard" ? "dashboard" : "coach";
}

export async function GET(request: NextRequest) {
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

  const surface = parseSurface(request.nextUrl.searchParams.get("surface"));
  const result = await buildWorkbenchForSurface({
    supabase,
    userId: user.id,
    surface,
  });

  return NextResponse.json({
    surface,
    modules: result.modules,
    profileVersion: result.profileVersion,
    generatedAt: new Date().toISOString(),
  });
}
