# Run Insights Architecture Proposal

## 1) Goals
- Add per-run “same-category evolution” insights for a selected run.
- Add “marathon-block” pattern analysis while excluding one known anomaly: **July 2025 marathon-distance outlier**.
- Keep writes low-cost and dashboard responses compact for low token/response usage.

## 2) Core data model (Postgres)
### `run` table additions (or typed view-backed materialization)
- `run` columns already used: `id, user_id, started_at, distance_m, duration_s, category, source, tags`
- Add derived flags for fast filtering:
  - `is_marathon_distance boolean`
  - `run_month date` (YYYY-MM-01)
  - `effort_bucket smallint` (e.g., pace/fatigue quantile)

### New materialized views
1. `mv_run_evolution_daily`
```sql
run_id, user_id, started_at::date AS run_date, category,
normalized_pace, normalized_power, training_load, rolling_30d_zscore
FROM run
WHERE category IS NOT NULL
```
- one row per run, precomputing deltas to immediate prior run in same category.

2. `mv_run_category_trends`
```sql
user_id, category, run_date,
run_idx, best_recent, median_recent,
delta_from_prev, delta_from_rolling,
target_pace_delta, trend_confidence
FROM mv_run_evolution_daily
WHERE run_date >= date_trunc('month', now()) - interval '12 months'
```

3. `mv_marathon_block_patterns`
```sql
user_id, block_start, block_end,
run_count, mean_pace, pace_variance,
first_last_gap_days,
anomaly_filtered boolean,
contains_distance_anomaly boolean
FROM run
WHERE distance_m > 20000  -- marathon-block seed filter
```
- include anomaly marker, then exclude from outputs.

## 3) Query/index strategy
- Required indexes:
  - `CREATE INDEX CONCURRENTLY ON run(user_id, category, started_at);`
  - `CREATE INDEX CONCURRENTLY ON run(user_id, distance_m, started_at);`
  - `CREATE INDEX CONCURRENTLY ON mv_run_evolution_daily(user_id, category, run_date);`
  - `CREATE INDEX CONCURRENTLY ON mv_marathon_block_patterns(user_id, block_start, block_end);`
- Optional partial indexes for speed:
  - `CREATE INDEX ON run(user_id, started_at DESC) WHERE category IS NOT NULL;`
  - `CREATE INDEX ON run(user_id, distance_m) WHERE distance_m >= 42000 AND started_at >= NOW()-interval '24 months';`

## 4) Precompute strategy (low token usage)
- Nightly ETL job (or every 2h for active users):
  1. Refresh `mv_run_evolution_daily` (`CONCURRENTLY`).
  2. Refresh dependent `mv_run_category_trends` and `mv_marathon_block_patterns`.
  3. Persist `anomaly_suppressed_count` and `generated_at` metadata.
- Runtime API does only filtered reads with `LIMIT` and tiny payload fields.
- Cache: key by `(user_id, selected_run_id, category)` for 15m.
- Hard exclusion rule in both ETL and query: remove the July 2025 marathon anomaly from marathon-block candidates.

## 5) July 2025 anomaly exclusion rule
- Exclude exactly one known anomalous run cluster:
  - `started_at::date >= '2025-07-01' AND started_at::date < '2025-08-01'`
  - AND `category = 'marathon'`
  - AND `distance_m BETWEEN 41000 AND 43000` and `duration_s` is a 99.5+ percentile for that category cohort.
- Keep metadata flag `anomaly_filtered=true` for auditability, but do not include in trend scoring.

## 6) API response shapes
- `GET /api/insights/runs/:runId/evolution`
```json
{
  "runId": "uuid",
  "category": "marathon|tempo|long",
  "history": [{"runDate":"2025-02-01","pace":4.8,"delta":"-2.1%"}],
  "position": {"rankInCategory":12,"totalInWindow":96},
  "prev": {"runId":"uuid","distanceKm":42.1,"deltaFromPrev":"-0m03s/km"}
}
```
- `GET /api/insights/marathon-blocks?window=24m`
```json
{
  "summary": {"blocks":5,"improvingBlocks":2,"stableBlocks":2,"degradingBlocks":1},
  "blocks": [{"start":"2025-03-01","end":"2025-03-14","distanceKm":124.6,"trend":"improving","anomalyFiltered":false}],
  "meta": {"excludedAnomalyRunId":"uuid","generatedAt":"2026-02-21T00:00:00Z"}
}
```

## 7) Visualization UX
- Evolution view: sparkline + 4-point narrative cards (prev / rolling / best / projection); show category-specific normalization only.
- Marathon blocks: segmented row-bars per block with confidence color scale and a dedicated badge “July 2025 anomaly excluded.”
- Token-saving UX: show default top-3 insights + expandable section for full series and raw run links.
- Accessibility: color + icon + text state labels; focus on concise labels and compact timestamps.
