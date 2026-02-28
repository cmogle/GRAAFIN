/**
 * CLI import script for scraped Garmin Connect daily summary JSON.
 *
 * Usage:
 *   npx tsx scripts/import-garmin-scrape.ts <json-file> --user-id <uuid> [--dry-run]
 *
 * Environment variables (from .env.local):
 *   Option A (Supabase client):
 *     NEXT_PUBLIC_SUPABASE_URL    – Supabase project URL
 *     SUPABASE_SERVICE_ROLE_KEY   – Service-role key (bypasses RLS)
 *
 *   Option B (Management API – used when legacy keys are disabled):
 *     SUPABASE_ACCESS_TOKEN       – Personal access token (from `supabase login`)
 *     SUPABASE_PROJECT_REF        – Project reference ID
 *
 * The script is idempotent — re-running upserts on existing unique constraints.
 */

import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScrapedRecord = {
  date: string;
  day: string | null;
  hr7d: number | null;
  hr: number | null;
  hrHi: number | null;
  bb: number | null;
  bbC: number | null;
  bbD: number | null;
  str: number | null;
  strR: number | null;
  strL: number | null;
  strM: number | null;
  strH: number | null;
  imW: number | null;
  imT: number | null;
  stp: number | null;
  dist: number | null;
  stpA: number | null;
  flU: number | null;
  cal: number | null;
  calR: number | null;
  calA: number | null;
  slS: number | null;
  slQ: string | null;
  slM: number | null;
  slN: number | null;
  hrv: number | null;
  hrvS: string | null;
  hrvO: number | null;
  hrv5: number | null;
  sp: number | null;
  spS: number | null;
  rpA: number | null;
  rpS: number | null;
  rpL: number | null;
  rpH: number | null;
  tr: number | null;
  trS: string | null;
};

type ScrapeFile = {
  scrapeInfo: {
    user: string;
    garminDisplayName: string;
    scrapedAt: string;
    lastSyncDate: string;
    dateRange: string;
    totalDays: number;
    source: string;
    fieldKey: Record<string, string>;
  };
  dailySummaries: ScrapedRecord[];
};

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function getFlag(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[error] missing env var: ${name}`);
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Data quality helpers
// ---------------------------------------------------------------------------

function sanitizeFloors(value: number | null): number | null {
  if (value == null) return null;
  return value > 100 ? null : value;
}

function isCalRestingSuspect(calR: number | null, calTotal: number | null): boolean {
  if (calR == null || calTotal == null) return false;
  return calR < 100 && calTotal > 1000;
}

function rowHash(record: ScrapedRecord): string {
  return createHash("sha1").update(JSON.stringify(record)).digest("hex");
}

// ---------------------------------------------------------------------------
// Mapping functions
// ---------------------------------------------------------------------------

function mapToDailyMetrics(
  record: ScrapedRecord,
  userId: string,
  scrapeInfo: ScrapeFile["scrapeInfo"],
) {
  const qualityFlags: string[] = [];
  if (record.flU != null && record.flU > 100) qualityFlags.push("floors_corrupted");
  if (isCalRestingSuspect(record.calR, record.cal)) qualityFlags.push("calories_resting_suspect");

  return {
    user_id: userId,
    metric_date: record.date,
    source: "garmin_connect",
    confidence: 0.88,

    // Existing columns
    steps: record.stp,
    distance_km: record.dist,
    calories_total: record.cal,
    calories_active: record.calA,
    intensity_minutes: record.imT,
    resting_hr: record.hr,
    max_hr: record.hrHi,
    hrv: record.hrv,
    stress_avg: record.str,
    body_battery_avg: record.bb,
    respiration_avg: record.rpA,
    spo2_avg: record.sp,
    training_readiness: record.tr,

    // New columns
    resting_hr_7d_avg: record.hr7d,
    bb_charged: record.bbC,
    bb_drained: record.bbD,
    stress_rest_min: record.strR,
    stress_low_min: record.strL,
    stress_medium_min: record.strM,
    stress_high_min: record.strH,
    intensity_minutes_week: record.imW,
    steps_7d_avg: record.stpA,
    floors_up: sanitizeFloors(record.flU),
    calories_resting: record.calR,
    hrv_status: record.hrvS && ["BALANCED", "UNBALANCED", "LOW", "HIGH"].includes(record.hrvS.toUpperCase())
      ? record.hrvS.toUpperCase()
      : null,
    hrv_overnight: record.hrvO,
    hrv_5min_high: record.hrv5,
    respiration_sleep_avg: record.rpS,
    respiration_low: record.rpL,
    respiration_high: record.rpH,
    spo2_sleep_avg: record.spS,
    training_readiness_status: record.trS,

    raw_data: {
      provider: "garmin_connect_scrape",
      scrapedAt: scrapeInfo.scrapedAt,
      importedAt: new Date().toISOString(),
      dataQualityFlags: qualityFlags,
      row: record,
    },
  };
}

function mapToSleepRow(record: ScrapedRecord, userId: string) {
  if (record.slM == null && record.slS == null) return null;

  return {
    user_id: userId,
    sleep_date: record.date,
    total_sleep_min: record.slM,
    sleep_score: record.slS,
    sleep_quality: record.slQ,
    sleep_need_min: record.slN,
    source: "garmin_connect",
    confidence: 0.86,
    raw_data: {
      provider: "garmin_connect_scrape",
      importedAt: new Date().toISOString(),
      sleepFields: { slS: record.slS, slQ: record.slQ, slM: record.slM, slN: record.slN },
    },
  };
}

function mapToRawRecord(record: ScrapedRecord, userId: string, filePath: string) {
  return {
    user_id: userId,
    metric_type: "daily_summary" as const,
    record_date: record.date,
    row_hash: rowHash(record),
    source_file_name: filePath,
    source_format: "scrape_json",
    payload: { provider: "garmin_connect_scrape", row: record },
  };
}

// ---------------------------------------------------------------------------
// Batch upsert (Supabase client mode)
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100;

async function upsertBatched(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });

    if (error) {
      console.error(`[error] ${table} batch ${i}–${i + batch.length}: ${error.message}`);
      errors += batch.length;
    } else {
      upserted += batch.length;
    }
  }

  return { upserted, errors };
}

// ---------------------------------------------------------------------------
// Management API SQL mode
// ---------------------------------------------------------------------------

function sqlLiteral(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "object") return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildUpsertSql(
  table: string,
  rows: Record<string, unknown>[],
  onConflictColumns: string[],
): string {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const valueRows = rows.map(
    (row) => `(${columns.map((col) => sqlLiteral(row[col])).join(", ")})`,
  );
  const updateCols = columns
    .filter((col) => !onConflictColumns.includes(col))
    .map((col) => `${col} = EXCLUDED.${col}`)
    .join(", ");

  return `INSERT INTO public.${table} (${columns.join(", ")})
VALUES ${valueRows.join(",\n       ")}
ON CONFLICT (${onConflictColumns.join(", ")}) DO UPDATE SET ${updateCols};`;
}

async function executeSql(projectRef: string, accessToken: string, sql: string): Promise<void> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SQL execution failed (${response.status}): ${text}`);
  }
}

async function upsertBatchedSql(
  projectRef: string,
  accessToken: string,
  table: string,
  rows: Record<string, unknown>[],
  onConflictColumns: string[],
): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const sql = buildUpsertSql(table, batch, onConflictColumns);
    try {
      await executeSql(projectRef, accessToken, sql);
      upserted += batch.length;
    } catch (err) {
      console.error(`[error] ${table} batch ${i}–${i + batch.length}: ${err instanceof Error ? err.message : String(err)}`);
      errors += batch.length;
    }
  }

  return { upserted, errors };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith("--")) {
    console.error(
      "Usage: npx tsx scripts/import-garmin-scrape.ts <json-file> --user-id <uuid> [--dry-run]",
    );
    process.exit(1);
  }

  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    console.error(`[error] file not found: ${resolvedPath}`);
    process.exit(1);
  }

  const userId = getFlag("--user-id") ?? process.env.GARMIN_SCRAPE_USER_ID;
  if (!userId) {
    console.error("[error] provide --user-id <uuid> or set GARMIN_SCRAPE_USER_ID env var");
    process.exit(1);
  }

  const dryRun = process.argv.includes("--dry-run");

  // Parse file
  const raw = readFileSync(resolvedPath, "utf-8");
  const parsed: ScrapeFile = JSON.parse(raw);
  const records = parsed.dailySummaries;

  console.log(`\n  file:       ${resolvedPath}`);
  console.log(`  user:       ${parsed.scrapeInfo.user}`);
  console.log(`  range:      ${parsed.scrapeInfo.dateRange}`);
  console.log(`  records:    ${records.length}`);
  console.log(`  user_id:    ${userId}`);
  console.log(`  dry run:    ${dryRun}\n`);

  // Map records
  const dailyRows = records.map((r) => mapToDailyMetrics(r, userId, parsed.scrapeInfo));
  const sleepRows = records
    .map((r) => mapToSleepRow(r, userId))
    .filter((r): r is NonNullable<typeof r> => r != null);
  const rawRows = records.map((r) => mapToRawRecord(r, userId, filePath));

  // Data quality summary
  const floorsCorrupted = records.filter((r) => r.flU != null && r.flU > 100).length;
  const calRSuspect = records.filter((r) => isCalRestingSuspect(r.calR, r.cal)).length;
  const noSleep = records.length - sleepRows.length;

  console.log(`  daily metric rows:    ${dailyRows.length}`);
  console.log(`  sleep rows:           ${sleepRows.length}  (${noSleep} days without sleep data)`);
  console.log(`  raw rows:             ${rawRows.length}`);
  console.log(`  floors corrupted:     ${floorsCorrupted}  (set to null)`);
  console.log(`  calR suspect:         ${calRSuspect}  (flagged in raw_data)\n`);

  if (dryRun) {
    console.log("  [done] dry run — no writes performed.\n");
    return;
  }

  // Determine import mode: Management API SQL vs Supabase client
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  const useSqlMode = !!(accessToken && projectRef);

  if (useSqlMode) {
    console.log("  mode: Management API SQL\n");
  } else {
    console.log("  mode: Supabase client\n");
  }

  let rawResult: { upserted: number; errors: number };
  let dailyResult: { upserted: number; errors: number };
  let sleepResult: { upserted: number; errors: number };

  if (useSqlMode) {
    // Management API SQL mode
    console.log("  upserting raw records…");
    rawResult = await upsertBatchedSql(
      projectRef!,
      accessToken!,
      "garmin_connect_raw_records",
      rawRows,
      ["user_id", "row_hash"],
    );

    console.log("  upserting daily metrics…");
    dailyResult = await upsertBatchedSql(
      projectRef!,
      accessToken!,
      "wellness_daily_metrics",
      dailyRows,
      ["user_id", "metric_date", "source"],
    );

    console.log("  upserting sleep sessions…");
    sleepResult = await upsertBatchedSql(
      projectRef!,
      accessToken!,
      "wellness_sleep_sessions",
      sleepRows,
      ["user_id", "sleep_date", "source"],
    );

    // Update data source
    const dsRow = {
      user_id: userId,
      provider: "garmin_connect",
      status: "connected",
      metadata: {
        mode: "scrape_import",
        scrapedAt: parsed.scrapeInfo.scrapedAt,
        importedAt: new Date().toISOString(),
        dateRange: parsed.scrapeInfo.dateRange,
        totalRecords: records.length,
        dailyMetricsImported: dailyResult.upserted,
        sleepSessionsImported: sleepResult.upserted,
        rawRecordsImported: rawResult.upserted,
      },
      last_synced_at: new Date().toISOString(),
    };
    await executeSql(projectRef!, accessToken!, buildUpsertSql("wellness_data_sources", [dsRow], ["user_id", "provider"]));
  } else {
    // Supabase client mode
    const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    console.log("  upserting raw records…");
    rawResult = await upsertBatched(
      supabase,
      "garmin_connect_raw_records",
      rawRows,
      "user_id,row_hash",
    );

    console.log("  upserting daily metrics…");
    dailyResult = await upsertBatched(
      supabase,
      "wellness_daily_metrics",
      dailyRows,
      "user_id,metric_date,source",
    );

    console.log("  upserting sleep sessions…");
    sleepResult = await upsertBatched(
      supabase,
      "wellness_sleep_sessions",
      sleepRows,
      "user_id,sleep_date,source",
    );

    // Update data source
    await supabase.from("wellness_data_sources").upsert(
      {
        user_id: userId,
        provider: "garmin_connect",
        status: "connected",
        metadata: {
          mode: "scrape_import",
          scrapedAt: parsed.scrapeInfo.scrapedAt,
          importedAt: new Date().toISOString(),
          dateRange: parsed.scrapeInfo.dateRange,
          totalRecords: records.length,
          dailyMetricsImported: dailyResult.upserted,
          sleepSessionsImported: sleepResult.upserted,
          rawRecordsImported: rawResult.upserted,
        },
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" },
    );
  }

  console.log("\n  [done] import summary:");
  console.log(
    JSON.stringify(
      {
        rawRecords: rawResult,
        dailyMetrics: dailyResult,
        sleepSessions: sleepResult,
        dataQuality: { floorsCorrupted, calRSuspect },
      },
      null,
      2,
    ),
  );
  console.log();
}

main().catch((err) => {
  console.error(`\n[fatal] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
