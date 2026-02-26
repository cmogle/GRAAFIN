"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, ChartLine, User, CalendarCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Today", icon: Activity },
  { href: "/coach", label: "Coach", icon: Bot },
  { href: "/trends", label: "Trends", icon: ChartLine },
  { href: "/plan", label: "Plan", icon: CalendarCheck2 },
  { href: "/profile", label: "Profile", icon: User },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-xl grid-cols-5 gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-medium",
                  active ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon className="mb-1 h-4 w-4" />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
