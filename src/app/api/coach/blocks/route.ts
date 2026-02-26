import { NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import { loadOrBuildMarathonBlocks } from "@/lib/coach/blocks";

export async function GET() {
  if (!featureFlags.coachV1) {
    return NextResponse.json({ error: "Coach feature is disabled" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const blockContext = await loadOrBuildMarathonBlocks({ supabase, userId: user.id });
  return NextResponse.json({
    activeBlock: blockContext.activeBlock,
    blocks: blockContext.blocks,
    source: blockContext.source,
    generatedAt: new Date().toISOString(),
  });
}
