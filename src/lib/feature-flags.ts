function envFlag(name: string, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export const featureFlags = {
  mobileShellV2: envFlag("FEATURE_MOBILE_SHELL_V2", true),
  coachV1: envFlag("FEATURE_COACH_V1", true),
  coachMemoryV1: envFlag("FEATURE_COACH_MEMORY_V1", true),
  dailyCheckinV1: envFlag("FEATURE_DAILY_CHECKIN_V1", true),
};
