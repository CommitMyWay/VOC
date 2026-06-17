import { insertReference, query } from "../db/index.ts";
import type { CompanyData } from "./types.ts";
import { makeId } from "./util.ts";

function toPercent(part: number, total: number) {
  if (!total) {
    return 0;
  }
  return Math.round((part / total) * 100);
}

export async function buildMetrics(reportId: string, appName: string): Promise<CompanyData> {
  const reviewCountResult = await query<{ count: string; avg_rating: string | null }>(
    `SELECT CAST(COUNT(*) AS TEXT) as count, CAST(AVG(COALESCE(rating, 0)) AS TEXT) as avg_rating
     FROM reviews
     WHERE report_id = $1 AND app = $2`,
    [reportId, appName]
  );
  const reviewCountRow = reviewCountResult.rows[0];
  const reviewCount = Number(reviewCountRow?.count || 0);
  const rating = reviewCountRow?.avg_rating && Number(reviewCountRow.avg_rating) > 0 ? Number(Number(reviewCountRow.avg_rating).toFixed(1)) : 0;

  const sentimentsResult = await query<{ sentiment: "positive" | "neutral" | "negative"; count: string }>(
    `SELECT c.sentiment as sentiment, CAST(COUNT(*) AS TEXT) as count
     FROM classifications c
     JOIN reviews r ON r.id = c.review_id
     WHERE r.report_id = $1 AND r.app = $2
     GROUP BY c.sentiment`,
    [reportId, appName]
  );
  const sentimentMap = Object.fromEntries(sentimentsResult.rows.map((row) => [row.sentiment, Number(row.count)]));

  const topicsResult = await query<{ topic: string; count: string }>(
    `SELECT c.topic as topic, CAST(COUNT(*) AS TEXT) as count
     FROM classifications c
     JOIN reviews r ON r.id = c.review_id
     WHERE r.report_id = $1 AND r.app = $2
     GROUP BY c.topic
     ORDER BY COUNT(*) DESC
     LIMIT 8`,
    [reportId, appName]
  );
  const topicCounts = Object.fromEntries(topicsResult.rows.map((row) => [row.topic, Number(row.count)]));

  const trendResult = await query<{ day: string; negative_count: string; total_count: string }>(
    `SELECT CAST(strftime('%s', date(datetime(published_at, 'unixepoch'))) AS TEXT) as day,
            CAST(SUM(CASE WHEN c.sentiment = 'negative' THEN 1 ELSE 0 END) AS TEXT) as negative_count,
            CAST(COUNT(*) AS TEXT) as total_count
     FROM reviews r
     JOIN classifications c ON c.review_id = r.id
     WHERE r.report_id = $1 AND r.app = $2 AND r.published_at IS NOT NULL
     GROUP BY date(datetime(published_at, 'unixepoch'))
     ORDER BY day DESC
     LIMIT 30`,
    [reportId, appName]
  );
  const trendData = trendResult.rows.reverse().map((row) => toPercent(Number(row.negative_count), Number(row.total_count)));

  const evidenceResult = await query<{ topic: string; review_id: string }>(
    `SELECT c.topic as topic, r.id as review_id
     FROM classifications c
     JOIN reviews r ON r.id = c.review_id
     WHERE r.report_id = $1 AND r.app = $2 AND c.sentiment = 'negative'
     ORDER BY c.confidence DESC, COALESCE(r.rating, 5) ASC
     LIMIT 12`,
    [reportId, appName]
  );

  await Promise.all(
    evidenceResult.rows.map((row, index) =>
      insertReference({
        id: makeId(reportId, row.review_id, index),
        report_id: reportId,
        review_id: row.review_id,
        topic: row.topic,
        rank: index + 1,
      })
    )
  );

  return {
    rating,
    reviewCount,
    sentimentBreakdown: {
      pos: toPercent(Number(sentimentMap.positive || 0), reviewCount),
      neu: toPercent(Number(sentimentMap.neutral || 0), reviewCount),
      neg: toPercent(Number(sentimentMap.negative || 0), reviewCount),
    },
    topicCounts,
    trendData,
    insights: [],
    actions: {
      PO: [],
      QA: [],
      Marketing: [],
    },
  };
}
