import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import analyzeRoutes from "./routes/analyze.ts";
import reportsRoutes from "./routes/reports.ts";
import { callChatCompletion, callJsonCompletion, stripCodeFences } from "./lib/llm.ts";
import { resolveApp } from "./lib/crawler/resolveApp.ts";
import { createReport } from "./lib/db/index.ts";
import { runReport } from "./lib/crawler/runReport.ts";
import { nowUnix } from "./lib/crawler/util.ts";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8080);

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type UnderstandAnswerValue = string | string[] | boolean | null;

type ClarifyQuestion = {
  key: string;
  type: "single_select" | "multi_select" | "text" | "boolean";
  question: string;
  choices: string[];
  recommended: string | null;
  allow_other: boolean;
};

type ClarifyStep = {
  step_id: string;
  title: string;
  question: ClarifyQuestion;
};

type UnderstoodIntent = {
  subject: string;
  market: string;
  competitors: string[];
  audience: string;
  objective: string;
  focus: string;
  data_sources: string[];
  filters: {
    time_range: string;
    sentiment: string;
    keywords: string[];
  };
};

type ResolvedApp = {
  name: string;
  playId: string | null;
  appStoreId: string | null;
  iconUrl: string | null;
  verified: boolean;
};

type UnderstandSession = {
  query: string;
  answers: Record<string, UnderstandAnswerValue>;
};

function debugLog(label: string, payload?: unknown) {
  if (payload === undefined) {
    console.log(`[voc-debug] ${label}`);
    return;
  }
  console.log(`[voc-debug] ${label}`, payload);
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

const understandSessions = new Map<string, UnderstandSession>();

const STEP_TITLES: Record<string, string> = {
  role: "Your Role",
  subject: "Target Product",
  focus: "Research Focus",
  objective: "Objective",
  competitors: "Competitors",
  market: "Market",
  time_range: "Time Range",
  data_sources: "Sources",
  sentiment: "Sentiment",
  keywords: "Keywords",
};

const QUESTION_KEY_ALIASES: Record<string, string> = {
  "filters.time_range": "time_range",
  "filters.sentiment": "sentiment",
  "filters.keywords": "keywords",
};

const SOURCE_LABELS: Record<string, string> = {
  app_store: "App Store",
  google_play: "Google Play",
  youtube: "YouTube",
  tinhte: "Tinhte",
  voz: "Voz",
  reddit: "Reddit",
};

const SOURCE_KEYWORDS: Array<{ id: string; patterns: string[] }> = [
  { id: "app_store", patterns: ["app store"] },
  { id: "google_play", patterns: ["google play", "play store", "play reviews"] },
  { id: "youtube", patterns: ["youtube"] },
  { id: "tinhte", patterns: ["tinhte"] },
  { id: "voz", patterns: ["voz"] },
  { id: "reddit", patterns: ["reddit"] },
];

function createSessionId() {
  return `understand-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function dedupeStrings(values: unknown[]) {
  const out: string[] = [];
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || out.includes(trimmed)) {
      return;
    }
    out.push(trimmed);
  });
  return out;
}

function sanitizeSubjectName(value: string) {
  return value
    .replace(/^(analyse|analyze|benchmark|compare|review|scan|research)\s+/i, "")
    .replace(/\s+(for|vs)\s+.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeQuestionKey(value: unknown) {
  if (typeof value !== "string") {
    return "unknown";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "unknown";
  }
  return QUESTION_KEY_ALIASES[trimmed] ?? trimmed;
}

function humanizeStepTitle(key: string) {
  const canonical = normalizeQuestionKey(key);
  if (STEP_TITLES[canonical]) {
    return STEP_TITLES[canonical];
  }
  return canonical
    .split(".")
    .pop()
    ?.split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || canonical;
}

function normalizeQuestion(raw: any): ClarifyQuestion {
  const key = normalizeQuestionKey(
    typeof raw?.key === "string" ? raw.key : typeof raw?.id === "string" ? raw.id.replace(/^q_/, "") : "unknown"
  );
  const rawChoices = Array.isArray(raw?.choices) ? raw.choices.filter((choice: unknown) => typeof choice === "string") : [];
  const choices = rawChoices
    .map((choice: string) => choice.trim())
    .filter((choice: string) => choice && !/^other\b/i.test(choice) && !/^suggest another\b/i.test(choice))
    .slice(0, 3);
  const inferredType =
    raw?.type === "multi_select" || key === "competitors"
      ? "multi_select"
      : raw?.type === "boolean"
      ? "boolean"
      : raw?.type === "single_select"
      ? "single_select"
      : raw?.type === "text"
      ? "text"
      : choices.length > 0
      ? "single_select"
      : "text";

  return {
    key,
    type: inferredType,
    question: typeof raw?.question === "string" && raw.question.trim() ? raw.question.trim() : `Please clarify ${key}.`,
    choices,
    recommended: typeof raw?.recommended === "string" && raw.recommended.trim() ? raw.recommended.trim() : choices[0] ?? null,
    allow_other: raw?.allow_other !== false,
  };
}

function stepsFromQuestions(questions: any[]): ClarifyStep[] {
  return questions
    .map((question) => normalizeQuestion(question))
    .filter((question) => question.key && question.key !== "unknown")
    .map((question) => ({
      step_id: question.key,
      title: humanizeStepTitle(question.key),
      question,
    }));
}

function buildLegacyClarifyPayload(query: string, parsed: any) {
  const suggestedQuestions = Array.isArray(parsed?.suggestedQuestions) ? parsed.suggestedQuestions : [];
  const steps = stepsFromQuestions(
    suggestedQuestions.map((question: any) => ({
      ...question,
      key:
        typeof question?.key === "string"
          ? question.key
          : typeof question?.id === "string"
          ? question.id.replace(/^q_/, "")
          : undefined,
    }))
  );

  if (!steps.find((step) => step.step_id === "subject")) {
    steps.unshift({
      step_id: "subject",
      title: STEP_TITLES.subject,
      question: {
        key: "subject",
        type: "text",
        question: "Which company or product do you want to research?",
        choices: [],
        recommended: typeof parsed?.primaryProduct === "string" ? parsed.primaryProduct : query,
        allow_other: true,
      },
    });
  }

  return {
    response_type: "CLARIFICATION_REQUIRED",
    payload: {
      suggestedQuestions: steps.map((step) => step.question),
    },
  };
}

function normalizeIntent(raw: any): UnderstoodIntent {
  const filters = raw?.filters && typeof raw.filters === "object" ? raw.filters : {};
  return {
    subject: typeof raw?.subject === "string" ? raw.subject : "",
    market: typeof raw?.market === "string" && raw.market.trim() ? raw.market : "Vietnam",
    competitors: dedupeStrings(Array.isArray(raw?.competitors) ? raw.competitors : []),
    audience: typeof raw?.audience === "string" ? raw.audience : "",
    objective: typeof raw?.objective === "string" ? raw.objective : "",
    focus: typeof raw?.focus === "string" ? raw.focus : "",
    data_sources: dedupeStrings(Array.isArray(raw?.data_sources) ? raw.data_sources : []),
    filters: {
      time_range: typeof filters?.time_range === "string" ? filters.time_range : "last_90_days",
      sentiment: typeof filters?.sentiment === "string" ? filters.sentiment : "all",
      keywords: dedupeStrings(Array.isArray(filters?.keywords) ? filters.keywords : []),
    },
  };
}

function unwrapArbitraryAgentPayload(raw: any): any {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const values = Object.values(raw).filter((value) => value && typeof value === "object" && !Array.isArray(value));
  if (values.length === 1) {
    return values[0];
  }
  return raw;
}

function coerceSourceIds(values: unknown[]) {
  const found = new Set<string>();
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const normalized = value.toLowerCase();
    SOURCE_KEYWORDS.forEach((source) => {
      if (source.patterns.some((pattern) => normalized.includes(pattern))) {
        found.add(source.id);
      }
    });
  });
  return Array.from(found);
}

function extractFallbackIntent(raw: any, query: string, answers: Record<string, UnderstandAnswerValue>): UnderstoodIntent {
  const payload = unwrapArbitraryAgentPayload(raw) || {};
  const methodology = payload?.methodology && typeof payload.methodology === "object" ? payload.methodology : {};
  const context = payload?.context && typeof payload.context === "object" ? payload.context : {};
  const scope = payload?.benchmarking_scope && typeof payload.benchmarking_scope === "object" ? payload.benchmarking_scope : {};
  const rawSources = [
    ...(Array.isArray(payload?.data_sources) ? payload.data_sources : []),
    ...(Array.isArray(methodology?.data_sources) ? methodology.data_sources : []),
    ...(Array.isArray(payload?.simulated_data_sources) ? payload.simulated_data_sources : []),
    ...(Array.isArray(answers?.data_sources) ? answers.data_sources : []),
  ];
  const inferredSources = coerceSourceIds(rawSources);
  const competitors = dedupeStrings([
    ...(Array.isArray(scope?.competitors) ? scope.competitors : []),
    ...(Array.isArray(payload?.competitors) ? payload.competitors : []),
    ...(Array.isArray(answers?.competitors) ? answers.competitors : []),
  ]);

  const explicitSubject = typeof answers?.subject === "string" && answers.subject.trim() ? sanitizeSubjectName(answers.subject.trim()) : null;
  const payloadSubject =
    (typeof payload?.subject === "string" && sanitizeSubjectName(payload.subject.trim())) ||
    (typeof context?.target_product === "string" && sanitizeSubjectName(context.target_product.trim())) ||
    (typeof payload?.target_product === "string" && sanitizeSubjectName(payload.target_product.trim())) ||
    sanitizeSubjectName(query);

  const explicitDataSources = dedupeStrings(Array.isArray(answers?.data_sources) ? answers.data_sources : []);
  const mergedSources = explicitDataSources.length > 0 ? explicitDataSources : dedupeStrings(["google_play", "app_store", ...inferredSources]);

  return {
    subject: explicitSubject || payloadSubject || sanitizeSubjectName(query),
    market:
      (typeof answers?.market === "string" && answers.market.trim()) ||
      (typeof context?.industry === "string" && context.industry.trim()) ||
      "Vietnam",
    competitors,
    audience:
      (typeof answers?.role === "string" && answers.role.trim()) ||
      (typeof payload?.audience === "string" && payload.audience.trim()) ||
      "Product team",
    objective:
      (typeof answers?.objective === "string" && answers.objective.trim()) ||
      (typeof payload?.primary_objective === "string" && payload.primary_objective.trim()) ||
      query,
    focus:
      (typeof answers?.focus === "string" && answers.focus.trim()) ||
      (Array.isArray(payload?.key_focus_areas) ? dedupeStrings(payload.key_focus_areas).slice(0, 3).join(", ") : "") ||
      (Array.isArray(payload?.key_investigation_areas)
        ? dedupeStrings(payload.key_investigation_areas.map((item: any) => item?.product_domain).filter(Boolean)).slice(0, 3).join(", ")
        : ""),
    data_sources: mergedSources.length > 0 ? mergedSources : ["app_store", "google_play"],
    filters: {
      time_range: typeof answers?.time_range === "string" && answers.time_range.trim() ? answers.time_range : "last_90_days",
      sentiment: typeof answers?.sentiment === "string" && answers.sentiment.trim() ? answers.sentiment : "all",
      keywords: dedupeStrings(Array.isArray(answers?.keywords) ? answers.keywords : []),
    },
  };
}

function buildFallbackClarifyEnvelope(query: string, raw: any) {
  const intent = extractFallbackIntent(raw, query, {});
  return {
    response_type: "CLARIFICATION_REQUIRED",
    payload: {
      reason: "I want to lock the research setup before generating the report.",
      suggestedQuestions: [
        {
          key: "subject",
          type: "text",
          question: "Which app or company should we analyze first?",
          choices: [],
          recommended: intent.subject || sanitizeSubjectName(query),
          allow_other: true,
        },
        {
          key: "role",
          type: "single_select",
          question: "Who is the main audience for this report?",
          choices: ["Product Manager", "QA Lead", "Marketing Lead"],
          recommended: "Product Manager",
          allow_other: true,
        },
        {
          key: "focus",
          type: "single_select",
          question: "What should we focus on first?",
          choices: ["General", "Payments", "Login"],
          recommended: "General",
          allow_other: true,
        },
        {
          key: "competitors",
          type: "multi_select",
          question: "Which competitors should we compare against?",
          choices: intent.competitors.slice(0, 3),
          recommended: intent.competitors[0] ?? null,
          allow_other: true,
        },
        {
          key: "time_range",
          type: "single_select",
          question: "Which review window should we analyze?",
          choices: ["last_30_days", "last_90_days", "last_7_days"],
          recommended: "last_90_days",
          allow_other: false,
        },
        {
          key: "data_sources",
          type: "multi_select",
          question: "Which sources should we prioritize?",
          choices: ["google_play", "app_store", "youtube"],
          recommended: "google_play",
          allow_other: true,
        },
      ],
    },
  };
}

function buildFallbackConfirmEnvelope(query: string, raw: any, answers: Record<string, UnderstandAnswerValue>) {
  const intent = extractFallbackIntent(raw, query, answers);
  const resolvedApps = dedupeStrings([intent.subject, ...intent.competitors]).map((name) => ({ name }));
  return {
    response_type: "PLAN_CONFIRMATION",
    payload: {
      intent,
      resolved_apps: resolvedApps,
      plan: {
        summary: `Analyze ${intent.subject} for ${intent.audience} with focus on ${intent.focus || "general feedback"} across ${intent.data_sources.map((id) => SOURCE_LABELS[id] || id).join(", ")}.`,
      },
    },
  };
}

function buildUnderstandPrompt(query: string, answers: Record<string, UnderstandAnswerValue>) {
  const answerLines = Object.entries(answers).map(([key, value]) => {
    if (Array.isArray(value)) {
      return `${key}: ${value.join(", ")}`;
    }
    if (typeof value === "boolean") {
      return `${key}: ${value ? "yes" : "no"}`;
    }
    return `${key}: ${value ?? ""}`;
  });

  return [
    `New VoC research request: "${query}".`,
    "Use the reasoning-and-understanding skill.",
    "Return JSON only.",
    answerLines.length > 0 ? `Known answers:\n${answerLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function resolveAndVerifyApp(name: string, fromAgent?: any): Promise<ResolvedApp> {
  const resolved = await resolveApp(name);
  return {
    name: resolved.name,
    playId: resolved.playId ?? (typeof fromAgent?.playId === "string" ? fromAgent.playId : null),
    appStoreId: resolved.appStoreId ?? (typeof fromAgent?.appStoreId === "string" ? fromAgent.appStoreId : null),
    iconUrl: resolved.iconUrl ?? (typeof fromAgent?.iconUrl === "string" ? fromAgent.iconUrl : null),
    verified: resolved.verified || Boolean(fromAgent?.playId || fromAgent?.appStoreId),
  };
}

async function handleUnderstand(req: express.Request, res: express.Response) {
  const { query, answers, session_id } = req.body || {};
  const incomingAnswers =
    answers && typeof answers === "object" && !Array.isArray(answers)
      ? (answers as Record<string, UnderstandAnswerValue>)
      : {};

  let sessionId = typeof session_id === "string" && session_id.trim() ? session_id : createSessionId();
  const previous = understandSessions.get(sessionId);
  const sessionQuery =
    typeof query === "string" && query.trim()
      ? query.trim()
      : previous?.query?.trim()
      ? previous.query.trim()
      : "";

  if (!sessionQuery) {
    return res.status(400).json({ phase: "error", message: "Query is required" });
  }

  const mergedAnswers = { ...(previous?.answers ?? {}), ...incomingAnswers };
  understandSessions.set(sessionId, { query: sessionQuery, answers: mergedAnswers });

  try {
    const content = buildUnderstandPrompt(sessionQuery, mergedAnswers);
    debugLog("understand:start", {
      sessionId,
      query: sessionQuery,
      answers: mergedAnswers,
    });

    const completion = await callChatCompletion(
      [
        {
          role: "user",
          content,
        },
      ],
      {
        user: sessionId,
      }
    );

    debugLog("understand:raw_completion", completion.text);

    const parsed = JSON.parse(stripCodeFences(completion.text) || "{}");
    const arbitraryPayload = unwrapArbitraryAgentPayload(parsed);
    let envelope: any = null;
    if (parsed?.response_type && parsed?.payload) {
      envelope = parsed;
    } else if (Array.isArray(parsed?.suggestedQuestions)) {
      envelope = buildLegacyClarifyPayload(sessionQuery, parsed);
    } else if (Object.keys(mergedAnswers).length === 0) {
      envelope = buildFallbackClarifyEnvelope(sessionQuery, arbitraryPayload);
    } else {
      envelope = buildFallbackConfirmEnvelope(sessionQuery, arbitraryPayload, mergedAnswers);
    }

    if (envelope.response_type === "CLARIFICATION_REQUIRED") {
      const steps = stepsFromQuestions(envelope?.payload?.suggestedQuestions ?? []);
      return res.json({
        phase: "clarify",
        session_id: sessionId,
        reason: typeof envelope?.payload?.reason === "string" ? envelope.payload.reason : null,
        steps,
      });
    }

    if (envelope.response_type === "PLAN_CONFIRMATION") {
      const intent = normalizeIntent(envelope?.payload?.intent);
      const uniqueNames = dedupeStrings([intent.subject, ...(intent.competitors ?? [])]);
      const resolvedFromAgent = Array.isArray(envelope?.payload?.resolved_apps) ? envelope.payload.resolved_apps : [];
      const apps = (
        await Promise.all(
          uniqueNames.map((name) =>
            resolveAndVerifyApp(
              name,
              resolvedFromAgent.find((app: any) => typeof app?.name === "string" && app.name.toLowerCase() === name.toLowerCase())
            )
          )
        )
      ).filter((app) => app.verified);

      return res.json({
        phase: "confirm",
        session_id: sessionId,
        intent,
        apps,
        summary: typeof envelope?.payload?.plan?.summary === "string" ? envelope.payload.plan.summary : "",
      });
    }

    if (envelope.response_type === "ERROR") {
      return res.status(400).json({
        phase: "error",
        message: envelope?.error?.message || "Task-understanding failed.",
      });
    }

    return res.status(502).json({
      phase: "error",
      message: "Task-understanding returned an unsupported envelope.",
    });
  } catch (error: any) {
    console.error("[voc-debug] understand failed:", error);
    return res.status(502).json({
      phase: "error",
      message: "Task-understanding request failed.",
      details: error?.message || "Unknown upstream error",
    });
  }
}

app.post("/api/understand", handleUnderstand);
app.post("/api/prepare_confirmation", handleUnderstand);

// 2. API: Classify user instructions and fetch answers or block mutations
app.post("/api/classify", async (req, res) => {
  const { message, companies = [], filters = {}, summaryText = "No summary data" } = req.body;

  try {
    const prompt = `User Message: "${message}"

Active Companies: ${JSON.stringify(companies)}
Current Filters: ${JSON.stringify(filters)}
Current active reports summarized text: ${summaryText}

Classify the user intent into one or more actions (ASK, ADD_BLOCK, REMOVE_BLOCK, ADD_COMPANY, REMOVE_COMPANY, FILTER, ADD_CUSTOM_BLOCK).
Return a JSON array of actions as specified.`;

    const actions = await callJsonCompletion([
      {
        role: "system",
        content: `You are an intent classifier and expert fintech product researcher for a market review analytics dashboard.
Given the user's message, classify the user intent into a list of actions.
Supported action types:
  - ASK: For informational questions or follow-ups. You MUST return payload.answer (analytical 2-3 sentence summary) and payload.citations (array of 2-3 specific simulated review items with "source" and "text" reflecting user complaints on active products). If the question mentions specific complaints like "refund" or "login", search the context and provide realistic matched citations like "[Google Play Review]" or "[App Store Review]".
  - ADD_COMPANY: When user wants to include another company, competitor, or app to compare (e.g. "Add ZaloPay to compare"). Return payload.company_name with the requested app name (e.g. "ZaloPay").
  - REMOVE_COMPANY: When user requests to remove or delete a company. Return payload.company_name.
  - ADD_CUSTOM_BLOCK: When user wants to modify their dashboard to add custom analytics, custom chart topic, or customized KPI monitoring (e.g. "Add a chart for refund complaints over time"). Return payoad.custom_block_title (e.g. "Refund complaints over time") and payload.custom_block_prompt (instructions for building this specialized analysis block).
  - ADD_BLOCK or REMOVE_BLOCK: To toggle native blocks. Available block IDs: metrics, insights, sentiment_pie, topic_bar, trend, actions
  - FILTER: Set filter values. filter_key is "sentiment" or "dateRange".

Return only valid JSON matching this shape with no markdown:
[
  {
    "type": "ASK" | "ADD_BLOCK" | "REMOVE_BLOCK" | "ADD_COMPANY" | "REMOVE_COMPANY" | "FILTER" | "ADD_CUSTOM_BLOCK",
    "payload": {
      "block_id"?: string,
      "company_name"?: string,
      "filter_key"?: string,
      "filter_value"?: string,
      "answer"?: string,
      "custom_block_title"?: string,
      "custom_block_prompt"?: string,
      "citations"?: [{ "source": string, "text": string }]
    }
  }
]`,
      },
      {
        role: "user",
        content: prompt,
      },
    ]) as any[];

    // For any ADD_COMPANY actions, we pre-fetch the data first so the client can receive it directly!
    const updatedData: { [name: string]: any } = {};
    const updatedReports: { [name: string]: string } = {};
    for (const action of actions) {
      if (action.type === "ADD_COMPANY" && action.payload?.company_name) {
        const cName = action.payload.company_name;
        const reportId = `adhoc-${cName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
        await createReport({
          id: reportId,
          apps: [cName],
          goal: "adhoc_compare",
          focus_area: null,
          status: "pending",
          created_at: nowUnix(),
          company_data: { data: {}, market: null },
        });
        const result = await runReport(reportId, [cName], "adhoc_compare", undefined, 90);
        if (result.data[cName]) {
          updatedData[cName] = result.data[cName];
          updatedReports[cName] = reportId;
        }
      }
    }

    res.json({ actions, updatedData, updatedReports });
  } catch (error: any) {
    console.error("Classifier error:", error);
    res.status(500).json({ error: error.message || "Classifier pipeline failed" });
  }
});

// 3. API: Generate Custom AI Analysis Block dynamically
app.post("/api/generate_custom_block", async (req, res) => {
  const { title, prompt, companies = [] } = req.body;
  if (!title || !prompt) {
    return res.status(400).json({ error: "Title and prompt are required" });
  }

  try {
    console.log(`Generating custom AI block for [${title}] with instructions: "${prompt}"`);
    const aiPrompt = `We are adding a new analysis block to our market research dashboard comparing multiple products.
Block Title: "${title}"
Specific Topic/Instructions: "${prompt}"
Compared Products: ${JSON.stringify(companies)}

Please analyze customer feedback, public app store reviews, and topic trends specifically for the given block title and instructions. 
For each compared product, generate:
1. An estimated category rating from 1.0 to 5.0 indicating customer satisfaction regarding this specific theme.
2. A severity level: "high" (serious critical issues), "medium" (concerning bugs), or "low" (minor friction).
3. A concise, professional summary (1-2 sentences) of reviewer comments or common problems.
4. Exactly 2 detailed bullet-point customer-feedback observations.

Make sure the information is highly realistic and tailored specifically to the compared products. Ensure complete JSON response.`;

    const parsed = await callJsonCompletion([
      {
        role: "system",
        content:
          "You generate realistic dashboard comparison blocks. Return valid JSON only with keys title and data.",
      },
      {
        role: "user",
        content: `${aiPrompt}

Return strict JSON:
{
  "title": string,
  "data": {
    ${companies.map((company) => `"${company}": { "rating": number, "severity": "high" | "medium" | "low", "summary": string, "points": [string, string] }`).join(",\n    ")}
  }
}`,
      },
    ]);
    res.json(parsed);
  } catch (error: any) {
    console.error("Custom block generation failed:", error);
    res.status(500).json({ error: error.message || "Failed to generate custom AI block" });
  }
});

app.use(analyzeRoutes);
app.use(reportsRoutes);

// Vite Middleware Setup or Production Serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
