import type { CompanyData, MarketView, ReportBlock, ReportPresentation } from "./types.ts";

type ThreadItem = Extract<ReportBlock, { id: "next_threads" }>["threads"][number];

function describeTopTopics(topicCounts: Record<string, number>) {
  return Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([topic, count]) => `${topic} (${count})`)
    .join(", ");
}

function buildThreads(apps: string[], data: Record<string, CompanyData>): ReportBlock {
  const threads: ThreadItem[] = [];

  apps.forEach((app) => {
    const company = data[app];
    if (!company) {
      return;
    }

    const topInsight = company.insights[0];
    if (topInsight && threads.length < 2) {
      threads.push({
        icon: topInsight.severity === "high" ? "🎯" : topInsight.severity === "medium" ? "⚠️" : "💬",
        title: `${app}: ${topInsight.topic} pressure point`,
        note: topInsight.text,
        prompt: `Show evidence behind this ${topInsight.topic.toLowerCase()} issue for ${app}.`,
      });
    }

    const topAction = company.actions.QA[0] || company.actions.PO[0] || company.actions.Marketing[0];
    if (topAction && threads.length < 3) {
      threads.push({
        icon: "🧪",
        title: `${app}: validate the top recommended fix`,
        note: topAction,
        prompt: `Why is this recommended action important for ${app}?`,
      });
    }
  });

  while (threads.length < 3) {
    threads.push({
      icon: "🔎",
      title: "Pull another thread from the evidence",
      note: "Ask the report chat to explain the strongest complaint cluster or compare the active apps.",
      prompt: "What is the strongest complaint cluster in this report?",
    });
  }

  return {
    id: "next_threads",
    type: "next_threads",
    threads: threads.slice(0, 3),
  };
}

export function buildReportPresentation(params: {
  query: string;
  apps: string[];
  data: Record<string, CompanyData>;
  market: MarketView | null;
}): ReportPresentation {
  const { query, apps, data, market } = params;
  const mainCompany = apps[0] || "Target app";
  const mainData = data[mainCompany];
  const rating = mainData?.rating ?? 0;
  const negativeShare = mainData?.sentimentBreakdown.neg ?? 0;
  const topTopics = mainData ? describeTopTopics(mainData.topicCounts) : "";
  const comparedApps = apps.length > 1 ? apps.join(", ") : mainCompany;
  const marketSummary =
    market && market.topTopics.length > 0
      ? `Across the current market cut, the most concentrated complaint areas are ${market.topTopics
          .slice(0, 3)
          .map((item) => `${item.topic} (${item.count})`)
          .join(", ")}.`
      : "";

  const companySituation = apps
    .map((app) => {
      const company = data[app];
      if (!company) {
        return `- ${app} is included in the current report.`;
      }
      return `- ${app} is currently tracking at ${company.rating.toFixed(1)}★ with ${company.sentimentBreakdown.neg}% negative sentiment across ${company.reviewCount.toLocaleString()} reviews.`;
    })
    .join("\n");

  const markdown = [
    `# ${query} is tracking at ${rating.toFixed(1)}★, while **${negativeShare}% negative sentiment** signals meaningful retention risk across the current evidence set.`,
    "",
    "{{block:evidence_kpis}}",
    "",
    "## The Situation",
    `${companySituation}`,
    "",
    "{{block:situation_overview}}",
    "",
    "## Why It's Happening",
    `${mainCompany} feedback is clustering around the sharpest complaint themes in the current report. ${topTopics ? `The heaviest topic concentration is ${topTopics}.` : ""} ${marketSummary}`.trim(),
    "",
    "{{block:topic_bar}}",
    "",
    "## Why It's Urgent",
    `The active comparison set in this brief is ${comparedApps}. Sentiment splits show where negative feedback is starting to outweigh neutral and positive signals, which is the clearest leading indicator of churn or support load.`,
    "",
    "{{block:sentiment_split}}",
    "",
    "## What We'd Do",
    `The current action set turns the strongest complaints into practical PO, QA, and marketing responses. These should be treated as the first response layer before expanding the analysis with custom blocks.`,
    "",
    "{{block:actions}}",
    "",
    "## Three Threads Worth Pulling Next",
    "{{block:next_threads}}",
  ].join("\n");

  return {
    brief_markdown: markdown,
    blocks: [
      { id: "evidence_kpis", type: "evidence_kpis" },
      { id: "situation_overview", type: "situation_overview" },
      { id: "topic_bar", type: "topic_bar" },
      { id: "sentiment_split", type: "sentiment_split" },
      { id: "actions", type: "actions" },
      buildThreads(apps, data),
    ],
  };
}
