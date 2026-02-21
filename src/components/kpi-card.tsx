import { cn } from "@/lib/utils";

type Status = "green" | "yellow" | "red" | "neutral";

const statusStyles: Record<Status, string> = {
  green: "bg-success-muted text-success",
  yellow: "bg-warning-muted text-warning",
  red: "bg-destructive-muted text-destructive",
  neutral: "bg-muted text-muted-foreground",
};

export function KpiCard({
  label,
  value,
  sub,
  status = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  status?: Status;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold text-card-foreground">{value}</div>
      {sub ? (
        <div
          className={cn(
            "mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
            statusStyles[status]
          )}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}
