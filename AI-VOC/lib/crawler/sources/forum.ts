import type { RawReview } from "../types.ts";
import { makeId, normalizeWhitespace, olderThanCutoff } from "../util.ts";
import { filterSearchHitsByDomain, searchBingRss } from "./webSearch.ts";

type ForumSource = "tinhte" | "voz";

function forumQueries(site: "tinhte.vn" | "voz.vn", appName: string) {
  return [
    `site:${site} "${appName}" app review complaint`,
    `site:${site} "${appName}" lỗi`,
    `site:${site} "${appName}" đánh giá`,
  ];
}

async function fetchForumFallback(
  site: "tinhte.vn" | "voz.vn",
  source: ForumSource,
  appName: string,
  cutoffUnix: number
): Promise<RawReview[]> {
  const hitLists = await Promise.all(forumQueries(site, appName).map((query) => searchBingRss(query)));
  const hits = filterSearchHitsByDomain(hitLists.flat(), [site]);
  const seen = new Set<string>();

  return hits
    .map((hit) => {
      const content = normalizeWhitespace([hit.title, hit.description].filter(Boolean).join(" "));
      return {
        id: makeId(source, appName, hit.link, content),
        source,
        app: appName,
        author: null,
        rating: null,
        content,
        publishedAt: hit.publishedAt,
        sourceUrl: hit.link,
        rawJson: hit,
      };
    })
    .filter((review) => {
      if (!review.content || olderThanCutoff(review.publishedAt, cutoffUnix)) {
        return false;
      }
      if (seen.has(review.sourceUrl)) {
        return false;
      }
      seen.add(review.sourceUrl);
      return true;
    })
    .slice(0, 20);
}

export async function fetchTinhte(app: { name: string }, cutoffUnix: number): Promise<RawReview[]> {
  return fetchForumFallback("tinhte.vn", "tinhte", app.name, cutoffUnix);
}

export async function fetchVoz(app: { name: string }, cutoffUnix: number): Promise<RawReview[]> {
  return fetchForumFallback("voz.vn", "voz", app.name, cutoffUnix);
}
