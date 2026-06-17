import * as gplayModule from "google-play-scraper";
import type { RawReview } from "../types.ts";
import { makeId, normalizeWhitespace, olderThanCutoff } from "../util.ts";

function getGooglePlayReviewsFn() {
  const mod: any = gplayModule;
  const fn = mod?.reviews || mod?.default?.reviews || (typeof mod?.default === "function" ? mod.default : null);
  if (typeof fn !== "function") {
    throw new Error("google-play-scraper reviews() export not available");
  }
  return fn;
}

export async function fetchGooglePlay(app: { name: string; playId: string | null }, cutoffUnix: number): Promise<RawReview[]> {
  if (!app.playId) {
    return [];
  }

  const reviews = getGooglePlayReviewsFn();
  const rows = await reviews({
    appId: app.playId,
    lang: "vi",
    country: "vn",
    sort: 2 as any,
    num: 120,
  });

  return rows.data
    .map((review: any) => {
      const publishedAt = review?.date ? Math.floor(new Date(review.date).getTime() / 1000) : null;
      return {
        id: makeId("gp", app.playId, review.id || review.userName, review.text),
        source: "google_play" as const,
        app: app.name,
        author: review.userName || null,
        rating: typeof review.score === "number" ? review.score : null,
        content: normalizeWhitespace(String(review.text || "")),
        publishedAt,
        sourceUrl: `https://play.google.com/store/apps/details?id=${app.playId}&reviewId=${review.id || ""}`,
        rawJson: review,
      };
    })
    .filter((review) => review.content && !olderThanCutoff(review.publishedAt, cutoffUnix));
}
