import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";
export default function ProfilePage() {
  return <AppShell><h1 className="text-2xl font-semibold text-slate-900">Profile & Connections</h1><SectionCard title="Connected Services"><div className="space-y-2 text-sm text-slate-700"><p>Google: Connected</p><p>Strava: Connected</p><p>Supabase: Active</p><p>OpenAI: Not configured</p></div></SectionCard></AppShell>;
}
