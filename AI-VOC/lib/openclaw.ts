import { callJsonCompletion } from "./llm.ts";
import { readEnv } from "./env.ts";
import type { CompanyData, MarketView } from "./crawler/types.ts";

type InsightResponse = {
  insights: Array<{ topic: string; severity: "high" | "medium" | "low"; text: string }>;
  actions: { PO: string[]; QA: string[]; Marketing: string[] };
};

function normalizeInsightResponse(body: any): InsightResponse | null {
  if (!Array.isArray(body?.insights) || !body?.actions) {
    return null;
  }

  const insights = body.insights
    .map((item: any, index: number) => {
      if (typeof item === "string") {
        return {
          topic: "General",
          severity: index === 0 ? "high" : index === 1 ? "medium" : "low",
          text: item,
        };
      }

      if (item && typeof item.text === "string") {
        return {
          topic: typeof item.topic === "string" && item.topic.trim() ? item.topic : "General",
          severity: item.severity === "high" || item.severity === "medium" || item.severity === "low" ? item.severity : "medium",
          text: item.text,
        };
      }

      return null;
    })
    .filter(Boolean) as InsightResponse["insights"];

  const actions = body.actions;
  return {
    insights,
    actions: {
      PO: Array.isArray(actions.PO) ? actions.PO.filter((item: any) => typeof item === "string") : [],
      QA: Array.isArray(actions.QA) ? actions.QA.filter((item: any) => typeof item === "string") : [],
      Marketing: Array.isArray(actions.Marketing) ? actions.Marketing.filter((item: any) => typeof item === "string") : [],
    },
  };
}

function fallbackInsights(metrics: CompanyData): InsightResponse {
  const topTopics = Object.entries(metrics.topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    insights: topTopics.map(([topic, count], index) => ({
      topic,
      severity: index === 0 ? "high" : index === 1 ? "medium" : "low",
      text: `${topic} appears in ${count} classified reviews and is shaping current sentiment most strongly.`,
    })),
    actions: {
      PO: topTopics.slice(0, 2).map(([topic]) => `Prioritize product fixes for ${topic.toLowerCase()} friction in the next sprint.`),
      QA: topTopics.slice(0, 2).map(([topic]) => `Add regression coverage around ${topic.toLowerCase()} scenarios mentioned by customers.`),
      Marketing: [
        "Avoid amplifying unstable journeys in campaigns until sentiment improves.",
        "Highlight the most positively reviewed flows once stability is confirmed.",
      ],
    },
  };
}

export async function callAgent(payload: {
  app: string;
  goal: string;
  focusArea?: string;
  metrics: CompanyData;
  evidence: Array<{ source: string; content: string; rating: number | null }>;
  market?: MarketView | null;
}): Promise<InsightResponse> {
  const openclawUrl = readEnv("OPENCLAW_URL");
  const openclawToken = readEnv("OPENCLAW_TOKEN");

  if (openclawUrl) {
    console.log("[insight] calling openclaw", {
      app: payload.app,
      goal: payload.goal,
      focusArea: payload.focusArea ?? null,
      evidenceCount: payload.evidence.length,
      marketIncluded: Boolean(payload.market),
    });
    try {
      const response = await fetch(openclawUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(openclawToken ? { Authorization: `Bearer ${openclawToken}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`OpenClaw failed with status ${response.status}`);
      }
      const body = await response.json();
      const normalized = normalizeInsightResponse(body);
      if (normalized) {
        console.log("[insight] openclaw response accepted", {
          app: payload.app,
          insightCount: normalized.insights.length,
        });
        return normalized;
      }
      console.warn("[insight] openclaw response could not be normalized", {
        app: payload.app,
      });
    } catch (error) {
      console.warn("[insight] openclaw call failed, falling back to direct llm", {
        app: payload.app,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    console.log("[insight] calling direct llm fallback", {
      app: payload.app,
      evidenceCount: payload.evidence.length,
    });
    const result = await callJsonCompletion([
      {
        role: "system",
        content:
          "You turn verified review metrics into concise product insights. Return strict JSON with keys insights and actions. Keep actions grounded in the evidence.",
      },
      {
        role: "user",
        content: JSON.stringify(payload),
      },
    ]);

    const normalized = normalizeInsightResponse(result);
    if (normalized) {
      console.log("[insight] direct llm response accepted", {
        app: payload.app,
        insightCount: normalized.insights.length,
      });
      return normalized;
    }
    console.warn("[insight] direct llm response could not be normalized", {
      app: payload.app,
    });
  } catch (error) {
    console.warn("[insight] direct llm call failed, using deterministic fallback", {
      app: payload.app,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  console.log("[insight] using deterministic fallback", {
    app: payload.app,
  });
  return fallbackInsights(payload.metrics);
}
