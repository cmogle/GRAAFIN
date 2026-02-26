import { NextResponse } from "next/server";
import { getSupabaseProjectRef } from "@/lib/supabase/config";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const actualRef = getSupabaseProjectRef(url);
  const expectedRef = process.env.EXPECTED_SUPABASE_PROJECT_REF ?? null;
  return NextResponse.json({
    ok: true,
    service: "graafin-web",
    ts: new Date().toISOString(),
    supabaseProjectRef: actualRef,
    expectedSupabaseProjectRef: expectedRef,
    supabaseProjectMatch: expectedRef ? expectedRef === actualRef : null,
  });
}
