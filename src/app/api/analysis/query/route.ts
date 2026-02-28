import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type OpenAIResult = { text: string; model: string; usage: Record<string, number> };

async function callOpenAI({
  system,
  user,
  model = "gpt-4o-mini",
  maxOutputTokens = 1200,
}: {
  system: string;
  user: string;
  model?: string;
  maxOutputTokens?: number;
}): Promise<OpenAIResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: user }] },
      ],
      max_output_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const output = payload.output as Array<Record<string, unknown>> | undefined;
  let text = "";
  if (Array.isArray(output)) {
    for (const block of output) {
      const content = block.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "output_text" && typeof part.text === "string") {
            text += part.text;
          }
        }
      }
    }
  }

  return {
    text: text.trim(),
    model: typeof payload.model === "string" ? payload.model : model,
    usage: typeof payload.usage === "object" && payload.usage ? (payload.usage as Record<string, number>) : {},
  };
}

const SYSTEM_PROMPT = `You are a wellness data analyst for a marathon runner. You have access to their longitudinal Garmin wellness data via SQL queries against a PostgreSQL database (Supabase).

## Available Tables

### wellness_daily_metrics
Columns: metric_date (date), resting_hr, hrv, hrv_status (text: BALANCED/LOW/UNBALANCED/HIGH), stress_avg, stress_high_min, body_battery_avg, body_battery_min, body_battery_max, bb_charged, bb_drained, steps, intensity_minutes, training_readiness, training_readiness_status (text), respiration_avg, spo2_avg, vo2_max, calories_total, calories_active, resting_hr_7d_avg, distance_km, recovery_hours, floors_up
- All numeric columns are nullable
- Data spans Sep 2021 to present (~1,610 days)
- Pre-2024 data may lack: hrv_status, training_readiness, training_readiness_status
- Filter: WHERE user_id = '{{USER_ID}}'

### wellness_sleep_sessions
Columns: sleep_date (date), total_sleep_min, sleep_score, sleep_quality (text: Excellent/Good/Fair/Poor), readiness_score, sleep_need_min, rem_sleep_min, deep_sleep_min, resting_hr, hrv
- All numeric columns are nullable
- Filter: WHERE user_id = '{{USER_ID}}'

### strava_activities
Columns: id, name, type (text), start_date (timestamptz), distance_m, moving_time_s, average_speed, average_heartrate, max_heartrate, suffer_score
- Filter: WHERE athlete_id = {{ATHLETE_ID}}

## Instructions

The user will ask questions about their wellness data in natural language. You must:

1. Generate a SQL query to answer their question
2. The query will be executed for you and results returned
3. Then provide a clear, concise analysis of the results

Respond with a JSON object:
{
  "sql": "SELECT ... (the SQL query to run)",
  "explanation": "Brief description of what this query does",
  "followUpQuestions": ["optional suggested follow-up questions"]
}

Rules:
- Always include the appropriate WHERE clause for user_id or athlete_id
- Use aggregation (AVG, percentiles, grouping) to summarize — avoid returning raw rows
- LIMIT results to at most 50 rows
- For time-series analysis, group by week or month, not individual days
- Use EXTRACT(YEAR FROM ...) and EXTRACT(MONTH FROM ...) for temporal grouping
- When computing correlations, use CORR() if available
- Format dates as text for readability
- Do NOT use subqueries that reference tables without the user_id/athlete_id filter
- Round numeric results to 1 decimal place`;

const ANALYSIS_PROMPT = `You are a wellness data analyst interpreting query results for a marathon runner.

Given the original question and query results, provide:
1. A clear, direct answer to their question
2. Key observations from the data
3. Any actionable insights or patterns

Be specific with numbers. Keep the response concise (3-6 sentences). Use plain language, not technical jargon.

Respond with a JSON object:
{
  "answer": "Your analysis here",
  "highlights": ["Key finding 1", "Key finding 2"],
  "followUpQuestions": ["Suggested follow-up 1", "Suggested follow-up 2"]
}`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { question: string; athleteId?: number };
  const { question, athleteId } = body;

  if (!question || typeof question !== "string") {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  try {
    // Step 1: Generate SQL from the question
    const systemWithIds = SYSTEM_PROMPT
      .replace("{{USER_ID}}", user.id)
      .replace("{{ATHLETE_ID}}", String(athleteId ?? 0));

    const sqlResult = await callOpenAI({
      system: systemWithIds,
      user: question,
      model: "gpt-4o-mini",
    });

    let parsed: { sql?: string; explanation?: string; followUpQuestions?: string[] };
    try {
      // Try to extract JSON from the response (may be wrapped in markdown code block)
      const jsonMatch = sqlResult.text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      return NextResponse.json({
        answer: "I couldn't generate a query for that question. Could you rephrase it?",
        highlights: [],
        followUpQuestions: [],
      });
    }

    if (!parsed.sql) {
      return NextResponse.json({
        answer: "I couldn't determine the right query for that question.",
        highlights: [],
        followUpQuestions: parsed.followUpQuestions ?? [],
      });
    }

    // Step 2: Execute the SQL query via Supabase RPC or direct query
    // Use the management API for read-only queries
    const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
      /https:\/\/([^.]+)\./,
    )?.[1];

    if (!accessToken || !projectRef) {
      return NextResponse.json({
        answer: "Database query service is not configured.",
        highlights: [],
        followUpQuestions: [],
        sql: parsed.sql,
        explanation: parsed.explanation,
      });
    }

    // Safety check: only allow SELECT queries
    const normalizedSql = parsed.sql.trim().toUpperCase();
    if (!normalizedSql.startsWith("SELECT") && !normalizedSql.startsWith("WITH")) {
      return NextResponse.json({
        answer: "I can only run read-only queries against your data.",
        highlights: [],
        followUpQuestions: [],
      });
    }

    const queryResponse = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: parsed.sql }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!queryResponse.ok) {
      const errText = await queryResponse.text().catch(() => "");
      return NextResponse.json({
        answer: `Query failed: ${errText.slice(0, 200)}. Try rephrasing your question.`,
        highlights: [],
        followUpQuestions: parsed.followUpQuestions ?? [],
        sql: parsed.sql,
        explanation: parsed.explanation,
      });
    }

    const queryResults = await queryResponse.json();

    // Step 3: Analyze the results
    const analysisResult = await callOpenAI({
      system: ANALYSIS_PROMPT,
      user: JSON.stringify({
        question,
        sql: parsed.sql,
        explanation: parsed.explanation,
        results: Array.isArray(queryResults) ? queryResults.slice(0, 50) : queryResults,
        resultCount: Array.isArray(queryResults) ? queryResults.length : 1,
      }),
      model: "gpt-4o-mini",
      maxOutputTokens: 800,
    });

    let analysis: { answer?: string; highlights?: string[]; followUpQuestions?: string[] };
    try {
      const jsonMatch = analysisResult.text.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    } catch {
      analysis = { answer: analysisResult.text };
    }

    return NextResponse.json({
      answer: analysis.answer ?? "Here are the results.",
      highlights: analysis.highlights ?? [],
      followUpQuestions: [
        ...(analysis.followUpQuestions ?? []),
        ...(parsed.followUpQuestions ?? []),
      ].slice(0, 4),
      sql: parsed.sql,
      explanation: parsed.explanation,
      resultCount: Array.isArray(queryResults) ? queryResults.length : 1,
    });
  } catch (err) {
    console.error("Analysis query error:", err);
    return NextResponse.json({
      answer: `Something went wrong: ${err instanceof Error ? err.message : "Unknown error"}`,
      highlights: [],
      followUpQuestions: [],
    });
  }
}
