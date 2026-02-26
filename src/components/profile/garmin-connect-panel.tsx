"use client";

import { useEffect, useState } from "react";

type GarminStatus = {
  connected: boolean;
  status: "connected" | "disconnected" | "pending" | "error" | string;
  provider: string;
  lastSyncedAt: string | null;
  metadata: Record<string, unknown> | null;
};

function statusLabel(status: GarminStatus["status"]) {
  if (status === "connected") return "Connected";
  if (status === "pending") return "Pending import";
  if (status === "error") return "Error";
  return "Disconnected";
}

export function GarminConnectPanel() {
  const [garminStatus, setGarminStatus] = useState<GarminStatus | null>(null);
  const [garminFile, setGarminFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const statusResponse = await fetch("/api/wellness/garmin/status");
      if (!statusResponse.ok) {
        const data = await statusResponse.json().catch(() => ({}));
        throw new Error(String(data?.error ?? "Failed to load Garmin status"));
      }
      const statusData = (await statusResponse.json()) as GarminStatus;
      setGarminStatus(statusData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Garmin status");
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const connectGarmin = async (action: "connect" | "disconnect") => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/wellness/garmin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data?.error ?? "Failed Garmin connection update"));
      setMessage(String(data?.message ?? "Garmin status updated."));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed Garmin connection update");
    } finally {
      setSaving(false);
    }
  };

  const syncGarmin = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/wellness/garmin/sync", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data?.error ?? data?.message ?? "Failed Garmin manual sync"));
      const counts = data?.counts
        ? `sleep ${data.counts.sleep ?? 0}, daily ${data.counts.dailyMetrics ?? 0}, raw ${data.counts.raw ?? 0}`
        : "counts unavailable";
      setMessage(`${String(data?.message ?? "Garmin manual sync completed.")} (${counts})`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed Garmin manual sync");
    } finally {
      setSaving(false);
    }
  };

  const importGarminSleep = async () => {
    if (!garminFile) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", garminFile);
      const response = await fetch("/api/wellness/garmin/import", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(String(data?.error ?? "Failed Garmin import"));
      setMessage(
        `Garmin import complete: sleep ${data.importedSleepRecords ?? 0}, daily metrics ${data.importedDailyMetricRecords ?? 0}.`,
      );
      setGarminFile(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed Garmin import");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="garmin-connect" className="space-y-4">
      {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {message ? <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

      <div className="rounded-2xl border border-slate-200 p-3">
        <p className="mb-1 text-sm font-medium text-slate-800">Garmin export workflow</p>
        <p className="mb-2 text-xs text-slate-500">
          Enable Garmin export mode, upload an export file, then run manual sync to refresh coaching context.
          Garmin OAuth login is not available in this version.
        </p>
        <p className="mb-2 text-xs text-slate-600">
          Status: <strong>{statusLabel(garminStatus?.status ?? "disconnected")}</strong>
          {" · "}
          Last sync: <strong>{garminStatus?.lastSyncedAt ? new Date(garminStatus.lastSyncedAt).toLocaleString() : "never"}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void connectGarmin("connect")}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Enable Garmin export
          </button>
          <button
            type="button"
            disabled={saving || !garminStatus?.connected}
            onClick={() => void syncGarmin()}
            className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Manual sync
          </button>
          <button
            type="button"
            disabled={saving || garminStatus?.status === "disconnected"}
            onClick={() => void connectGarmin("disconnect")}
            className="rounded-xl border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            Disconnect
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="mb-1 text-sm font-medium text-slate-800">How to export from Garmin Connect</p>
        <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-700">
          <li>
            Open{" "}
            <a
              href="https://www.garmin.com/account/datamanagement/"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-slate-900 underline"
            >
              Garmin Account Management
            </a>{" "}
            and sign in.
          </li>
          <li>Choose <strong>Export Your Data</strong> and request a data export.</li>
          <li>Wait for Garmin&apos;s export email (often up to 48 hours).</li>
          <li>Download the zip file from Garmin and unzip it on your computer.</li>
          <li>Find JSON/CSV files that contain sleep/wellness metrics.</li>
          <li>Upload one of those files below, then run <strong>Manual sync</strong>.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">
          Note: activity FIT/GPX route exports are different from wellness exports and may not include sleep context.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 p-3">
        <p className="mb-1 text-sm font-medium text-slate-800">Garmin Connect export import</p>
        <p className="mb-2 text-xs text-slate-500">
          Upload Garmin export JSON/CSV containing wellness records for this account.
        </p>
        <input
          type="file"
          accept=".json,.csv,text/csv,application/json"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setGarminFile(next);
          }}
          className="block w-full text-xs text-slate-600"
        />
        <button
          type="button"
          disabled={saving || !garminFile}
          onClick={() => void importGarminSleep()}
          className="mt-2 rounded-xl border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          Import Garmin file
        </button>
      </div>
    </div>
  );
}
