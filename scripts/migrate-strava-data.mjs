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
}) {
  const response = await restFetch({
    baseUrl,
    apiKey,
    path: table,
    query: `select=*&order=${encodeURIComponent(orderExpr)}`,
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
}) {
  let workingOrder = orderCandidates[0];
  let validated = false;
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
      });
      workingOrder = candidate;
      validated = true;
      break;
    } catch {
      // try next order expression
    }
  }

  if (!validated) {
    throw new Error(`Unable to query ${table}; order clauses failed.`);
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
}) {
  const response = await restFetch({
    method: "GET",
    baseUrl,
    apiKey,
    path: table,
    query: "select=id",
    headers: {
      Range: "0-0",
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

  console.log(`[info] source project: ${projectRefFromUrl(sourceUrl)}`);
  console.log(`[info] target project: ${projectRefFromUrl(targetUrl)}`);
  console.log(`[info] batch size: ${batchSize}`);
  if (dryRun) console.log("[info] dry run enabled (no writes)");

  const activities = await fetchAllRows({
    baseUrl: sourceUrl,
    apiKey: sourceKey,
    table: "strava_activities",
    batchSize,
    orderCandidates: ["start_date.asc,id.asc", "id.asc", "created_at.asc"],
  });
  console.log(`[info] fetched strava_activities: ${activities.length}`);

  if (!dryRun && activities.length) {
    for (let i = 0; i < activities.length; i += batchSize) {
      const chunk = activities.slice(i, i + batchSize);
      await upsertRows({
        baseUrl: targetUrl,
        apiKey: targetKey,
        table: "strava_activities",
        rows: chunk,
        onConflict: "id",
      });
      console.log(`[info] upserted strava_activities ${i + 1}-${i + chunk.length}`);
    }
  }

  const syncStateRows = await fetchAllRows({
    baseUrl: sourceUrl,
    apiKey: sourceKey,
    table: "strava_sync_state",
    batchSize: Math.min(batchSize, 250),
    orderCandidates: ["updated_at.asc", "last_success_at.asc", "created_at.asc", "id.asc"],
  });
  console.log(`[info] fetched strava_sync_state: ${syncStateRows.length}`);

  if (!dryRun && syncStateRows.length) {
    const allHaveId = syncStateRows.every((row) => Object.prototype.hasOwnProperty.call(row, "id") && row.id != null);
    await upsertRows({
      baseUrl: targetUrl,
      apiKey: targetKey,
      table: "strava_sync_state",
      rows: syncStateRows,
      onConflict: allHaveId ? "id" : "",
    });
    console.log(`[info] migrated strava_sync_state rows: ${syncStateRows.length}`);
  }

  const [sourceActivityCount, targetActivityCount, sourceSyncCount, targetSyncCount] = await Promise.all([
    countRows({ baseUrl: sourceUrl, apiKey: sourceKey, table: "strava_activities" }),
    countRows({ baseUrl: targetUrl, apiKey: targetKey, table: "strava_activities" }),
    countRows({ baseUrl: sourceUrl, apiKey: sourceKey, table: "strava_sync_state" }),
    countRows({ baseUrl: targetUrl, apiKey: targetKey, table: "strava_sync_state" }),
  ]);

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
