import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { assertExpectedSupabaseProject } from "@/lib/supabase/config";

export async function createClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const missing = [
    !supabaseUrl && "NEXT_PUBLIC_SUPABASE_URL",
    !supabaseAnonKey && "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing Supabase env vars (set in Vercel → Project → Settings → Environment Variables): ${missing.join(", ")}`);
  }
  assertExpectedSupabaseProject(supabaseUrl as string);

  return createServerClient(supabaseUrl as string, supabaseAnonKey as string, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // ignored in Server Components when setting cookies is not supported.
        }
      },
    },
  });
}
