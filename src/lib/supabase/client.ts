import { createBrowserClient } from "@supabase/ssr";
import { assertExpectedSupabaseProject } from "@/lib/supabase/config";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const missing = [
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing Supabase env vars: ${missing.join(", ")}`);
  }
  assertExpectedSupabaseProject(supabaseUrl as string);
  return createBrowserClient(supabaseUrl as string, supabaseAnonKey as string);
}
