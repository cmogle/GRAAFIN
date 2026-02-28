export type SeasonPhase = "base" | "build" | "peak" | "taper" | "race_week" | "recovery";

export type WorkbenchSurface = "coach" | "dashboard";

export type CoachWorkbenchModuleKey =
  | "risk_banner"
  | "scenario_planner"
  | "assumption_trace"
  | "memory_trace"
  | "evidence_stack"
  | "action_rail";

export type DashboardWorkbenchModuleKey =
  | "readiness_focus"
  | "block_progress"
  | "load_risk"
  | "wellness_recovery"
  | "plan_adherence"
  | "query_theme_summary";

export type WorkbenchModuleKey = CoachWorkbenchModuleKey | DashboardWorkbenchModuleKey;

export type WorkbenchVisibility = "auto" | "manual_shown" | "manual_hidden";

export type WorkbenchModuleDescriptor = {
  key: WorkbenchModuleKey;
  title: string;
  description: string;
  surface: WorkbenchSurface;
};

export type WorkbenchRankedModule = {
  moduleKey: WorkbenchModuleKey;
  title: string;
  description: string;
  surface: WorkbenchSurface;
  score: number;
  reason: string;
  pinned: boolean;
  visibility: WorkbenchVisibility;
  slotIndex: number;
  autoShown: boolean;
};

export type QueryLearningSummary = {
  eventId: string | null;
  intent: string;
  seasonPhase: SeasonPhase;
  modules: WorkbenchRankedModule[];
  profileVersion: string;
};

export type QueryLearningInput = {
  userId: string;
  threadId: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  queryText: string;
  assistantText: string;
  intent: string;
  queryRoute: string;
  confidence: number;
  riskFlags: string[];
  stateChanges: string[];
  unresolvedQuestions: string[];
  assumptionsUsed: string[];
  memoryApplied: string[];
  activeConstraints: string[];
  raceDate: string | null;
};

export type WorkbenchSignalBundle = {
  topIntents7d: string[];
  topTopics7d: string[];
};
