import { Router } from "express";
import { createReport, getReport } from "../lib/db/index.ts";
import { runReport } from "../lib/crawler/runReport.ts";
import { intentToCrawlerInput } from "../lib/crawler/translateIntent.ts";
import { makeId, nowUnix } from "../lib/crawler/util.ts";

const router = Router();

router.post("/api/analyze", async (req, res) => {
  try {
    const { confirmed_apps, intent } = req.body || {};
    if (!Array.isArray(confirmed_apps) || confirmed_apps.length === 0) {
      return res.status(400).json({ error: "No apps confirmed" });
    }

    const crawlReq = intentToCrawlerInput(intent || {});
    const apps = confirmed_apps
      .map((app: any) => (typeof app?.name === "string" ? app.name : typeof app === "string" ? app : null))
      .filter(Boolean);

    if (apps.length === 0) {
      return res.status(400).json({ error: "No valid app names were provided" });
    }

    const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const reportId = `${String(apps[0]).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${dateStamp}-${makeId(...apps, Date.now()).slice(0, 6)}`;
    console.log("[analyze] request accepted", {
      reportId,
      apps,
      goal: crawlReq.goal,
      focusArea: crawlReq.focus_area ?? null,
      cutoffDays: crawlReq.cutoffDays,
    });
    await createReport({
      id: reportId,
      apps,
      goal: crawlReq.goal,
      focus_area: crawlReq.focus_area,
      status: "pending",
      created_at: nowUnix(),
      company_data: { data: {}, market: null },
    });

    void runReport(reportId, apps, crawlReq.goal, crawlReq.focus_area, crawlReq.cutoffDays).catch((error) => {
      console.error(`[report:${reportId}] background run failed`, error);
    });

    const report = await getReport(reportId);
    return res.json({
      report_id: reportId,
      status: report?.status || "pending",
      stream_url: `/api/reports/${reportId}/stream`,
    });
  } catch (error: any) {
    console.error("[analyze] failed:", error);
    return res.status(500).json({
      error: error?.message || "Failed to create analysis report",
      code: error?.code || null,
    });
  }
});

export default router;
