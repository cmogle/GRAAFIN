#!/usr/bin/env node

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value.trim();
}

function parseBool(name, fallback = false) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

function isMissingResourceError(error) {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("(404)") || text.includes("relation") || text.toLowerCase().includes("does not exist");
}

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function projectRefFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.split(".")[0] ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function readJson(response) {
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function restFetch({
  method = "GET",
  baseUrl,
  apiKey,
  path,
  query = "",
  headers = {},
  body,
}) {
  const url = `${baseUrl}/rest/v1/${path}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const payload = await readJson(response);
    const details = payload ? JSON.stringify(payload).slice(0, 500) : "";
    throw new Error(`${method} ${path} failed (${response.status}). ${details}`);
  }

  return response;
}

async function fetchBatch({
  baseUrl,
  apiKey,
  table,
  start,
  end,
  orderExpr,
  filters = [],
}) {
  const filterQuery = filters.length ? `&${filters.join("&")}` : "";
  const response = await restFetch({
    baseUrl,
    apiKey,
    path: table,
    query: `select=*&order=${encodeURIComponent(orderExpr)}${filterQuery}`,
    headers: {
      Range: `${start}-${end}`,
      Prefer: "count=exact",
    },
  });
  const rows = (await response.json()) ?? [];
  return Array.isArray(rows) ? rows : [];
}

async function fetchAllRows({
  baseUrl,
  apiKey,
  table,
  batchSize,
  orderCandidates,
  filters = [],
}) {
  let workingOrder = orderCandidates[0];
  let validated = false;
  let lastValidationError = null;
  const rows = [];

  for (const candidate of orderCandidates) {
    try {
      await fetchBatch({
        baseUrl,
        apiKey,
        table,
        start: 0,
        end: 0,
        orderExpr: candidate,
        filters,
      });
      workingOrder = candidate;
      validated = true;
      break;
    } catch (error) {
      lastValidationError = error;
    }
  }

  if (!validated) {
    const detail =
      lastValidationError instanceof Error ? ` ${lastValidationError.message}` : "";
    throw new Error(`Unable to query ${table}; order clauses failed.${detail}`);
  }

  let start = 0;
  while (true) {
    const end = start + batchSize - 1;
    const batch = await fetchBatch({
      baseUrl,
      apiKey,
      table,
      start,
      end,
      orderExpr: workingOrder,
      filters,
    });
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < batchSize) break;
    start += batchSize;
  }

  return rows;
}

async function upsertRows({
  baseUrl,
  apiKey,
  table,
  rows,
  onConflict,
}) {
  if (!rows.length) return;
  await restFetch({
    method: "POST",
    baseUrl,
    apiKey,
    path: table,
    query: onConflict ? `on_conflict=${encodeURIComponent(onConflict)}` : "",
    headers: {
      Prefer: onConflict ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
    },
    body: rows,
  });
}

async function countRows({
  baseUrl,
  apiKey,
  table,
  filters = [],
}) {
  const filterQuery = filters.length ? `&${filters.join("&")}` : "";
  const response = await restFetch({
    method: "HEAD",
    baseUrl,
    apiKey,
    path: table,
    query: `select=*${filterQuery}`,
    headers: {
      Prefer: "count=exact",
    },
  });

  const contentRange = response.headers.get("content-range");
  if (!contentRange || !contentRange.includes("/")) return null;
  const count = Number(contentRange.split("/")[1]);
  return Number.isFinite(count) ? count : null;
}

async function main() {
  const sourceUrl = normalizeBaseUrl(requireEnv("SOURCE_SUPABASE_URL"));
  const sourceKey =
    process.env.SOURCE_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SOURCE_SUPABASE_ANON_KEY?.trim();
  if (!sourceKey) {
    throw new Error("Missing SOURCE_SUPABASE_SERVICE_ROLE_KEY (or SOURCE_SUPABASE_ANON_KEY fallback).");
  }

  const targetUrl = normalizeBaseUrl(requireEnv("TARGET_SUPABASE_URL"));
  const targetKey = requireEnv("TARGET_SUPABASE_SERVICE_ROLE_KEY");
  const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);
  const dryRun = parseBool("MIGRATION_DRY_RUN", false);
  const sourceActivityTable = process.env.SOURCE_ACTIVITY_TABLE?.trim() || "strava_activities";
  const sourceSyncStateTable = process.env.SOURCE_SYNC_STATE_TABLE?.trim() || "strava_sync_state";
  const targetActivityTable = process.env.TARGET_ACTIVITY_TABLE?.trim() || "strava_activities";
  const targetSyncStateTable = process.env.TARGET_SYNC_STATE_TABLE?.trim() || "strava_sync_state";
  const skipSyncState = parseBool("MIGRATION_SKIP_SYNC_STATE", false);
  const sourceAthleteId = (process.env.SOURCE_ATHLETE_ID || process.env.STRAVA_TARGET_ATHLETE_ID || "").trim();
  const activityFilters = sourceAthleteId ? [`athlete_id=eq.${encodeURIComponent(sourceAthleteId)}`] : [];
  const syncStateFilters = sourceAthleteId ? [`athlete_id=eq.${encodeURIComponent(sourceAthleteId)}`] : [];

  console.log(`[info] source project: ${projectRefFromUrl(sourceUrl)}`);
  console.log(`[info] target project: ${projectRefFromUrl(targetUrl)}`);
  console.log(`[info] batch size: ${batchSize}`);
  console.log(`[info] source activity table: ${sourceActivityTable}`);
  console.log(`[info] source sync-state table: ${sourceSyncStateTable}`);
  console.log(`[info] target activity table: ${targetActivityTable}`);
  console.log(`[info] target sync-state table: ${targetSyncStateTable}`);
  console.log(`[info] skip sync-state table: ${skipSyncState}`);
  if (sourceAthleteId) console.log(`[info] source athlete filter: ${sourceAthleteId}`);
  if (dryRun) console.log("[info] dry run enabled (no writes)");

  const activities = await fetchAllRows({
    baseUrl: sourceUrl,
    apiKey: sourceKey,
    table: sourceActivityTable,
    batchSize,
    orderCandidates: ["start_date.asc,id.asc", "id.asc", "created_at.asc"],
    filters: activityFilters,
  });
  console.log(`[info] fetched ${sourceActivityTable}: ${activities.length}`);

  if (!dryRun && activities.length) {
    for (let i = 0; i < activities.length; i += batchSize) {
      const chunk = activities.slice(i, i + batchSize);
      await upsertRows({
        baseUrl: targetUrl,
        apiKey: targetKey,
        table: targetActivityTable,
        rows: chunk,
        onConflict: "id",
      });
      console.log(`[info] upserted ${targetActivityTable} ${i + 1}-${i + chunk.length}`);
    }
  }

  let syncStateRows = [];
  let sourceSyncCount = null;
  let targetSyncCount = null;

  if (!skipSyncState) {
    try {
      syncStateRows = await fetchAllRows({
        baseUrl: sourceUrl,
        apiKey: sourceKey,
        table: sourceSyncStateTable,
        batchSize: Math.min(batchSize, 250),
        orderCandidates: ["updated_at.asc", "last_success_at.asc", "created_at.asc", "id.asc"],
        filters: syncStateFilters,
      });
      console.log(`[info] fetched ${sourceSyncStateTable}: ${syncStateRows.length}`);
    } catch (error) {
      if (isMissingResourceError(error)) {
        console.log(`[warn] source sync-state table not found (${sourceSyncStateTable}); skipping.`);
      } else {
        throw error;
      }
    }

    if (!dryRun && syncStateRows.length) {
      const syncStateOnConflict = process.env.TARGET_SYNC_STATE_ON_CONFLICT?.trim() || "";
      try {
        await upsertRows({
          baseUrl: targetUrl,
          apiKey: targetKey,
          table: targetSyncStateTable,
          rows: syncStateRows,
          onConflict: syncStateOnConflict,
        });
        console.log(`[info] migrated ${targetSyncStateTable} rows: ${syncStateRows.length}`);
      } catch (error) {
        if (isMissingResourceError(error)) {
          console.log(`[warn] target sync-state table not found (${targetSyncStateTable}); skipping write.`);
        } else {
          throw error;
        }
      }
    }
  }

  const sourceActivityCount = await countRows({
    baseUrl: sourceUrl,
    apiKey: sourceKey,
    table: sourceActivityTable,
    filters: activityFilters,
  });
  const targetActivityCount = await countRows({ baseUrl: targetUrl, apiKey: targetKey, table: targetActivityTable });

  if (!skipSyncState) {
    try {
      sourceSyncCount = await countRows({
        baseUrl: sourceUrl,
        apiKey: sourceKey,
        table: sourceSyncStateTable,
        filters: syncStateFilters,
      });
    } catch (error) {
      if (!isMissingResourceError(error)) throw error;
    }
    try {
      targetSyncCount = await countRows({ baseUrl: targetUrl, apiKey: targetKey, table: targetSyncStateTable });
    } catch (error) {
      if (!isMissingResourceError(error)) throw error;
    }
  }

  console.log("[done] migration summary");
  console.log(
    JSON.stringify(
      {
        dryRun,
        sourceProjectRef: projectRefFromUrl(sourceUrl),
        targetProjectRef: projectRefFromUrl(targetUrl),
        sourceActivityCount,
        targetActivityCount,
        sourceSyncStateCount: sourceSyncCount,
        targetSyncStateCount: targetSyncCount,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
