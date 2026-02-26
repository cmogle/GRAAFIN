import { NextRequest, NextResponse } from "next/server";
import { buildCockpitPayload } from "@/lib/mobile/cockpit";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  const payload = await buildCockpitPayload({
    supabase,
    userId: user.id,
    date,
  });

  return NextResponse.json(payload);
}
