function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

export function assertExpectedSupabaseProject(url: string) {
  const expected = process.env.EXPECTED_SUPABASE_PROJECT_REF?.trim();
  if (!expected) return;

  const actual = projectRefFromUrl(url);
  if (!actual) return;

  if (actual !== expected) {
    throw new Error(
      `Supabase project mismatch: expected ${expected}, got ${actual}. ` +
        "Check NEXT_PUBLIC_SUPABASE_URL in the deployment environment.",
    );
  }
}

export function getSupabaseProjectRef(url: string | undefined | null) {
  if (!url) return null;
  return projectRefFromUrl(url);
}
