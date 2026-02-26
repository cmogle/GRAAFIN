import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { OnboardingFlowAgent } from "@/components/onboarding/onboarding-flow-agent";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
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
        <h1 className="text-2xl font-semibold text-slate-900">Onboarding</h1>
        <p className="mt-1 text-sm text-slate-600">
          Complete setup once, then let automation keep data fresh.
        </p>
      </div>

      <SectionCard title="Onboarding flow agent">
        <OnboardingFlowAgent />
      </SectionCard>
    </AppShell>
  );
}
