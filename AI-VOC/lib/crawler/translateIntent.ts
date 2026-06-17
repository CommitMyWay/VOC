import type { CrawlRequest } from "./types.ts";

export function intentToCrawlerInput(intent: any): CrawlRequest {
  const timeRange = intent?.filters?.time_range;
  const cutoffDays =
    timeRange === "last_7_days" ? 7 : timeRange === "last_30_days" ? 30 : timeRange === "last_90_days" ? 90 : 90;

  return {
    apps: [],
    goal: typeof intent?.objective === "string" && intent.objective.trim() ? intent.objective.trim() : "general_analysis",
    focus_area: typeof intent?.focus === "string" && intent.focus.trim() ? intent.focus.trim() : undefined,
    cutoffDays,
  };
}
