import { resolveApp } from "./resolveApp.ts";
import { fetchAppStore } from "./sources/appStore.ts";
import { fetchGooglePlay } from "./sources/googlePlay.ts";
import { fetchReddit } from "./sources/reddit.ts";
import { fetchTinhte, fetchVoz } from "./sources/forum.ts";
import { fetchYouTube } from "./sources/youtube.ts";
import type { FetchResult, RawReview, ReviewSource } from "./types.ts";
import { cutoffFromDays } from "./util.ts";

const SOURCE_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${SOURCE_TIMEOUT_MS}ms`)), SOURCE_TIMEOUT_MS);
    }),
  ]);
}

function dedupeReviews(reviews: RawReview[]) {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const key = `${review.sourceUrl}|${review.content.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function fetchAllSources(appName: string, cutoffDays: number): Promise<FetchResult> {
  const cutoffUnix = cutoffFromDays(cutoffDays);
  const resolved = await resolveApp(appName);
  const target = { name: resolved.name, playId: resolved.playId, appStoreId: resolved.appStoreId };
  console.log("[crawl] sources starting", {
    appName,
    resolvedName: resolved.name,
    playId: resolved.playId,
    appStoreId: resolved.appStoreId,
    cutoffDays,
  });

  const tasks: Array<{ source: ReviewSource; job: Promise<RawReview[]> }> = [
    { source: "google_play", job: withTimeout(fetchGooglePlay(target, cutoffUnix), "google_play") },
    { source: "app_store", job: withTimeout(fetchAppStore(target, cutoffUnix), "app_store") },
    { source: "youtube", job: withTimeout(fetchYouTube(target, cutoffUnix), "youtube") },
    { source: "reddit", job: withTimeout(fetchReddit(target, cutoffUnix), "reddit") },
    { source: "tinhte", job: withTimeout(fetchTinhte(target, cutoffUnix), "tinhte") },
    { source: "voz", job: withTimeout(fetchVoz(target, cutoffUnix), "voz") },
  ];

  const settled = await Promise.allSettled(tasks.map((task) => task.job));
  const reviews: RawReview[] = [];
  const sourcesUsed: ReviewSource[] = [];
  const failed: { source: ReviewSource; reason: string }[] = [];

  settled.forEach((result, index) => {
    const source = tasks[index].source;
    if (result.status === "fulfilled") {
      console.log("[crawl] source finished", {
        appName: resolved.name,
        source,
        reviewCount: result.value.length,
      });
      if (result.value.length > 0) {
        sourcesUsed.push(source);
        reviews.push(...result.value);
      }
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn("[crawl] source failed", {
        appName: resolved.name,
        source,
        reason,
      });
      failed.push({
        source,
        reason,
      });
    }
  });

  const deduped = dedupeReviews(reviews);
  console.log("[crawl] sources completed", {
    appName: resolved.name,
    totalRawReviews: reviews.length,
    dedupedReviews: deduped.length,
    sourcesUsed,
    failedCount: failed.length,
  });
  return {
    reviews: deduped,
    sourcesUsed,
    failed,
  };
}
