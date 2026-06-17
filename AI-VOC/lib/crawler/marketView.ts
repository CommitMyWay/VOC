import { query } from "../db/index.ts";
import type { MarketView } from "./types.ts";

function toPercent(part: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

export async function buildMarketView(reportId: string): Promise<MarketView> {
  const overviewResult = await query<{ total_apps: string; total_reviews: string }>(
    `SELECT CAST(COUNT(DISTINCT app) AS TEXT) as total_apps, CAST(COUNT(*) AS TEXT) as total_reviews
     FROM reviews
     WHERE report_id = $1`,
    [reportId]
  );
  const overview = overviewResult.rows[0];

  const sentimentsResult = await query<{ sentiment: "positive" | "neutral" | "negative"; count: string }>(
    `SELECT c.sentiment as sentiment, CAST(COUNT(*) AS TEXT) as count
     FROM classifications c
     JOIN reviews r ON r.id = c.review_id
     WHERE r.report_id = $1
     GROUP BY c.sentiment`,
    [reportId]
  );
  const sentimentMap = Object.fromEntries(sentimentsResult.rows.map((row) => [row.sentiment, Number(row.count)]));

  const topTopicsResult = await query<{ topic: string; count: string }>(
    `SELECT c.topic as topic, CAST(COUNT(*) AS TEXT) as count
     FROM classifications c
     JOIN reviews r ON r.id = c.review_id
     WHERE r.report_id = $1
     GROUP BY c.topic
     ORDER BY COUNT(*) DESC
     LIMIT 10`,
    [reportId]
  );

  return {
    totalApps: Number(overview?.total_apps || 0),
    totalReviews: Number(overview?.total_reviews || 0),
    sentimentBreakdown: {
      pos: toPercent(Number(sentimentMap.positive || 0), Number(overview?.total_reviews || 0)),
      neu: toPercent(Number(sentimentMap.neutral || 0), Number(overview?.total_reviews || 0)),
      neg: toPercent(Number(sentimentMap.negative || 0), Number(overview?.total_reviews || 0)),
    },
    topTopics: topTopicsResult.rows.map((row) => ({ topic: row.topic, count: Number(row.count) })),
  };
}
