import { redirect } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { WellnessInputsPanel } from "@/components/profile/wellness-inputs-panel";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export default async function WellnessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Wellness Inputs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Log sleep and nutrition signals used in readiness and coaching context.
        </p>
      </div>

      {featureFlags.wellnessMorningVoiceV1 ? (
        <SectionCard title="Morning capture">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-700">
              Voice-first one-handed flow for morning Garmin readout. Reads one question per screen and auto-advances on valid input.
            </p>
            <Link
              href="/wellness/morning"
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Start Morning Capture
            </Link>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Sleep + nutrition">
        <WellnessInputsPanel />
      </SectionCard>
    </AppShell>
  );
}
