"use client";

import Link from "next/link";
import { Activity, Menu, X } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { useState, useEffect, useRef } from "react";

export function TopNav() {
  const [open, setOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setOpen(!open)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
              aria-label="Toggle navigation"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-base font-semibold text-foreground"
            >
              <Activity className="h-5 w-5 text-accent" />
              <span className="hidden sm:inline">Fionnuala Run Coach</span>
              <span className="sm:hidden">Fionnuala</span>
            </Link>
          </div>

          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            Live Data
          </span>
        </div>
      </header>

      {/* Mobile sidebar sheet */}
      {open && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm lg:hidden">
          <div
            ref={sheetRef}
            className="absolute inset-y-0 left-0 w-64 border-r border-border bg-card p-4 pt-16 shadow-lg"
          >
            <SidebarNav onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
