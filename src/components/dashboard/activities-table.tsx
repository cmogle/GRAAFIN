import Link from "next/link";
import { formatPace, RunActivity, classifyRunType, paceSecPerKm } from "@/lib/metrics/dashboard";

export function ActivitiesTable({ runs }: { runs: RunActivity[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="px-2 py-2">Date</th>
            <th className="px-2 py-2">Run</th>
            <th className="px-2 py-2">Distance</th>
            <th className="px-2 py-2">Pace</th>
            <th className="px-2 py-2">Effort</th>
          </tr>
        </thead>
        <tbody>
          {runs.slice(0, 12).map((run) => (
            <tr key={run.id} className="border-t border-slate-100">
              <td className="px-2 py-2">{new Date(run.startDate).toLocaleDateString()}</td>
              <td className="px-2 py-2">
                <Link href={`/activities/${run.id}`} className="text-slate-800 underline-offset-2 hover:underline">
                  {run.name}
                </Link>
              </td>
              <td className="px-2 py-2">{(run.distanceM / 1000).toFixed(1)} km</td>
              <td className="px-2 py-2">{formatPace(paceSecPerKm(run))}</td>
              <td className="px-2 py-2 capitalize">{classifyRunType(run)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
