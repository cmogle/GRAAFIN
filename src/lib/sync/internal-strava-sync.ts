import { createAdminClient } from "@/lib/supabase/admin";
import { getPrimaryAthleteId } from "@/lib/athlete";

type InternalSyncOptions = {
  source: string;
  requestedBy?: string | null;
  force?: boolean;
};

type InternalSyncResult = {
  ok: boolean;
  message: string;
  syncedCount: number;
  athleteId: number | null;
  latestActivityAt: string | null;
};

type AthleteSyncConfig = {
  slug: string;
  athleteIdHint: number | null;
  clientId: string;
  clientSecret: string;
  refreshToken: string | null;
  accessToken: string | null;
};

type AthleteSyncResult = {
  ok: boolean;
  slug: string;
  athleteId: number | null;
  syncedCount: number;
  latestActivityAt: string | null;
  message: string;
};

type StravaTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number | null;
};

type StravaActivity = {
  id: number;
  athlete?: { id?: number } | null;
  name?: string;
  type?: string;
  sport_type?: string;
  start_date?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  average_speed?: number;
  average_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  max_speed?: number;
  max_heartrate?: number;
  calories?: number;
  kilojoules?: number;
  suffer_score?: number;
  kudos_count?: number;
  pr_count?: number;
  total_elevation_gain?: number;
  trainer?: boolean;
  commute?: boolean;
  manual?: boolean;
  gear_id?: string;
  description?: string;
  device_name?: string;
  start_latlng?: number[] | null;
  end_latlng?: number[] | null;
  [key: string]: unknown;
};

type StravaAthlete = {
  id: number;
  firstname?: string;
  lastname?: string;
};

const STRAVA_BASE_URL = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 200;
const MAX_PAGES = 25;
const OVERLAP_SECONDS = 6 * 60 * 60;
const SYNC_SOURCE = "graafin-internal-sync";

function envValue(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asInteger(value: unknown): number | null {
  const n = asNumber(value);
  return n == null ? null : Math.trunc(n);
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function parseEpoch(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string") {
    const asInt = Number(value);
    if (Number.isFinite(asInt)) return Math.trunc(asInt);
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return Math.trunc(asDate / 1000);
  }
  return null;
}

function safeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toQueryString(params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return search.toString();
}

function maybeAddConfig(
  list: AthleteSyncConfig[],
  candidate: AthleteSyncConfig | null,
  dedupeKeys: Set<string>,
) {
  if (!candidate) return;
  const dedupeKey = [
    candidate.clientId,
    candidate.athleteIdHint ?? "unknown",
    candidate.refreshToken ?? "no-refresh-token",
    candidate.accessToken ?? "no-access-token",
  ].join("::");
  if (dedupeKeys.has(dedupeKey)) return;
  dedupeKeys.add(dedupeKey);
  list.push(candidate);
}

function envAthleteConfig(params: {
  slug: string;
  athleteIdKeys: string[];
  clientIdKeys: string[];
  clientSecretKeys: string[];
  refreshTokenKeys: string[];
  accessTokenKeys: string[];
}): AthleteSyncConfig | null {
  const clientId = envValue(...params.clientIdKeys);
  const clientSecret = envValue(...params.clientSecretKeys);
  const refreshToken = envValue(...params.refreshTokenKeys);
  const accessToken = envValue(...params.accessTokenKeys);

  if (!clientId || !clientSecret || (!refreshToken && !accessToken)) {
    return null;
  }

  return {
    slug: params.slug,
    athleteIdHint: asInteger(envValue(...params.athleteIdKeys)),
    clientId,
    clientSecret,
    refreshToken,
    accessToken,
  };
}

function parseAthleteJsonConfig(raw: string): AthleteSyncConfig[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: AthleteSyncConfig[] = [];
    for (const row of parsed) {
      const obj = safeObject(row);
      const slug = typeof obj.slug === "string" && obj.slug.trim() ? obj.slug.trim() : "athlete";
      const clientId = typeof obj.clientId === "string" ? obj.clientId.trim() : "";
      const clientSecret = typeof obj.clientSecret === "string" ? obj.clientSecret.trim() : "";
      const refreshToken = typeof obj.refreshToken === "string" ? obj.refreshToken.trim() : null;
      const accessToken = typeof obj.accessToken === "string" ? obj.accessToken.trim() : null;
      const athleteIdHint = asInteger(obj.athleteId);

      if (!clientId || !clientSecret || (!refreshToken && !accessToken)) continue;
      out.push({
        slug,
        athleteIdHint,
        clientId,
        clientSecret,
        refreshToken,
        accessToken,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function collectAthleteConfigs(): AthleteSyncConfig[] {
  const configs: AthleteSyncConfig[] = [];
  const dedupeKeys = new Set<string>();

  const jsonConfig = envValue("STRAVA_ATHLETES_JSON");
  if (jsonConfig) {
    for (const cfg of parseAthleteJsonConfig(jsonConfig)) {
      maybeAddConfig(configs, cfg, dedupeKeys);
    }
  }

  maybeAddConfig(
    configs,
    envAthleteConfig({
      slug: "fionnuala",
      athleteIdKeys: ["FIONNUALA_STRAVA_ATHLETE_ID"],
      clientIdKeys: ["FIONNUALA_STRAVA_CLIENT_ID"],
      clientSecretKeys: ["FIONNUALA_STRAVA_CLIENT_SECRET"],
      refreshTokenKeys: ["FIONNUALA_STRAVA_REFRESH_TOKEN"],
      accessTokenKeys: ["FIONNUALA_STRAVA_ACCESS_TOKEN"],
    }),
    dedupeKeys,
  );

  maybeAddConfig(
    configs,
    envAthleteConfig({
      slug: "conor",
      athleteIdKeys: ["CONOR_STRAVA_ATHLETE_ID"],
      clientIdKeys: ["CONOR_STRAVA_CLIENT_ID"],
      clientSecretKeys: ["CONOR_STRAVA_CLIENT_SECRET"],
      refreshTokenKeys: ["CONOR_STRAVA_REFRESH_TOKEN"],
      accessTokenKeys: ["CONOR_STRAVA_ACCESS_TOKEN"],
    }),
    dedupeKeys,
  );

  maybeAddConfig(
    configs,
    envAthleteConfig({
      slug: "primary",
      athleteIdKeys: ["STRAVA_ATHLETE_ID", "STRAVA_TARGET_ATHLETE_ID"],
      clientIdKeys: ["STRAVA_CLIENT_ID"],
      clientSecretKeys: ["STRAVA_CLIENT_SECRET"],
      refreshTokenKeys: ["STRAVA_REFRESH_TOKEN"],
      accessTokenKeys: ["STRAVA_ACCESS_TOKEN"],
    }),
    dedupeKeys,
  );

  return configs;
}

async function refreshTokens(clientId: string, clientSecret: string, refreshToken: string): Promise<StravaTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const preview = (await response.text().catch(() => "")).slice(0, 280);
    throw new Error(`Strava token refresh failed (${response.status})${preview ? `: ${preview}` : ""}`);
  }

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const refreshedAccess = typeof payload.access_token === "string" ? payload.access_token : "";
  const refreshedRefresh = typeof payload.refresh_token === "string" ? payload.refresh_token : refreshToken;
  const refreshedExpiresAt = asInteger(payload.expires_at);

  if (!refreshedAccess) {
    throw new Error("Strava token refresh returned no access token.");
  }

  return {
    accessToken: refreshedAccess,
    refreshToken: refreshedRefresh || null,
    expiresAt: refreshedExpiresAt,
  };
}

async function stravaGetJson<T>(path: string, accessToken: string, params?: Record<string, string>): Promise<T> {
  const query = params ? `?${toQueryString(params)}` : "";
  const response = await fetch(`${STRAVA_BASE_URL}${path}${query}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const preview = (await response.text().catch(() => "")).slice(0, 280);
    throw new Error(`Strava API ${path} failed (${response.status})${preview ? `: ${preview}` : ""}`);
  }

  return (await response.json()) as T;
}

async function readPersistedTokens(athleteId: number | null): Promise<StravaTokens | null> {
  const admin = createAdminClient();
  let query = admin
    .from("strava_sync_state")
    .select("athlete_id,metadata,updated_at")
    .eq("key", "auth_tokens")
    .order("updated_at", { ascending: false })
    .limit(5);

  if (athleteId != null) {
    query = query.eq("athlete_id", athleteId);
  }

  const { data, error } = await query;
  if (error || !data?.length) return null;

  const row = data[0] as Record<string, unknown>;
  const metadata = safeObject(row.metadata);
  const accessToken = typeof metadata.access_token === "string" ? metadata.access_token : "";
  const refreshToken = typeof metadata.refresh_token === "string" ? metadata.refresh_token : null;
  const expiresAt = parseEpoch(metadata.expires_at);

  if (!accessToken && !refreshToken) return null;
  return { accessToken, refreshToken, expiresAt };
}

async function persistTokens(athleteId: number, tokens: StravaTokens): Promise<void> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const row = {
    source: SYNC_SOURCE,
    athlete_id: athleteId,
    key: "auth_tokens",
    value: tokens.expiresAt != null ? String(tokens.expiresAt) : null,
    status: "token_refreshed",
    synced_at: nowIso,
    last_success_at: nowIso,
    metadata: {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expires_at: tokens.expiresAt,
    },
    updated_at: nowIso,
  };

  const { error } = await admin
    .from("strava_sync_state")
    .upsert(row, { onConflict: "athlete_id,key" });
  if (error) {
    throw new Error(`Unable to persist Strava auth tokens: ${error.message}`);
  }
}

async function readLastCursor(athleteId: number): Promise<number | null> {
  const admin = createAdminClient();

  const [{ data: cursorRow }, { data: latestActivity }] = await Promise.all([
    admin
      .from("strava_sync_state")
      .select("value")
      .eq("athlete_id", athleteId)
      .eq("key", "last_activity_epoch")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("strava_activities")
      .select("start_date")
      .eq("athlete_id", athleteId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const cursorEpoch = parseEpoch((cursorRow as Record<string, unknown> | null)?.value ?? null);
  const latestEpoch = parseEpoch((latestActivity as Record<string, unknown> | null)?.start_date ?? null);

  const candidates = [cursorEpoch, latestEpoch].filter((v): v is number => v != null);
  if (!candidates.length) return null;
  return Math.max(...candidates);
}

async function writeSyncState(params: {
  athleteId: number;
  key: string;
  value: string | null;
  status: string;
  source: string;
  metadata?: Record<string, unknown>;
  startedAt?: string | null;
  finishedAt?: string | null;
  successAt?: string | null;
}): Promise<void> {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const row = {
    source: params.source,
    athlete_id: params.athleteId,
    key: params.key,
    value: params.value,
    status: params.status,
    started_at: params.startedAt ?? null,
    finished_at: params.finishedAt ?? null,
    last_success_at: params.successAt ?? null,
    last_synced_at: params.successAt ?? null,
    synced_at: params.successAt ?? null,
    metadata: params.metadata ?? {},
    updated_at: nowIso,
  };

  const { error } = await admin
    .from("strava_sync_state")
    .upsert(row, { onConflict: "athlete_id,key" });
  if (error) {
    throw new Error(`Unable to update sync state for key "${params.key}": ${error.message}`);
  }
}

async function fetchActivities(params: {
  accessToken: string;
  afterEpoch: number | null;
}): Promise<StravaActivity[]> {
  const all = new Map<string, StravaActivity>();
  let beforeEpoch: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query: Record<string, string> = {
      per_page: String(PAGE_SIZE),
    };
    if (params.afterEpoch != null) query.after = String(params.afterEpoch);
    if (beforeEpoch != null) query.before = String(beforeEpoch);

    const batch = await stravaGetJson<StravaActivity[]>("/athlete/activities", params.accessToken, query);
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const activity of batch) {
      if (typeof activity.id === "number") {
        all.set(String(activity.id), activity);
      }
    }

    if (batch.length < PAGE_SIZE) break;
    const oldest = batch[batch.length - 1];
    const oldestEpoch = parseEpoch(oldest.start_date);
    if (oldestEpoch == null) break;
    beforeEpoch = oldestEpoch;
    if (params.afterEpoch != null && beforeEpoch <= params.afterEpoch) break;
  }

  return Array.from(all.values());
}

function toRow(activity: StravaActivity, athleteId: number, syncedAt: string): Record<string, unknown> {
  return {
    id: String(activity.id),
    strava_id: activity.id,
    athlete_id: athleteId,
    name: typeof activity.name === "string" ? activity.name : "Activity",
    type: typeof activity.type === "string" ? activity.type : "Run",
    sport_type: typeof activity.sport_type === "string" ? activity.sport_type : null,
    start_date: typeof activity.start_date === "string" ? activity.start_date : null,
    distance_m: asNumber(activity.distance),
    moving_time_s: asInteger(activity.moving_time),
    elapsed_time_s: asInteger(activity.elapsed_time),
    average_speed: asNumber(activity.average_speed),
    average_heartrate: asNumber(activity.average_heartrate),
    average_cadence: asNumber(activity.average_cadence),
    average_watts: asNumber(activity.average_watts),
    max_watts: asNumber(activity.max_watts),
    max_speed: asNumber(activity.max_speed),
    max_heartrate: asNumber(activity.max_heartrate),
    calories: asNumber(activity.calories),
    kilojoules: asNumber(activity.kilojoules),
    suffer_score: asNumber(activity.suffer_score),
    kudos_count: asInteger(activity.kudos_count),
    pr_count: asInteger(activity.pr_count),
    total_elevation: asNumber(activity.total_elevation_gain),
    trainer: asBoolean(activity.trainer),
    commute: asBoolean(activity.commute),
    manual: asBoolean(activity.manual),
    gear_id: typeof activity.gear_id === "string" ? activity.gear_id : null,
    description: typeof activity.description === "string" ? activity.description : null,
    device_name: typeof activity.device_name === "string" ? activity.device_name : null,
    start_latlng: Array.isArray(activity.start_latlng) ? activity.start_latlng : null,
    end_latlng: Array.isArray(activity.end_latlng) ? activity.end_latlng : null,
    has_streams: null,
    metadata: {
      source: SYNC_SOURCE,
    },
    raw_json: activity,
    synced_at: syncedAt,
  };
}

async function upsertActivities(athleteId: number, activities: StravaActivity[]): Promise<number> {
  if (!activities.length) return 0;
  const admin = createAdminClient();
  const syncedAt = new Date().toISOString();
  const rows = activities.map((activity) => toRow(activity, athleteId, syncedAt));

  for (let i = 0; i < rows.length; i += PAGE_SIZE) {
    const chunk = rows.slice(i, i + PAGE_SIZE);
    const { error } = await admin.from("strava_activities").upsert(chunk, { onConflict: "id" });
    if (error) {
      throw new Error(`Unable to upsert Strava activities: ${error.message}`);
    }
  }
  return rows.length;
}

function lastActivityDate(activities: StravaActivity[]): string | null {
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestIso: string | null = null;
  for (const activity of activities) {
    if (!activity.start_date) continue;
    const ms = Date.parse(activity.start_date);
    if (!Number.isFinite(ms) || ms <= latestMs) continue;
    latestMs = ms;
    latestIso = activity.start_date;
  }
  return latestIso;
}

async function syncOneAthlete(config: AthleteSyncConfig, options: InternalSyncOptions): Promise<AthleteSyncResult> {
  let athleteId = config.athleteIdHint;
  const startedAt = new Date().toISOString();

  try {
    const persisted = await readPersistedTokens(config.athleteIdHint);
    const refreshToken = persisted?.refreshToken ?? config.refreshToken;
    const accessToken = persisted?.accessToken || config.accessToken || "";

    let tokens: StravaTokens;
    if (refreshToken) {
      tokens = await refreshTokens(config.clientId, config.clientSecret, refreshToken);
    } else if (accessToken) {
      tokens = { accessToken, refreshToken: null, expiresAt: null };
    } else {
      throw new Error("No usable Strava token found.");
    }

    const athlete = await stravaGetJson<StravaAthlete>("/athlete", tokens.accessToken);
    athleteId = asInteger(athlete.id);
    if (athleteId == null) {
      throw new Error("Unable to resolve athlete id from Strava API.");
    }

    await persistTokens(athleteId, tokens);
    await writeSyncState({
      athleteId,
      key: "sync_status",
      value: "running",
      status: "running",
      source: SYNC_SOURCE,
      metadata: {
        slug: config.slug,
        source: options.source,
        requestedBy: options.requestedBy ?? null,
        force: options.force === true,
      },
      startedAt,
    });

    const lastCursor = options.force ? null : await readLastCursor(athleteId);
    const afterEpoch = lastCursor == null ? null : Math.max(lastCursor - OVERLAP_SECONDS, 0);
    const activities = await fetchActivities({
      accessToken: tokens.accessToken,
      afterEpoch,
    });

    const syncedCount = await upsertActivities(athleteId, activities);
    const latestActivityAt = lastActivityDate(activities);
    const successAt = new Date().toISOString();
    const lastEpoch = latestActivityAt ? parseEpoch(latestActivityAt) : lastCursor;

    if (lastEpoch != null) {
      await writeSyncState({
        athleteId,
        key: "last_activity_epoch",
        value: String(lastEpoch),
        status: "success",
        source: SYNC_SOURCE,
        metadata: {
          slug: config.slug,
          source: options.source,
          syncedCount,
        },
        startedAt,
        finishedAt: successAt,
        successAt,
      });
    }

    await writeSyncState({
      athleteId,
      key: "last_sync_at",
      value: successAt,
      status: "success",
      source: SYNC_SOURCE,
      metadata: {
        slug: config.slug,
        source: options.source,
        syncedCount,
      },
      startedAt,
      finishedAt: successAt,
      successAt,
    });

    await writeSyncState({
      athleteId,
      key: "sync_status",
      value: "success",
      status: "success",
      source: SYNC_SOURCE,
      metadata: {
        slug: config.slug,
        source: options.source,
        syncedCount,
      },
      startedAt,
      finishedAt: successAt,
      successAt,
    });

    return {
      ok: true,
      slug: config.slug,
      athleteId,
      syncedCount,
      latestActivityAt,
      message: `Synced ${syncedCount} activities.`,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown sync error.";

    if (athleteId != null) {
      try {
        await writeSyncState({
          athleteId,
          key: "sync_status",
          value: "failed",
          status: "failed",
          source: SYNC_SOURCE,
          metadata: {
            slug: config.slug,
            source: options.source,
            requestedBy: options.requestedBy ?? null,
            force: options.force === true,
            error: reason,
          },
          startedAt,
          finishedAt: new Date().toISOString(),
        });
      } catch {
        // no-op
      }
    }

    return {
      ok: false,
      slug: config.slug,
      athleteId,
      syncedCount: 0,
      latestActivityAt: null,
      message: reason,
    };
  }
}

export async function runInternalStravaSync(options: InternalSyncOptions): Promise<InternalSyncResult> {
  const configs = collectAthleteConfigs();
  if (!configs.length) {
    return {
      ok: false,
      message:
        "Internal Strava sync is not configured. Set athlete credentials via STRAVA_* and/or FIONNUALA_STRAVA_* and CONOR_STRAVA_* vars.",
      syncedCount: 0,
      athleteId: getPrimaryAthleteId(),
      latestActivityAt: null,
    };
  }

  const results: AthleteSyncResult[] = [];
  for (const config of configs) {
    const result = await syncOneAthlete(config, options);
    results.push(result);
  }

  const totalSynced = results.reduce((sum, item) => sum + item.syncedCount, 0);
  const failures = results.filter((item) => !item.ok);
  const primaryAthleteId = getPrimaryAthleteId();
  const primaryResult =
    results.find((item) => item.athleteId != null && item.athleteId === primaryAthleteId) ??
    results[0] ??
    null;

  if (failures.length === results.length) {
    return {
      ok: false,
      message: `Internal Strava sync failed for all athletes: ${failures.map((f) => `${f.slug}: ${f.message}`).join(" | ")}`,
      syncedCount: 0,
      athleteId: primaryResult?.athleteId ?? primaryAthleteId,
      latestActivityAt: primaryResult?.latestActivityAt ?? null,
    };
  }

  const statusText = results
    .map((item) => `${item.slug}(${item.athleteId ?? "?"}): ${item.ok ? `+${item.syncedCount}` : "failed"}`)
    .join(", ");

  return {
    ok: failures.length === 0,
    message:
      failures.length === 0
        ? `Internal Strava sync complete. ${statusText}`
        : `Internal Strava sync partially complete. ${statusText}`,
    syncedCount: totalSynced,
    athleteId: primaryResult?.athleteId ?? primaryAthleteId,
    latestActivityAt: primaryResult?.latestActivityAt ?? null,
  };
}

export function hasInternalSyncConfig(): boolean {
  return collectAthleteConfigs().length > 0;
}
