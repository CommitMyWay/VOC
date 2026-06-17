import type { RawReview } from "../types.ts";
import { makeId, normalizeWhitespace, olderThanCutoff } from "../util.ts";
import { filterSearchHitsByDomain, searchBingRss } from "./webSearch.ts";

export async function fetchReddit(app: { name: string }, cutoffUnix: number): Promise<RawReview[]> {
  const queries = [
    `site:reddit.com/r/* "${app.name}" app review complaint`,
    `site:reddit.com/r/* "${app.name}" support issue`,
    `site:reddit.com/r/* "${app.name}" vietnam`,
  ];

  const hitLists = await Promise.all(queries.map((query) => searchBingRss(query)));
  const hits = filterSearchHitsByDomain(hitLists.flat(), ["reddit.com"]).filter((hit) => {
    const path = new URL(hit.link).pathname;
    return path.includes("/r/") && !path.includes("/user/");
  });

  const seen = new Set<string>();
  return hits
    .map((hit) => {
      const content = normalizeWhitespace([hit.title, hit.description].filter(Boolean).join(" "));
      return {
        id: makeId("reddit", hit.link, content),
        source: "reddit" as const,
        app: app.name,
        author: null,
        rating: null,
        content,
        publishedAt: hit.publishedAt,
        sourceUrl: hit.link,
        rawJson: hit,
      };
    })
    .filter((review: RawReview) => {
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
