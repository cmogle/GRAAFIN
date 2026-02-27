"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, MicOff, SkipForward, Undo2 } from "lucide-react";
import {
  localDateKey,
  morningCaptureStorageKey,
  MORNING_CAPTURE_FIELDS,
  MORNING_CAPTURE_FLOW_VERSION,
  type MorningMetricKey,
  type MorningMetrics,
  normalizeMetricValue,
  parseVoiceCommand,
  validateMorningMetricValue,
} from "@/lib/wellness/morning-capture";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type CaptureState = {
  reportDate: string;
  stepIndex: number;
  metrics: MorningMetrics;
  voiceUsed: boolean;
  typedUsed: boolean;
};

type UndoState = {
  stepIndex: number;
  key: MorningMetricKey;
  previous: number | null;
};

type VoiceStatus = "ready" | "listening" | "processing" | "unsupported" | "denied" | "error";

const INITIAL_METRICS: MorningMetrics = {
  sleepDurationMin: null,
  sleepScore: null,
  readiness: null,
  hrv: null,
  restingHr: null,
  steps: null,
  recoveryHours: null,
};

function getSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function parseTypedValue(value: string) {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export function MorningCaptureFlow() {
  const [reportDate] = useState(() => localDateKey());
  const [metrics, setMetrics] = useState<MorningMetrics>(INITIAL_METRICS);
  const [stepIndex, setStepIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [stepError, setStepError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("ready");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [typedUsed, setTypedUsed] = useState(false);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [listenNonce, setListenNonce] = useState(0);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRef = useRef(false);
  const speechCtorRef = useRef<SpeechRecognitionConstructor | null>(null);
  const voiceDeniedRef = useRef(false);

  const isReviewStep = stepIndex >= MORNING_CAPTURE_FIELDS.length;
  const currentField = isReviewStep ? null : MORNING_CAPTURE_FIELDS[stepIndex];

  const completedCount = useMemo(
    () => Object.values(metrics).filter((value) => value != null).length,
    [metrics],
  );

  useEffect(() => {
    const ctor = getSpeechRecognitionConstructor();
    speechCtorRef.current = ctor;
    if (!ctor) {
      setVoiceSupported(false);
      setVoiceStatus("unsupported");
      voiceDeniedRef.current = false;
      return;
    }
    setVoiceSupported(true);
    setVoiceStatus("ready");
    voiceDeniedRef.current = false;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem(morningCaptureStorageKey(reportDate));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as CaptureState;
      if (parsed.reportDate !== reportDate) return;
      setMetrics({ ...INITIAL_METRICS, ...(parsed.metrics ?? {}) });
      setStepIndex(Math.max(0, Math.min(MORNING_CAPTURE_FIELDS.length, Number(parsed.stepIndex ?? 0))));
      setVoiceUsed(Boolean(parsed.voiceUsed));
      setTypedUsed(Boolean(parsed.typedUsed));
    } catch {
      // Ignore malformed local state.
    }
  }, [reportDate]);

  useEffect(() => {
    if (typeof window === "undefined" || completed) return;
    const state: CaptureState = {
      reportDate,
      stepIndex,
      metrics,
      voiceUsed,
      typedUsed,
    };
    sessionStorage.setItem(morningCaptureStorageKey(reportDate), JSON.stringify(state));
  }, [completed, metrics, reportDate, stepIndex, typedUsed, voiceUsed]);

  const stopListening = () => {
    shouldRestartRef.current = false;
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onend = null;
    recognition.onerror = null;
    recognition.onresult = null;
    recognition.abort();
    recognitionRef.current = null;
  };

  const goToPreviousStep = () => {
    setStepIndex((prev) => Math.max(0, prev - 1));
    setStepError(null);
    setMessage(null);
  };

  const applyValue = (value: number | null, source: "voice" | "typed" | "skip") => {
    if (!currentField) return;
    let previous: number | null = null;

    setMetrics((prev) => {
      previous = prev[currentField.key];
      return { ...prev, [currentField.key]: value };
    });

    if (source === "voice") setVoiceUsed(true);
    if (source === "typed" || source === "skip") setTypedUsed(true);

    setUndoState({
      stepIndex,
      key: currentField.key,
      previous,
    });
    setStepError(null);
    setMessage(null);
    setInputValue("");
    setStepIndex((prev) => Math.min(MORNING_CAPTURE_FIELDS.length, prev + 1));
  };

  useEffect(() => {
    if (!voiceSupported || !currentField || submitting || completed) return;
    if (voiceDeniedRef.current) return;

    stopListening();
    shouldRestartRef.current = true;

    const ctor = speechCtorRef.current;
    if (!ctor) return;

    const recognition = new ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceStatus("listening");
    };

    recognition.onresult = (event) => {
      const first = event.results?.[event.resultIndex]?.[0];
      const transcript = first?.transcript?.trim() ?? "";
      setVoiceStatus("processing");
      if (!transcript) {
        setStepError("No speech detected. Try again.");
        setListenNonce((prev) => prev + 1);
        return;
      }
      const parsed = parseVoiceCommand(transcript, currentField.key);
      if (parsed.kind === "back") {
        setStepIndex((prev) => Math.max(0, prev - 1));
        setStepError(null);
        setMessage(null);
        return;
      }
      if (parsed.kind === "invalid") {
        setStepError(parsed.reason);
        setMessage(`Heard: "${transcript}"`);
        setListenNonce((prev) => prev + 1);
        return;
      }
      const nextValue = parsed.kind === "skip" ? null : parsed.value;
      let previous: number | null = null;
      setMetrics((prev) => {
        previous = prev[currentField.key];
        return { ...prev, [currentField.key]: nextValue };
      });
      setVoiceUsed(true);
      setUndoState({
        stepIndex,
        key: currentField.key,
        previous,
      });
      setStepError(null);
      setMessage(null);
      setInputValue("");
      setStepIndex((prev) => Math.min(MORNING_CAPTURE_FIELDS.length, prev + 1));
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setVoiceStatus("denied");
        voiceDeniedRef.current = true;
        shouldRestartRef.current = false;
        setStepError("Microphone permission denied. Use keyboard input below.");
        return;
      }
      if (event.error === "no-speech") {
        setStepError("No speech detected. Try again.");
        setVoiceStatus("ready");
        setListenNonce((prev) => prev + 1);
        return;
      }
      setVoiceStatus("error");
      setStepError("Voice capture had an error. You can continue with keyboard input.");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (shouldRestartRef.current && !completed && !isReviewStep) {
        setVoiceStatus("ready");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();

    return () => {
      stopListening();
    };
  }, [completed, currentField, isReviewStep, listenNonce, stepIndex, submitting, voiceSupported]);

  useEffect(() => {
    if (!currentField) {
      setInputValue("");
      return;
    }
    const existing = metrics[currentField.key];
    setInputValue(existing == null ? "" : String(existing));
  }, [currentField, metrics]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  const submitTyped = () => {
    if (!currentField) return;
    const parsed = parseTypedValue(inputValue);
    if (parsed == null) {
      setStepError("Enter a valid number or tap Skip.");
      return;
    }
    const normalized = normalizeMetricValue(currentField.key, parsed);
    const validationError = validateMorningMetricValue(currentField.key, normalized);
    if (validationError) {
      setStepError(validationError);
      return;
    }
    applyValue(normalized, "typed");
  };

  const undoPrevious = () => {
    if (!undoState) return;
    setMetrics((prev) => ({ ...prev, [undoState.key]: undoState.previous }));
    setStepIndex(undoState.stepIndex);
    setUndoState(null);
    setStepError(null);
    setMessage("Previous input restored.");
  };

  const submitMorningReport = async () => {
    setSubmitting(true);
    setStepError(null);
    setMessage(null);
    try {
      const skippedFields = MORNING_CAPTURE_FIELDS.filter((field) => metrics[field.key] == null).map((field) => field.key);
      const response = await fetch("/api/wellness/morning-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportDate,
          metrics,
          source: "manual_voice",
          captureMeta: {
            flowVersion: MORNING_CAPTURE_FLOW_VERSION,
            skippedFields,
            method: voiceUsed && typedUsed ? "mixed" : voiceUsed ? "voice" : "typed",
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(String(data?.error ?? "Failed to save morning report."));
      }
      sessionStorage.removeItem(morningCaptureStorageKey(reportDate));
      setCompleted(true);
    } catch (e) {
      setStepError(e instanceof Error ? e.message : "Failed to save morning report.");
    } finally {
      setSubmitting(false);
    }
  };

  if (completed) {
    return (
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-4 py-8">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600">Saved</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Morning report captured</h1>
          <p className="mt-2 text-sm text-slate-600">Your wellness metrics are now available for readiness and coach context.</p>
          <div className="mt-5 space-y-2">
            <Link
              href="/wellness"
              className="block rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white"
            >
              Back to Wellness
            </Link>
            <Link
              href="/coach"
              className="block rounded-2xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700"
            >
              Open Coach
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-between px-4 pb-8 pt-6">
      <div>
        <div className="mb-6 flex items-center justify-between text-xs text-slate-500">
          <span>Morning capture</span>
          <span>
            {Math.min(stepIndex + 1, MORNING_CAPTURE_FIELDS.length)} / {MORNING_CAPTURE_FIELDS.length}
          </span>
        </div>

        <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-slate-900 transition-[width] duration-200"
            style={{ width: `${((Math.min(stepIndex, MORNING_CAPTURE_FIELDS.length) / MORNING_CAPTURE_FIELDS.length) * 100).toFixed(0)}%` }}
          />
        </div>

        {!isReviewStep && currentField ? (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{currentField.label}</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-900">{currentField.prompt}</h1>
            <p className="mt-2 text-sm text-slate-600">{currentField.helper}</p>

            <div className="mt-6 rounded-3xl border border-slate-300 bg-white p-4 shadow-sm">
              <input
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitTyped();
                  }
                }}
                inputMode={currentField.inputMode}
                placeholder={currentField.placeholder}
                className="w-full border-none bg-transparent text-center text-5xl font-semibold tracking-tight text-slate-900 outline-none placeholder:text-slate-300"
                aria-label={currentField.label}
              />
            </div>

            <div className="mt-4 flex items-center justify-between text-xs">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-slate-700">
                {voiceStatus === "listening" || voiceStatus === "processing" ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                {voiceStatus === "listening"
                  ? "Listening"
                  : voiceStatus === "processing"
                    ? "Processing"
                    : voiceStatus === "unsupported"
                      ? "Voice unsupported"
                      : voiceStatus === "denied"
                        ? "Voice blocked"
                        : voiceStatus === "error"
                          ? "Voice error"
                          : "Voice ready"}
              </div>
              <button
                type="button"
                onClick={() => setListenNonce((prev) => prev + 1)}
                disabled={!voiceSupported || voiceStatus === "denied"}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-slate-700 disabled:opacity-50"
              >
                Retry voice
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Review</p>
            <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-900">Confirm morning report</h1>
            <p className="mt-2 text-sm text-slate-600">
              {completedCount} values captured. Edit any field before saving if needed.
            </p>
            <div className="mt-4 space-y-2">
              {MORNING_CAPTURE_FIELDS.map((field, index) => {
                const value = metrics[field.key];
                return (
                  <button
                    key={field.key}
                    type="button"
                    onClick={() => setStepIndex(index)}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-left"
                  >
                    <span className="text-sm text-slate-700">{field.label}</span>
                    <span className="text-sm font-medium text-slate-900">{value == null ? "Skipped" : value}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {stepError ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{stepError}</p> : null}
        {message ? <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">{message}</p> : null}
      </div>

      <div className="mt-6 space-y-3">
        {undoState ? (
          <button
            type="button"
            onClick={undoPrevious}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            <Undo2 className="h-3.5 w-3.5" />
            Undo previous
          </button>
        ) : null}

        {!isReviewStep ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={goToPreviousStep}
              disabled={stepIndex === 0}
              className="rounded-2xl border border-slate-300 px-3 py-3 text-sm text-slate-700 disabled:opacity-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => applyValue(null, "skip")}
              className="inline-flex items-center justify-center gap-1 rounded-2xl border border-slate-300 px-3 py-3 text-sm text-slate-700"
            >
              <SkipForward className="h-4 w-4" />
              Skip
            </button>
            <button
              type="button"
              onClick={submitTyped}
              className="inline-flex items-center justify-center gap-1 rounded-2xl bg-slate-900 px-3 py-3 text-sm font-medium text-white"
            >
              Next
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submitMorningReport()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? "Saving..." : "Save morning report"}
          </button>
        )}

        <div className="text-center">
          <Link href="/wellness" className="text-xs text-slate-500 underline">
            Exit capture
          </Link>
        </div>
      </div>
    </div>
  );
}
