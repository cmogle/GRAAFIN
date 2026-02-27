import { redirect } from "next/navigation";
import { MorningCaptureFlow } from "@/components/wellness/morning-capture-flow";
import { featureFlags } from "@/lib/feature-flags";
import { createClient } from "@/lib/supabase/server";

export default async function MorningWellnessCapturePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!featureFlags.wellnessMorningVoiceV1) {
    redirect("/wellness");
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e2f4ff_0%,_#f8fbfd_35%,_#f5f7f8_100%)]">
      <MorningCaptureFlow />
    </div>
  );
}
