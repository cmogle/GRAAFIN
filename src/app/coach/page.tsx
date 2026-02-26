import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
import { CoachChatPanel } from "@/components/coach/coach-chat-panel";
import { createClient } from "@/lib/supabase/server";

export default async function CoachPage() {
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
        <h1 className="text-2xl font-semibold text-slate-900">Coach</h1>
        <p className="mt-1 text-sm text-slate-600">
          Evidence-based guidance from your persistent training partner.
        </p>
      </div>

      <SectionCard title="Conversation">
        <CoachChatPanel />
      </SectionCard>
    </AppShell>
  );
}
