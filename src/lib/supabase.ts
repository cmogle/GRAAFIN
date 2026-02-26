import { createBrowserClient } from "@supabase/ssr";
import { assertExpectedSupabaseProject } from "@/lib/supabase/config";
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env vars");
  assertExpectedSupabaseProject(url);
  return createBrowserClient(url, anon);
}
