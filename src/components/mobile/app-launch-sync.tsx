"use client";

import { useEffect } from "react";

const LAST_LAUNCH_SYNC_AT_KEY = "graafin_last_launch_sync_at_v2";
const APP_LAUNCH_CLIENT_COOLDOWN_MS = 20 * 60 * 1000;

export function AppLaunchSync() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.onLine) return;

    const lastTriggeredAtRaw = localStorage.getItem(LAST_LAUNCH_SYNC_AT_KEY);
    const lastTriggeredAt = lastTriggeredAtRaw ? Number(lastTriggeredAtRaw) : Number.NaN;
    const triggeredRecently = Number.isFinite(lastTriggeredAt)
      ? Date.now() - lastTriggeredAt < APP_LAUNCH_CLIENT_COOLDOWN_MS
      : false;
    if (triggeredRecently) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    fetch("/api/sync/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "app-launch" }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; skipped?: boolean };
        if (res.ok || payload.ok || payload.skipped) {
          localStorage.setItem(LAST_LAUNCH_SYNC_AT_KEY, String(Date.now()));
        }
      })
      .catch(() => {
        // Silent failure; app launch should never block UI.
      })
      .finally(() => {
        clearTimeout(timeout);
      });

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return null;
}
