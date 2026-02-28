import {
  CoachIntent,
  applyStateUpdate,
  buildScenarioPlan,
  classifyIntent,
  defaultCoachState,
  planQueryRoutes,
  resolveReferences,
  shouldCompareBlocks,
  inferStateUpdate,
} from "@/lib/coach/intelligence";
import { deriveSeasonPhase } from "@/lib/coach/learning";
import { getModuleCandidates } from "@/lib/coach/workbench";

type EvalCaseResult = {
  id: string;
  title: string;
  passed: boolean;
  details: string;
};

export type EvalSuiteResult = {
  passed: number;
  failed: number;
  total: number;
  generatedAt: string;
  results: EvalCaseResult[];
};

type ConversationState = {
  intent: CoachIntent;
  runningAllowed: boolean;
  availabilityState: string;
  entityMemory: Record<string, unknown>;
};

function simulateConversation(messages: string[]): ConversationState {
  let state = defaultCoachState();
  let intent: CoachIntent = "other";
  const entityMemory: Record<string, unknown> = {};

  for (const message of messages) {
    intent = classifyIntent(message, intent);
    const update = inferStateUpdate(message, state);
    state = applyStateUpdate(state, update);
    entityMemory.lastTopic = message.slice(0, 120);
    if (message.toLowerCase().includes("travel")) entityMemory.lastConstraint = "travel";
    if (message.toLowerCase().includes("injury")) entityMemory.lastConstraint = "injury";
  }

  return {
    intent,
    runningAllowed: state.runningAllowed,
    availabilityState: state.availabilityState,
    entityMemory,
  };
}

export function runCoachEvalSuite(): EvalSuiteResult {
  const results: EvalCaseResult[] = [];

  const continuity = simulateConversation([
    "I sprained my ankle and my ribs hurt. I am not cleared to run.",
    "Will that ruin Boston?",
    "What should my week look like instead?",
  ]);
  results.push({
    id: "cross_topic_continuity",
    title: "Cross-topic continuity holds injury constraint",
    passed: continuity.runningAllowed === false && continuity.availabilityState === "medical_hold",
    details: `availability=${continuity.availabilityState}, runningAllowed=${String(continuity.runningAllowed)}`,
  });

  const reference = resolveReferences("Will that ruin Boston?", {
    lastTopic: "I sprained my ankle and cannot run this week.",
    lastConstraint: "no running availability",
  });
  results.push({
    id: "anaphora_resolution",
    title: "Anaphora resolution appends reference context",
    passed: reference.resolvedMessage.includes("resolved_reference_context"),
    details: reference.resolvedMessage,
  });

  const contradictionStart = applyStateUpdate(defaultCoachState(), inferStateUpdate("I am not cleared to run.", defaultCoachState()));
  const contradictionEnd = applyStateUpdate(contradictionStart, inferStateUpdate("I got cleared and can run again.", contradictionStart));
  results.push({
    id: "contradiction_reconciliation",
    title: "Contradiction updates to return_build",
    passed: contradictionEnd.runningAllowed === true && contradictionEnd.availabilityState === "return_build",
    details: `availability=${contradictionEnd.availabilityState}, runningAllowed=${String(contradictionEnd.runningAllowed)}`,
  });

  const externalIntent = classifyIntent("Use outside best-practice evidence plus my data.");
  const externalRoute = planQueryRoutes(externalIntent, "Use outside best-practice evidence plus my data.");
  results.push({
    id: "external_route",
    title: "External-intel query routes to mixed/external",
    passed: externalRoute === "mixed" || externalRoute === "external",
    details: `intent=${externalIntent}, route=${externalRoute}`,
  });

  const comparePlan = shouldCompareBlocks("plan_adjustment");
  const compareLoad = shouldCompareBlocks("load_comparison");
  const compareRace = shouldCompareBlocks("race_strategy");
  results.push({
    id: "block_defaulting",
    title: "Relevant intents default to block comparison",
    passed: comparePlan && compareLoad && compareRace,
    details: `plan=${String(comparePlan)}, load=${String(compareLoad)}, race=${String(compareRace)}`,
  });

  const scenario = buildScenarioPlan({
    cockpit: {
      readiness: {
        score: 72,
        status: "moderate",
        confidence: 78,
        acuteLoad: 440,
        chronicLoad: 390,
        monotony: 1.5,
        strain: 640,
        loadRatio: 1.05,
        missingData: false,
      },
      todayPlan: { date: "2026-02-26", workouts: [{ id: "1", name: "Tempo", dayOfWeek: 3, distanceKm: 12, durationMin: 60, intensity: "tempo", notes: null, status: "Planned" }] },
      loadTrend: [],
      quickInsights: [],
      checkinPreview: null,
      generatedAt: new Date().toISOString(),
    },
    coachState: {
      availabilityState: "medical_hold",
      runningAllowed: false,
      expectedReturnDate: null,
      confidence: 0.9,
      source: "user",
      updatedAt: new Date().toISOString(),
    },
    activeBlock: {
      blockKey: "active-2026-04-20",
      raceName: "Boston Marathon",
      raceDate: "2026-04-20",
      isActive: true,
      startDate: "2026-01-26",
      endDate: "2026-02-26",
      avgWeeklyKm: 78,
      longRunCount: 5,
      qualitySessionDensity: 1.8,
      taperSimilarity: 0.4,
      confidence: 0.86,
      weekIndex: 5,
      weekCount: 12,
      comparator: {
        priorBlockCount: 8,
        priorMedianWeeklyKm: 74,
        weeklyDeltaKm: 4,
        longRunDelta: 1,
        confidence: "high",
      },
    },
  });
  results.push({
    id: "injury_scenario_planner",
    title: "Scenario planner emits 3/7/14-day horizons",
    passed:
      scenario.items.length === 3 &&
      scenario.items[0]?.outageDays === 3 &&
      scenario.items[1]?.outageDays === 7 &&
      scenario.items[2]?.outageDays === 14,
    details: scenario.items.map((item) => `${item.outageDays}d:${item.riskLevel}`).join(", "),
  });

  const raceWeekDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const phase = deriveSeasonPhase(raceWeekDate);
  results.push({
    id: "learning_season_phase",
    title: "Learning season phase maps near-race dates to race_week",
    passed: phase === "race_week",
    details: `raceDate=${raceWeekDate}, phase=${phase}`,
  });

  const injuryModules = getModuleCandidates({
    intent: "injury_adaptation",
    riskFlags: ["medical_hold"],
    seasonPhase: "build",
  });
  results.push({
    id: "workbench_module_ranking_injury",
    title: "Injury learning candidates include risk and scenario modules",
    passed: injuryModules.includes("risk_banner") && injuryModules.includes("scenario_planner"),
    details: injuryModules.join(", "),
  });

  const taperModules = getModuleCandidates({
    intent: "race_strategy",
    riskFlags: [],
    seasonPhase: "taper",
  });
  results.push({
    id: "workbench_module_ranking_taper",
    title: "Taper learning candidates include block/readiness modules",
    passed: taperModules.includes("block_progress") && taperModules.includes("readiness_focus"),
    details: taperModules.join(", "),
  });

  const passed = results.filter((result) => result.passed).length;
  const failed = results.length - passed;
  return {
    passed,
    failed,
    total: results.length,
    generatedAt: new Date().toISOString(),
    results,
  };
}
