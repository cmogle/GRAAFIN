export const MORNING_CAPTURE_FLOW_VERSION = "morning_voice_v1" as const;

export type MorningMetricKey =
  | "sleepDurationMin"
  | "sleepScore"
  | "readiness"
  | "hrv"
  | "restingHr"
  | "steps"
  | "recoveryHours";

export type MorningMetrics = Record<MorningMetricKey, number | null>;

type MorningFieldConfig = {
  key: MorningMetricKey;
  label: string;
  prompt: string;
  helper: string;
  placeholder: string;
  inputMode: "numeric" | "decimal";
};

type MetricRange = {
  min: number;
  max: number;
  allowDecimal: boolean;
};

const SMALL_NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS_WORDS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALE_WORDS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
};

export const MORNING_CAPTURE_FIELDS: MorningFieldConfig[] = [
  {
    key: "sleepDurationMin",
    label: "Sleep duration",
    prompt: "What was your total sleep in minutes?",
    helper: "Say a number like “420”, or say “skip”.",
    placeholder: "420",
    inputMode: "numeric",
  },
  {
    key: "sleepScore",
    label: "Sleep score",
    prompt: "What was your sleep score?",
    helper: "Usually a value from 0 to 100.",
    placeholder: "78",
    inputMode: "numeric",
  },
  {
    key: "readiness",
    label: "Readiness",
    prompt: "What was your readiness score?",
    helper: "Say the readiness number shown in Garmin.",
    placeholder: "64",
    inputMode: "numeric",
  },
  {
    key: "hrv",
    label: "HRV",
    prompt: "What was your HRV?",
    helper: "Use the nightly HRV value.",
    placeholder: "57",
    inputMode: "numeric",
  },
  {
    key: "restingHr",
    label: "Resting HR",
    prompt: "What was your resting heart rate?",
    helper: "Beats per minute.",
    placeholder: "49",
    inputMode: "numeric",
  },
  {
    key: "steps",
    label: "Steps",
    prompt: "How many steps are currently shown?",
    helper: "Say a whole number.",
    placeholder: "6743",
    inputMode: "numeric",
  },
  {
    key: "recoveryHours",
    label: "Recovery hours",
    prompt: "What recovery hours are shown?",
    helper: "Decimals are allowed, for example “6.5”.",
    placeholder: "6.5",
    inputMode: "decimal",
  },
];

export const MORNING_CAPTURE_RANGES: Record<MorningMetricKey, MetricRange> = {
  sleepDurationMin: { min: 120, max: 900, allowDecimal: false },
  sleepScore: { min: 0, max: 100, allowDecimal: false },
  readiness: { min: 0, max: 100, allowDecimal: false },
  hrv: { min: 5, max: 300, allowDecimal: false },
  restingHr: { min: 25, max: 120, allowDecimal: false },
  steps: { min: 0, max: 100_000, allowDecimal: false },
  recoveryHours: { min: 0, max: 72, allowDecimal: true },
};

export type ParsedVoiceCommand =
  | { kind: "back" }
  | { kind: "skip" }
  | { kind: "value"; value: number }
  | { kind: "invalid"; reason: string };

function toFixedPrecision(value: number) {
  return Number(value.toFixed(2));
}

export function normalizeMetricValue(key: MorningMetricKey, value: number) {
  const range = MORNING_CAPTURE_RANGES[key];
  return range.allowDecimal ? toFixedPrecision(value) : Math.round(value);
}

export function validateMorningMetricValue(key: MorningMetricKey, value: number | null) {
  if (value == null) return null;
  if (!Number.isFinite(value)) return `${MORNING_CAPTURE_FIELDS.find((field) => field.key === key)?.label ?? key} is not a valid number.`;
  const range = MORNING_CAPTURE_RANGES[key];
  if (!range.allowDecimal && !Number.isInteger(value)) {
    return `${MORNING_CAPTURE_FIELDS.find((field) => field.key === key)?.label ?? key} must be a whole number.`;
  }
  if (value < range.min || value > range.max) {
    return `${MORNING_CAPTURE_FIELDS.find((field) => field.key === key)?.label ?? key} must be between ${range.min} and ${range.max}.`;
  }
  return null;
}

function parseDecimalFromWords(tokens: string[]) {
  if (tokens.length === 0) return null;
  const digits = tokens.map((token) => SMALL_NUMBER_WORDS[token]).filter((value) => value != null);
  if (digits.length !== tokens.length) return null;
  return Number(`0.${digits.join("")}`);
}

function parseIntegerWords(tokens: string[]) {
  if (!tokens.length) return null;

  if (
    (tokens.length === 2 || tokens.length === 3) &&
    SMALL_NUMBER_WORDS[tokens[0]] != null &&
    SMALL_NUMBER_WORDS[tokens[0]] > 0 &&
    SMALL_NUMBER_WORDS[tokens[0]] < 10 &&
    TENS_WORDS[tokens[1]] != null &&
    (tokens.length === 2 || SMALL_NUMBER_WORDS[tokens[2]] != null)
  ) {
    const first = SMALL_NUMBER_WORDS[tokens[0]];
    const tens = TENS_WORDS[tokens[1]];
    const ones = tokens.length === 3 ? SMALL_NUMBER_WORDS[tokens[2]] : 0;
    return first * 100 + tens + ones;
  }

  let total = 0;
  let current = 0;
  for (const token of tokens) {
    if (token === "and") continue;
    if (SMALL_NUMBER_WORDS[token] != null) {
      current += SMALL_NUMBER_WORDS[token];
      continue;
    }
    if (TENS_WORDS[token] != null) {
      current += TENS_WORDS[token];
      continue;
    }
    if (token === "hundred") {
      current = (current || 1) * SCALE_WORDS[token];
      continue;
    }
    if (token === "thousand") {
      total += (current || 1) * SCALE_WORDS[token];
      current = 0;
      continue;
    }
    return null;
  }
  return total + current;
}

function parseWordNumber(text: string) {
  const tokens = text
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return null;

  const pointIndex = tokens.indexOf("point");
  if (pointIndex >= 0) {
    const left = tokens.slice(0, pointIndex);
    const right = tokens.slice(pointIndex + 1);
    const leftInt = parseIntegerWords(left);
    const rightDecimal = parseDecimalFromWords(right);
    if (leftInt == null || rightDecimal == null) return null;
    return leftInt + rightDecimal;
  }

  return parseIntegerWords(tokens);
}

function parseNumberFromText(raw: string) {
  const cleaned = raw.replace(/,/g, " ").trim().toLowerCase();
  if (!cleaned) return null;

  const directMatch = cleaned.match(/-?\d+(\.\d+)?/);
  if (directMatch) {
    const parsed = Number(directMatch[0]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return parseWordNumber(cleaned);
}

export function parseVoiceCommand(rawTranscript: string, key: MorningMetricKey): ParsedVoiceCommand {
  const transcript = rawTranscript.trim().toLowerCase();
  if (!transcript) return { kind: "invalid", reason: "No speech detected." };

  if (/\b(back|go back|previous)\b/.test(transcript)) {
    return { kind: "back" };
  }

  if (/\b(skip|not available|unknown|n\/a|na)\b/.test(transcript)) {
    return { kind: "skip" };
  }

  const parsed = parseNumberFromText(transcript);
  if (parsed == null) {
    return { kind: "invalid", reason: "Could not parse a number." };
  }

  const normalized = normalizeMetricValue(key, parsed);
  const validationError = validateMorningMetricValue(key, normalized);
  if (validationError) {
    return { kind: "invalid", reason: validationError };
  }

  return { kind: "value", value: normalized };
}

export function morningCaptureStorageKey(reportDate: string) {
  return `graafin_morning_capture_v1:${reportDate}`;
}

export function localDateKey(now = new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function isValidDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
