import { Router } from "express";
import { getReport, query } from "../lib/db/index.ts";
import { pipelineEvents } from "../lib/events.ts";
import { callJsonCompletion } from "../lib/llm.ts";

const router = Router();

type ReportEvidenceRow = {
  id: string;
  app: string;
  source: string;
  author: string | null;
  rating: number | null;
  content: string;
  published_at: number | null;
  source_url: string;
  topic: string | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  confidence: number | null;
};

type ReportReferenceRow = {
  id: string;
  topic: string | null;
  rank: number | null;
  app: string;
  source: string;
  content: string;
  source_url: string;
};

function normalizeQueryArray(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function clipText(text: string, max = 220) {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1).trim()}…`;
}

function buildEvidenceBundle(reviews: ReportEvidenceRow[], references: ReportReferenceRow[]) {
  const referenceLines = references.slice(0, 12).map((ref, index) => {
    return `REF ${index + 1} | app=${ref.app} | source=${ref.source} | topic=${ref.topic || "unknown"} | url=${ref.source_url}\n${clipText(ref.content, 280)}`;
  });

  const reviewLines = reviews.slice(0, 24).map((review, index) => {
    return `REVIEW ${index + 1} | app=${review.app} | source=${review.source} | sentiment=${review.sentiment || "unknown"} | topic=${review.topic || "unknown"} | rating=${review.rating ?? "n/a"} | url=${review.source_url}\n${clipText(review.content, 240)}`;
  });

  return [...referenceLines, ...reviewLines].join("\n\n");
}

function buildCompanyClause(companies: string[], startIndex: number, column = "r.app") {
  if (companies.length === 0) {
    return { clause: "", params: [] as string[] };
  }
  return {
    clause: ` AND ${column} IN (${companies.map((_, index) => `$${startIndex + index}`).join(", ")})`,
    params: companies,
  };
}

router.get("/api/reports/:id", async (req, res) => {
  try {
    const report = await getReport(req.params.id);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    const payload = report.company_data || { data: {}, market: null };
    return res.json({
      id: report.id,
      status: report.status,
      created_at: Number(report.created_at),
      completed_at: report.completed_at ? Number(report.completed_at) : null,
      data: payload.data || {},
      market: payload.market || null,
      brief_markdown: payload.brief_markdown || "",
      blocks: Array.isArray(payload.blocks) ? payload.blocks : [],
    });
  } catch (error: any) {
    console.error("[reports:get] failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to load report", code: error?.code || null });
  }
});

router.get("/api/reports/:id/stream", async (req, res) => {
  try {
    const reportId = req.params.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const report = await getReport(reportId);
    if (report && (report.status === "ready" || report.status === "error")) {
      res.write(`event: ${report.status === "ready" ? "done" : "error"}\ndata: ${JSON.stringify({ reportId, message: report.status })}\n\n`);
      res.end();
      return;
    }

    const unsubscribe = pipelineEvents.subscribe(reportId, (event) => {
      res.write(`event: ${String(event.type)}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.type === "done" || event.type === "error") {
        unsubscribe();
        res.end();
      }
    });

    req.on("close", () => {
      unsubscribe();
    });
  } catch (error: any) {
    console.error("[reports:stream] failed:", error);
    res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || "Failed to stream report", code: error?.code || null })}\n\n`);
    res.end();
  }
});

router.get("/api/reports/:id/reviews", async (req, res) => {
  try {
    const { topic, sentiment, limit = "100" } = req.query;
    const companies = normalizeQueryArray(req.query.companies);
    const companyFilter = buildCompanyClause(companies, 6);
    const rowsResult = await query<ReportEvidenceRow>(
      `SELECT r.id, r.app, r.source, r.author, r.rating, r.content, r.published_at, r.source_url,
              c.topic, c.sentiment, c.confidence
       FROM reviews r
       LEFT JOIN classifications c ON c.review_id = r.id
       WHERE r.report_id = $1
         AND ($2 IS NULL OR c.topic = $3)
         AND ($4 IS NULL OR c.sentiment = $5)
         ${companyFilter.clause}
       ORDER BY COALESCE(r.published_at, 0) DESC
       LIMIT $${6 + companyFilter.params.length}`,
      [req.params.id, topic ?? null, topic ?? null, sentiment ?? null, sentiment ?? null, ...companyFilter.params, Number(limit)]
    );

    return res.json({ reviews: rowsResult.rows });
  } catch (error: any) {
    console.error("[reports:reviews] failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to load reviews", code: error?.code || null });
  }
});

router.get("/api/reports/:id/references", async (req, res) => {
  try {
    const companies = normalizeQueryArray(req.query.companies);
    const companyFilter = buildCompanyClause(companies, 2);
    const rowsResult = await query<ReportReferenceRow>(
      `SELECT rr.id, rr.topic, rr.rank, r.app, r.source, r.content, r.source_url
       FROM report_references rr
       JOIN reviews r ON r.id = rr.review_id
       WHERE rr.report_id = $1
         ${companyFilter.clause}
       ORDER BY rr.rank ASC`,
      [req.params.id, ...companyFilter.params]
    );

    return res.json({ references: rowsResult.rows });
  } catch (error: any) {
    console.error("[reports:references] failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to load references", code: error?.code || null });
  }
});

router.post("/api/reports/:id/chat", async (req, res) => {
  try {
    const reportId = req.params.id;
    const report = await getReport(reportId);
    if (!report) {
      return res.status(404).json({ error: "Report not found" });
    }

    const { message, companies = [], topic = null, sentiment = null } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const companyList = normalizeQueryArray(companies);
    const messageLike = `%${message.trim()}%`;
    const companyFilter = buildCompanyClause(companyList, 8);
    const reviewsResult = await query<ReportEvidenceRow>(
      `SELECT r.id, r.app, r.source, r.author, r.rating, r.content, r.published_at, r.source_url,
              c.topic, c.sentiment, c.confidence
       FROM reviews r
       LEFT JOIN classifications c ON c.review_id = r.id
       WHERE r.report_id = $1
         AND ($2 IS NULL OR c.topic = $3)
         AND ($4 IS NULL OR c.sentiment = $5)
         AND ($6 IS NULL OR lower(r.content) LIKE lower($7))
         ${companyFilter.clause}
       ORDER BY COALESCE(r.published_at, 0) DESC
       LIMIT $${8 + companyFilter.params.length}`,
      [reportId, topic, topic, sentiment, sentiment, messageLike, messageLike, ...companyFilter.params, 36]
    );

    const fallbackReviewsResult =
      reviewsResult.rows.length >= 8
        ? reviewsResult
        : await query<ReportEvidenceRow>(
            `SELECT r.id, r.app, r.source, r.author, r.rating, r.content, r.published_at, r.source_url,
                    c.topic, c.sentiment, c.confidence
             FROM reviews r
             LEFT JOIN classifications c ON c.review_id = r.id
             WHERE r.report_id = $1
               AND ($2 IS NULL OR c.topic = $3)
               AND ($4 IS NULL OR c.sentiment = $5)
               ${companyFilter.clause}
             ORDER BY COALESCE(r.published_at, 0) DESC
             LIMIT $${6 + companyFilter.params.length}`,
            [reportId, topic, topic, sentiment, sentiment, ...companyFilter.params, 36]
          );

    const referenceCompanyFilter = buildCompanyClause(companyList, 2);
    const referencesResult = await query<ReportReferenceRow>(
      `SELECT rr.id, rr.topic, rr.rank, r.app, r.source, r.content, r.source_url
       FROM report_references rr
       JOIN reviews r ON r.id = rr.review_id
       WHERE rr.report_id = $1
         ${referenceCompanyFilter.clause}
       ORDER BY rr.rank ASC
       LIMIT 12`,
      [reportId, ...referenceCompanyFilter.params]
    );

    const reviews = fallbackReviewsResult.rows;
    const references = referencesResult.rows;
    const evidenceText = buildEvidenceBundle(reviews, references);

    const answer = await callJsonCompletion([
      {
        role: "system",
        content:
          "You are a report-grounded VOC analyst. Answer only from the provided report evidence. If evidence is insufficient, say so clearly. Return strict JSON with keys answer and citations. Citations must be exact snippets copied from the evidence, with source, text, app, and source_url. Use 2 to 5 citations.",
      },
      {
        role: "user",
        content: `Report ID: ${reportId}
Apps: ${JSON.stringify(report.apps)}
Question: ${message.trim()}
Filters: ${JSON.stringify({ companies: companyList, topic, sentiment })}

Evidence:
${evidenceText}

Return JSON:
{
  "answer": string,
  "citations": [
    {
      "source": string,
      "text": string,
      "app": string,
      "source_url": string
    }
  ]
}`,
      },
    ]);

    return res.json({
      answer: typeof answer?.answer === "string" ? answer.answer : "I could not find enough evidence in this report to answer confidently.",
      citations: Array.isArray(answer?.citations)
        ? answer.citations
            .filter((item: any) => item && typeof item.source === "string" && typeof item.text === "string")
            .slice(0, 5)
        : [],
    });
  } catch (error: any) {
    console.error("[reports:chat] failed:", error);
    return res.status(500).json({ error: error?.message || "Failed to answer from report evidence", code: error?.code || null });
  }
});

export default router;
