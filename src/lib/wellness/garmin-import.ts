import { createHash } from "crypto";

type RawRecord = Record<string, unknown>;

export type GarminSleepImportRecord = {
  sleepDate: string;
  bedtime: string | null;
  wakeTime: string | null;
  totalSleepMin: number | null;
  remSleepMin: number | null;
  deepSleepMin: number | null;
  restingHr: number | null;
  hrv: number | null;
  sleepScore: number | null;
  readinessScore: number | null;
  sleepQuality: string | null;
  sleepNeedMin: number | null;
  raw: RawRecord;
  rowHash: string;
};

export type GarminDailyMetricImportRecord = {
  metricDate: string;
  steps: number | null;
  distanceKm: number | null;
  caloriesTotal: number | null;
  caloriesActive: number | null;
  caloriesResting: number | null;
  intensityMinutes: number | null;
  intensityMinutesWeek: number | null;
  restingHr: number | null;
  restingHr7dAvg: number | null;
  avgHr: number | null;
  minHr: number | null;
  maxHr: number | null;
  hrv: number | null;
  hrvStatus: string | null;
  hrvOvernight: number | null;
  hrv5minHigh: number | null;
  stressAvg: number | null;
  stressMax: number | null;
  stressRestMin: number | null;
  stressLowMin: number | null;
  stressMediumMin: number | null;
  stressHighMin: number | null;
  bodyBatteryAvg: number | null;
  bodyBatteryMin: number | null;
  bodyBatteryMax: number | null;
  bbCharged: number | null;
  bbDrained: number | null;
  respirationAvg: number | null;
  respirationSleepAvg: number | null;
  respirationLow: number | null;
  respirationHigh: number | null;
  spo2Avg: number | null;
  spo2SleepAvg: number | null;
  trainingReadiness: number | null;
  trainingReadinessStatus: string | null;
  recoveryHours: number | null;
  vo2Max: number | null;
  steps7dAvg: number | null;
  floorsUp: number | null;
  raw: RawRecord;
  rowHash: string;
};

export type GarminRawImportRecord = {
  metricType: "sleep" | "daily_metrics" | "activity" | "body" | "other";
  recordDate: string | null;
  payload: RawRecord;
  rowHash: string;
};

type ParseResult = {
  sleepRecords: GarminSleepImportRecord[];
  dailyMetricRecords: GarminDailyMetricImportRecord[];
  rawRecords: GarminRawImportRecord[];
  warnings: string[];
};

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pick(record: RawRecord, candidates: string[]) {
  for (const key of Object.keys(record)) {
    const normalized = normalizeHeader(key);
    if (candidates.includes(normalized)) return record[key];
  }
  return null;
}

function flattenRecord(input: unknown, parent = "", out: RawRecord = {}): RawRecord {
  if (!input || typeof input !== "object") return out;
  const record = input as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    const merged = parent ? `${parent}_${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenRecord(value, merged, out);
    } else {
      out[merged] = value;
      out[key] = value;
    }
  }
  return out;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(+parsed)) return null;
  return parsed.toISOString();
}

function toDateKey(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  const parsedIso = toIsoOrNull(value);
  if (!parsedIso) return null;
  return parsedIso.slice(0, 10);
}

function minutesFrom(value: unknown): number | null {
  const n = toNumber(value);
  if (n == null) return null;
  if (n > 20_000) return Math.round(n / 60_000);
  if (n > 500) return Math.round(n / 60);
  return Math.round(n);
}

function kmFrom(value: unknown): number | null {
  const n = toNumber(value);
  if (n == null) return null;
  if (n > 1000) return Number((n / 1000).toFixed(2));
  return Number(n.toFixed(2));
}

function parseCsv(text: string): RawRecord[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: RawRecord = {};
    headers.forEach((header, index) => {
      row[header] = cols[index] ?? "";
    });
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((value) => value.trim());
}

function parseJson(text: string): RawRecord[] {
  const parsed = JSON.parse(text) as unknown;
  if (Array.isArray(parsed)) return parsed.filter((item) => item && typeof item === "object") as RawRecord[];
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    for (const key of ["records", "sleep", "sleepSessions", "daily", "dailyMetrics", "metrics", "data"]) {
      const value = record[key];
      if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as RawRecord[];
    }
  }
  return [];
}

function rowHash(record: RawRecord) {
  return createHash("sha1").update(JSON.stringify(record)).digest("hex");
}

function mapSleepRecord(record: RawRecord): GarminSleepImportRecord | null {
  const sleepDate =
    toDateKey(
      pick(record, ["sleepdate", "date", "calendardate", "starttime", "sleepstarttime", "sleepstarttimestampgmt"]),
    ) ??
    toDateKey(pick(record, ["sleepstart", "starttimestamp", "starttimestampgmt"]));
  if (!sleepDate) return null;

  const totalSleepMin = minutesFrom(
    pick(record, ["totalsleepminutes", "sleeptimeminutes", "durationminutes", "totalsleepduration", "duration"]),
  );
  const hasSleepSignal = totalSleepMin != null || pick(record, ["sleepscore", "deepsleepminutes", "remsleepminutes"]) != null;
  if (!hasSleepSignal) return null;

  return {
    sleepDate,
    bedtime: toIsoOrNull(
      pick(record, ["bedtime", "sleepstart", "sleepstarttime", "starttime", "starttimestamp", "starttimestampgmt"]),
    ),
    wakeTime: toIsoOrNull(
      pick(record, ["waketime", "sleepend", "sleependtime", "endtime", "endtimestamp", "endtimestampgmt"]),
    ),
    totalSleepMin,
    remSleepMin: minutesFrom(pick(record, ["remsleepminutes", "remminutes", "remduration"])),
    deepSleepMin: minutesFrom(pick(record, ["deepsleepminutes", "deepminutes", "deepduration"])),
    restingHr: toNumber(pick(record, ["restinghr", "restingheartrate", "avgrestinghr"])),
    hrv: toNumber(pick(record, ["hrv", "avghrv", "overnighthrv"])),
    sleepScore: toNumber(pick(record, ["sleepscore", "overallsleepscore", "score"])),
    readinessScore: toNumber(pick(record, ["readinessscore", "bodybattery", "recoveryscore"])),
    sleepQuality: pick(record, ["sleepquality", "quality"]) as string | null,
    sleepNeedMin: minutesFrom(pick(record, ["sleepneedmin", "sleepneed", "targetsleepminutes"])),
    raw: record,
    rowHash: rowHash(record),
  };
}

function mapDailyMetricsRecord(record: RawRecord): GarminDailyMetricImportRecord | null {
  const metricDate = toDateKey(
    pick(record, ["date", "calendardate", "summarydate", "metricdate", "starttime", "timestamp"]),
  );
  if (!metricDate) return null;

  const steps = toNumber(pick(record, ["steps", "stepcount"]));
  const hrv = toNumber(pick(record, ["hrv", "avghrv", "overnighthrv"]));
  const stressAvg = toNumber(pick(record, ["stressavg", "averagestresslevel", "stressscore"]));
  const bodyBatteryAvg = toNumber(pick(record, ["bodybatteryavg", "bodybattery", "bodybatteryaverage"]));
  const trainingReadiness = toNumber(pick(record, ["trainingreadiness", "readinessscore"]));
  const hasDailySignal =
    steps != null ||
    hrv != null ||
    stressAvg != null ||
    bodyBatteryAvg != null ||
    trainingReadiness != null ||
    pick(record, ["restinghr", "calories", "distance"]) != null;
  if (!hasDailySignal) return null;

  return {
    metricDate,
    steps: steps == null ? null : Math.round(steps),
    distanceKm: kmFrom(pick(record, ["distancekm", "distance", "totaldistance"])),
    caloriesTotal: toNumber(pick(record, ["caloriestotal", "calories", "totalcalories"])),
    caloriesActive: toNumber(pick(record, ["activecalories", "activekilocalories"])),
    caloriesResting: toNumber(pick(record, ["caloriesresting", "restingcalories"])),
    intensityMinutes: minutesFrom(pick(record, ["intensityminutes", "vigorousminutes", "activeminutes"])),
    intensityMinutesWeek: toNumber(pick(record, ["intensityminutesweek", "weeklyintensityminutes"])),
    restingHr: toNumber(pick(record, ["restinghr", "restingheartrate"])),
    restingHr7dAvg: toNumber(pick(record, ["restinghr7davg", "restingheartrate7dayavg"])),
    avgHr: toNumber(pick(record, ["avghr", "averageheartrate"])),
    minHr: toNumber(pick(record, ["minhr", "minimumheartrate"])),
    maxHr: toNumber(pick(record, ["maxhr", "maximumheartrate"])),
    hrv,
    hrvStatus: pick(record, ["hrvstatus"]) as string | null,
    hrvOvernight: toNumber(pick(record, ["hrvovernight", "overnighthrv"])),
    hrv5minHigh: toNumber(pick(record, ["hrv5minhigh", "hrv5minutehigh"])),
    stressAvg,
    stressMax: toNumber(pick(record, ["stressmax", "maxstresslevel"])),
    stressRestMin: toNumber(pick(record, ["stressrestmin", "restminutes"])),
    stressLowMin: toNumber(pick(record, ["stresslowmin", "lowstressminutes"])),
    stressMediumMin: toNumber(pick(record, ["stressmediummin", "mediumstressminutes"])),
    stressHighMin: toNumber(pick(record, ["stresshighmin", "highstressminutes"])),
    bodyBatteryAvg,
    bodyBatteryMin: toNumber(pick(record, ["bodybatterymin", "minbodybattery"])),
    bodyBatteryMax: toNumber(pick(record, ["bodybatterymax", "maxbodybattery"])),
    bbCharged: toNumber(pick(record, ["bbcharged", "bodybatterycharged"])),
    bbDrained: toNumber(pick(record, ["bbdrained", "bodybatterydrained"])),
    respirationAvg: toNumber(pick(record, ["respirationavg", "avgrespiration"])),
    respirationSleepAvg: toNumber(pick(record, ["respirationsleepavg", "sleeprespiration"])),
    respirationLow: toNumber(pick(record, ["respirationlow", "lowrespiration"])),
    respirationHigh: toNumber(pick(record, ["respirationhigh", "highrespiration"])),
    spo2Avg: toNumber(pick(record, ["spo2avg", "avgspo2", "pulseoxavg"])),
    spo2SleepAvg: toNumber(pick(record, ["spo2sleepavg", "sleepspo2"])),
    trainingReadiness,
    trainingReadinessStatus: pick(record, ["trainingreadinessstatus", "readinessstatus"]) as string | null,
    recoveryHours: toNumber(pick(record, ["recoveryhours", "recoverytimehours"])),
    vo2Max: toNumber(pick(record, ["vo2max", "vo2maxvalue"])),
    steps7dAvg: toNumber(pick(record, ["steps7davg", "stepcount7dayavg"])),
    floorsUp: toNumber(pick(record, ["floorsup", "floorsclimbed"])),
    raw: record,
    rowHash: rowHash(record),
  };
}

function guessMetricType(record: RawRecord): "sleep" | "daily_metrics" | "activity" | "body" | "other" {
  const keys = Object.keys(record).map((key) => normalizeHeader(key));
  if (keys.some((key) => key.includes("sleep") || key.includes("bedtime") || key.includes("waketime"))) return "sleep";
  if (keys.some((key) => key.includes("bodybattery") || key.includes("stress") || key.includes("hrv") || key.includes("steps"))) return "daily_metrics";
  if (keys.some((key) => key.includes("activity") || key.includes("workout"))) return "activity";
  if (keys.some((key) => key.includes("weight") || key.includes("bodyfat"))) return "body";
  return "other";
}

export function parseGarminWellnessImport(input: string): ParseResult {
  const warnings: string[] = [];
  const trimmed = input.trim();
  if (!trimmed) return { sleepRecords: [], dailyMetricRecords: [], rawRecords: [], warnings: ["Empty file."] };

  let rows: RawRecord[] = [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      rows = parseJson(trimmed);
    } catch {
      warnings.push("JSON parsing failed.");
    }
  } else {
    rows = parseCsv(trimmed);
  }

  if (!rows.length) {
    return { sleepRecords: [], dailyMetricRecords: [], rawRecords: [], warnings: ["No structured rows detected in file."] };
  }

  const sleepRecords: GarminSleepImportRecord[] = [];
  const dailyMetricRecords: GarminDailyMetricImportRecord[] = [];
  const rawRecords: GarminRawImportRecord[] = [];

  for (const row of rows) {
    const flat = flattenRecord(row);
    const sleep = mapSleepRecord(flat);
    const daily = mapDailyMetricsRecord(flat);
    if (sleep) sleepRecords.push(sleep);
    if (daily) dailyMetricRecords.push(daily);

    rawRecords.push({
      metricType: sleep ? "sleep" : daily ? "daily_metrics" : guessMetricType(flat),
      recordDate: sleep?.sleepDate ?? daily?.metricDate ?? toDateKey(pick(flat, ["date", "calendardate", "timestamp"])),
      payload: flat,
      rowHash: rowHash(flat),
    });
  }

  if (!sleepRecords.length && !dailyMetricRecords.length) {
    warnings.push("Rows were parsed but no known sleep/daily wellness fields matched.");
  }
  return { sleepRecords, dailyMetricRecords, rawRecords, warnings };
}
