import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

const services = [
  { name: "Google", status: "Connected" },
  { name: "Strava", status: "Connected" },
  { name: "Supabase", status: "Active" },
  { name: "OpenAI", status: "Not configured" },
];

export default function ProfilePage() {
  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Profile & Connections</h1>
        <p className="mt-1 text-sm text-slate-600">Manage data sources and environment status for coaching features.</p>
      </div>

      <SectionCard title="Connected services">
        <div className="grid gap-2 text-sm">
          {services.map((service) => (
            <div key={service.name} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2">
              <span className="font-medium text-slate-800">{service.name}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{service.status}</span>
            </div>
          ))}
        </div>
      </SectionCard>
    </AppShell>
  );
}
