import { NextResponse } from "next/server";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";
import {
  loadAthleteState,
  loadCoachObjective,
  loadConversationState,
  loadEvidenceItems,
} from "@/lib/coach/context";
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

  const { data: latestThread } = await supabase
    .from("coach_threads")
    .select("id")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const threadId = latestThread?.id ? String(latestThread.id) : null;
  const [objective, athleteState, conversationState, blockContext, evidenceItems] = await Promise.all([
    loadCoachObjective(supabase, user.id),
    loadAthleteState(supabase, user.id),
    loadConversationState({ supabase, userId: user.id, threadId }),
    featureFlags.coachBlocksV2
      ? loadOrBuildMarathonBlocks({ supabase, userId: user.id })
      : Promise.resolve({ activeBlock: null, blocks: [], source: "computed" as const }),
    featureFlags.coachEvidenceV1
      ? loadEvidenceItems({ supabase, userId: user.id, topicHint: "marathon", limit: 4 })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    threadId,
    objective,
    coachState: athleteState,
    conversationState,
    activeBlock: blockContext.activeBlock,
    blocks: blockContext.blocks,
    evidencePreview: evidenceItems,
    generatedAt: new Date().toISOString(),
  });
}
