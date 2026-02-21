import { AppShell } from "@/components/app-shell";
import { SectionCard } from "@/components/section-card";

const sampleWeek = [
  { day: "Mon", workout: "Easy Run", detail: "8 km @ Z2", status: "Complete" },
  { day: "Tue", workout: "Intervals", detail: "6 x 1 km @ 10K pace", status: "Planned" },
  { day: "Wed", workout: "Recovery", detail: "6 km + mobility", status: "Planned" },
  { day: "Thu", workout: "Tempo", detail: "10 km incl. 5 km tempo", status: "Planned" },
  { day: "Fri", workout: "Rest", detail: "Optional cross-train", status: "Planned" },
  { day: "Sat", workout: "Easy Run", detail: "12 km @ Z2", status: "Planned" },
  { day: "Sun", workout: "Long Run", detail: "24 km progressive", status: "Planned" },
];

export default function PlanPage() {
  return (
    <AppShell>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Training Plan & Objectives</h1>
        <p className="mt-1 text-sm text-slate-600">Structure race goals, then track weekly workout execution.</p>
      </div>

      <SectionCard title="Primary objective">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Goal race (e.g., Boston Marathon)" />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Goal race date" />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Goal finish time (hh:mm:ss)" />
          <input className="rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder="Target weekly volume (km)" />
        </div>
      </SectionCard>

      <SectionCard title="Weekly plan table">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="px-2 py-2">Day</th>
                <th className="px-2 py-2">Workout</th>
                <th className="px-2 py-2">Details</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {sampleWeek.map((row) => (
                <tr key={row.day} className="border-t border-slate-100">
                  <td className="px-2 py-2 font-medium text-slate-800">{row.day}</td>
                  <td className="px-2 py-2">{row.workout}</td>
                  <td className="px-2 py-2 text-slate-600">{row.detail}</td>
                  <td className="px-2 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
