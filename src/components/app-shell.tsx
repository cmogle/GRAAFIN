"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TopNav } from "@/components/top-nav";
import { AppLaunchSync } from "@/components/mobile/app-launch-sync";
import { BottomTabBar } from "@/components/mobile/bottom-tab-bar";
import { cn } from "@/lib/utils";

const desktopTabs = [
  { href: "/dashboard", label: "Today" },
  { href: "/coach", label: "Coach" },
  { href: "/trends", label: "Trends" },
  { href: "/plan", label: "Plan" },
  { href: "/wellness", label: "Wellness" },
  { href: "/profile", label: "Profile" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e2f4ff_0%,_#f8fbfd_35%,_#f5f7f8_100%)]">
      <AppLaunchSync />
      <TopNav />
      <div className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:px-6 lg:pb-8 lg:pt-6">
        <nav className="mb-4 hidden rounded-2xl border border-slate-200/70 bg-white/90 p-1 lg:flex lg:gap-1">
          {desktopTabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm font-medium transition",
                  active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <main className="space-y-4 lg:space-y-6">{children}</main>
      </div>
      <BottomTabBar />
    </div>
  );
}
