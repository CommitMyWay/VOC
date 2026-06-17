import { clearReferencesForReport, query, updateReport, updateReportData, withTransaction } from "../db/index.ts";
import { pipelineEvents } from "../events.ts";
import { callAgent } from "../openclaw.ts";
import { buildMetrics } from "./aggregate.ts";
import { buildReportPresentation } from "./brief.ts";
import { classifyReviews } from "./classify.ts";
import { fetchAllSources } from "./fetchAll.ts";
import { buildMarketView } from "./marketView.ts";
import type { CompanyData, MarketView, RawReview } from "./types.ts";
import { nowUnix } from "./util.ts";

async function fetchEvidence(reportId: string, app: string) {
  const result = await query<{ source: string; content: string; rating: number | null }>(
    `SELECT r.source as source, r.content as content, r.rating as rating
     FROM reviews r
     JOIN classifications c ON c.review_id = r.id
     WHERE r.report_id = $1 AND r.app = $2
     ORDER BY c.confidence DESC, COALESCE(r.rating, 5) ASC
     LIMIT 8`,
    [reportId, app]
  );
  return result.rows;
}

async function persistReviews(reportId: string, reviews: RawReview[]) {
  if (reviews.length === 0) {
    return;
  }

  await withTransaction(async (client) => {
    for (const review of reviews) {
      await client.query(
        `INSERT INTO reviews
         (id, report_id, source, app, author, rating, content, published_at, source_url, raw_json, fetched_at)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO NOTHING`,
        [
          review.id,
          reportId,
          review.source,
          review.app,
          review.author,
          review.rating,
          review.content,
          review.publishedAt,
          review.sourceUrl,
          review.rawJson ? JSON.stringify(review.rawJson) : null,
          nowUnix(),
        ]
      );
    }
  });
}

async function persistClassifications(classifications: Awaited<ReturnType<typeof classifyReviews>>) {
  if (classifications.length === 0) {
    return;
  }

  await withTransaction(async (client) => {
    for (const item of classifications) {
      await client.query(
        `INSERT INTO classifications
         (review_id, topic, sentiment, confidence, classified_at, model_used)
         VALUES($1, $2, $3, $4, $5, $6)
         ON CONFLICT (review_id) DO UPDATE SET
           topic = EXCLUDED.topic,
           sentiment = EXCLUDED.sentiment,
           confidence = EXCLUDED.confidence,
           classified_at = EXCLUDED.classified_at,
           model_used = EXCLUDED.model_used`,
        [item.reviewId, item.topic, item.sentiment, item.confidence, nowUnix(), item.modelUsed]
      );
    }
  });
}

export async function runReport(reportId: string, apps: string[], goal: string, focusArea?: string, cutoffDays = 90) {
  const data: Record<string, CompanyData> = {};
  let market: MarketView | null = null;

  try {
    console.log(`[report:${reportId}] run started`, {
      apps,
      goal,
      focusArea: focusArea ?? null,
      cutoffDays,
    });
    await clearReferencesForReport(reportId);

    for (const app of apps) {
      console.log(`[report:${reportId}] crawl started`, {
        app,
      });
      pipelineEvents.emitEvent(reportId, "fetch", {
        app,
        message: `Crawling ${app} across app stores, communities, and social sources`,
      });

      const fetched = await fetchAllSources(app, cutoffDays);
      console.log(`[report:${reportId}] crawl finished`, {
        app,
        fetchedReviews: fetched.reviews.length,
        sourcesUsed: fetched.sourcesUsed,
        failedSources: fetched.failed,
      });
      const scopedReviews = fetched.reviews.map((review) => ({
        ...review,
        id: `${reportId}:${review.id}`,
      }));
      await persistReviews(reportId, scopedReviews);
      console.log(`[report:${reportId}] reviews persisted`, {
        app,
        reviewCount: scopedReviews.length,
      });

      pipelineEvents.emitEvent(reportId, "fetch", {
        app,
        message: `Fetched ${scopedReviews.length} reviews for ${app}`,
        count: scopedReviews.length,
        sourcesUsed: fetched.sourcesUsed,
        failed: fetched.failed,
      });

      pipelineEvents.emitEvent(reportId, "classify", {
        app,
        message: `Classifying ${scopedReviews.length} reviews for ${app}`,
      });
      const classifications = await classifyReviews(scopedReviews, 20);
      await persistClassifications(classifications);
      console.log(`[report:${reportId}] classifications persisted`, {
        app,
        classificationCount: classifications.length,
      });

      pipelineEvents.emitEvent(reportId, "aggregate", {
        app,
        message: `Aggregating review metrics for ${app}`,
      });
      const metrics = await buildMetrics(reportId, app);
      const evidence = await fetchEvidence(reportId, app);
      console.log(`[report:${reportId}] metrics ready`, {
        app,
        reviewCount: metrics.reviewCount,
        evidenceCount: evidence.length,
        avgRating: metrics.rating,
      });

      pipelineEvents.emitEvent(reportId, "insight", {
        app,
        message: `Generating insights for ${app}`,
      });
      const insight = await callAgent({
        app,
        goal,
        focusArea,
        metrics,
        evidence,
        market,
      });

      data[app] = {
        ...metrics,
        insights: insight.insights,
        actions: insight.actions,
      };
      console.log(`[report:${reportId}] insight ready`, {
        app,
        insightCount: insight.insights.length,
        poActions: insight.actions.PO.length,
        qaActions: insight.actions.QA.length,
        marketingActions: insight.actions.Marketing.length,
      });

      market = await buildMarketView(reportId);
      await updateReportData({
        id: reportId,
        status: "running",
        company_data: { data, market },
      });
      console.log(`[report:${reportId}] report snapshot updated`, {
        app,
        marketTotalReviews: market?.totalReviews ?? 0,
      });
    }

    const finalMarket = await buildMarketView(reportId);
    const presentation = buildReportPresentation({
      query: apps.join(" vs "),
      apps,
      data,
      market: finalMarket,
    });
    const finalPayload = { data, market: finalMarket, ...presentation };
    await updateReport({
      id: reportId,
      status: "ready",
      completed_at: nowUnix(),
      company_data: finalPayload,
    });
    console.log(`[report:${reportId}] run completed`, {
      apps,
      totalApps: finalMarket.totalApps,
      totalReviews: finalMarket.totalReviews,
    });

    pipelineEvents.emitEvent(reportId, "done", {
      reportId,
      message: "Analysis complete",
    });

    return finalPayload;
  } catch (error) {
    console.error(`[report:${reportId}] run failed`, error);
    await updateReport({
      id: reportId,
      status: "error",
      completed_at: nowUnix(),
      company_data: { data, market },
    });
    pipelineEvents.emitEvent(reportId, "error", {
      reportId,
      message: error instanceof Error ? error.message : "Crawler failed",
    });
    throw error;
  }
}
