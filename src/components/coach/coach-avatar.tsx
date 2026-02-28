import { HeartPulse } from "lucide-react";

export function CoachAvatar({ size = "sm" }: { size?: "sm" | "md" }) {
  const dimension = size === "md" ? "h-9 w-9" : "h-7 w-7";
  const icon = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";
  return (
    <span className={`inline-flex ${dimension} items-center justify-center rounded-full bg-emerald-100 text-emerald-700`}>
      <HeartPulse className={icon} />
    </span>
  );
}
