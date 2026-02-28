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
  coachContextV2: envFlag("FEATURE_COACH_CONTEXT_V2", true),
  coachBlocksV2: envFlag("FEATURE_COACH_BLOCKS_V2", true),
  coachRouterV1: envFlag("FEATURE_COACH_ROUTER_V1", true),
  coachEvidenceV1: envFlag("FEATURE_COACH_EVIDENCE_V1", true),
  wellnessSleepV1: envFlag("FEATURE_WELLNESS_SLEEP_V1", true),
  wellnessNutritionV1: envFlag("FEATURE_WELLNESS_NUTRITION_V1", true),
  wellnessMorningVoiceV1: envFlag("FEATURE_WELLNESS_MORNING_VOICE_V1", false),
  coachWorkbenchV1: envFlag("FEATURE_COACH_WORKBENCH_V1", false),
};
