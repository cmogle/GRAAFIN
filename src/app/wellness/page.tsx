import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { WellnessInputsPanel } from "@/components/profile/wellness-inputs-panel";
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

      <SectionCard title="Sleep + nutrition">
        <WellnessInputsPanel />
      </SectionCard>
    </AppShell>
  );
}
