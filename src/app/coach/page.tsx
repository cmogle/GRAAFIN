import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
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
      <CoachChatPanel />
    </AppShell>
  );
}
