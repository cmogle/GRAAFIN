import { NextRequest, NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import {
  buildWorkbenchForSurface,
  upsertWorkbenchLayout,
} from "@/lib/coach/workbench";
import {
  WorkbenchModuleKey,
  WorkbenchSurface,
  WorkbenchVisibility,
} from "@/lib/coach/types";

type LayoutPayload = {
  surface?: string;
  moduleKey?: string;
  visibility?: string;
  pinned?: boolean;
  slotIndex?: number;
  score?: number;
  reason?: string | null;
};

const ALL_MODULE_KEYS: WorkbenchModuleKey[] = [
  "risk_banner",
  "scenario_planner",
  "assumption_trace",
  "memory_trace",
  "evidence_stack",
  "action_rail",
  "readiness_focus",
  "block_progress",
  "load_risk",
  "wellness_recovery",
  "plan_adherence",
  "query_theme_summary",
];

function parseSurface(raw: unknown): WorkbenchSurface | null {
  return raw === "coach" || raw === "dashboard" ? raw : null;
}

function parseVisibility(raw: unknown): WorkbenchVisibility | null {
  return raw === "auto" || raw === "manual_shown" || raw === "manual_hidden" ? raw : null;
}

function parseModule(raw: unknown): WorkbenchModuleKey | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim();
  return ALL_MODULE_KEYS.includes(normalized as WorkbenchModuleKey)
    ? (normalized as WorkbenchModuleKey)
    : null;
}

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

  const body = (await request.json().catch(() => ({}))) as LayoutPayload;
  const surface = parseSurface(body.surface);
  const moduleKey = parseModule(body.moduleKey);

  if (!surface || !moduleKey) {
    return NextResponse.json({ error: "surface and moduleKey are required" }, { status: 400 });
  }

  const visibility = parseVisibility(body.visibility ?? "auto") ?? "auto";
  const slotIndex = Number.isFinite(body.slotIndex) ? Math.max(0, Math.trunc(Number(body.slotIndex))) : 0;
  const score = Number.isFinite(body.score) ? Number(body.score) : 0;

  await upsertWorkbenchLayout({
    supabase,
    userId: user.id,
    surface,
    moduleKey,
    visibility,
    pinned: Boolean(body.pinned),
    slotIndex,
    score,
    reason: typeof body.reason === "string" ? body.reason.trim() || null : null,
  });

  const updated = await buildWorkbenchForSurface({
    supabase,
    userId: user.id,
    surface,
  });

  return NextResponse.json({
    ok: true,
    surface,
    modules: updated.modules,
    profileVersion: updated.profileVersion,
    updatedAt: new Date().toISOString(),
  });
}
