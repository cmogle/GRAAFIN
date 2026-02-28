-- Garmin Connect scrape expansion: add garmin_connect provider, 19 new daily
-- metric columns, 2 new sleep columns, and daily_summary metric type.

-- 1. Provider / source constraints ------------------------------------------

alter table public.wellness_data_sources
  drop constraint wellness_data_sources_provider_check;
alter table public.wellness_data_sources
  add constraint wellness_data_sources_provider_check
    check (provider in ('manual', 'whoop', 'oura', 'apple_health', 'garmin_connect', 'other'));

alter table public.wellness_sleep_sessions
  drop constraint wellness_sleep_sessions_source_check;
alter table public.wellness_sleep_sessions
  add constraint wellness_sleep_sessions_source_check
    check (source in ('manual', 'whoop', 'oura', 'apple_health', 'garmin_connect', 'other'));

alter table public.garmin_connect_raw_records
  drop constraint garmin_connect_raw_records_metric_type_check;
alter table public.garmin_connect_raw_records
  add constraint garmin_connect_raw_records_metric_type_check
    check (metric_type in ('sleep', 'daily_metrics', 'daily_summary', 'activity', 'body', 'other'));

-- 2. New columns on wellness_daily_metrics -----------------------------------

alter table public.wellness_daily_metrics
  add column if not exists resting_hr_7d_avg          numeric(6,2),
  add column if not exists bb_charged                  integer,
  add column if not exists bb_drained                  integer,
  add column if not exists stress_rest_min             integer,
  add column if not exists stress_low_min              integer,
  add column if not exists stress_medium_min           integer,
  add column if not exists stress_high_min             integer,
  add column if not exists intensity_minutes_week      integer,
  add column if not exists steps_7d_avg                integer,
  add column if not exists floors_up                   integer,
  add column if not exists calories_resting            numeric(10,2),
  add column if not exists hrv_status                  text,
  add column if not exists hrv_overnight               numeric(8,2),
  add column if not exists hrv_5min_high               numeric(8,2),
  add column if not exists respiration_sleep_avg       numeric(6,2),
  add column if not exists respiration_low             numeric(6,2),
  add column if not exists respiration_high            numeric(6,2),
  add column if not exists spo2_sleep_avg              numeric(6,2),
  add column if not exists training_readiness_status   text;

-- 3. New columns on wellness_sleep_sessions ----------------------------------

alter table public.wellness_sleep_sessions
  add column if not exists sleep_quality   text,
  add column if not exists sleep_need_min  integer;

-- 4. CHECK constraints on new text enum columns ------------------------------

alter table public.wellness_daily_metrics
  add constraint wellness_daily_metrics_hrv_status_check
    check (hrv_status is null or hrv_status in ('BALANCED', 'UNBALANCED', 'LOW', 'HIGH'));

alter table public.wellness_daily_metrics
  add constraint wellness_daily_metrics_tr_status_check
    check (training_readiness_status is null
        or training_readiness_status in ('Prime', 'High', 'Moderate', 'Low', 'Poor'));

alter table public.wellness_sleep_sessions
  add constraint wellness_sleep_sessions_sleep_quality_check
    check (sleep_quality is null or sleep_quality in ('Excellent', 'Good', 'Fair', 'Poor'));
