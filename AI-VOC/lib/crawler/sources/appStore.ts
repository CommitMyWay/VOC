import * as cheerio from "cheerio";
import type { RawReview } from "../types.ts";
import { isLikelyPromotionalSpam, isLowSignalContent, makeId, normalizeWhitespace, olderThanCutoff } from "../util.ts";

function parseRating(value: string | undefined) {
  const match = value?.match(/(\d+(?:\.\d+)?)\s*Stars?/i);
  return match ? Number(match[1]) : null;
}

export async function fetchAppStore(app: { name: string; appStoreId: string | null }, cutoffUnix: number): Promise<RawReview[]> {
  if (!app.appStoreId) {
    return [];
  }

  const endpoint = `https://apps.apple.com/vn/app/id${app.appStoreId}?see-all=reviews`;
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`App Store reviews failed with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const reviews = $("li")
    .filter((_, node) => $(node).find(".review-header").length > 0)
    .map((_, node) => {
      const card = $(node);
      const title = normalizeWhitespace(card.find("h3").first().text());
      const body = normalizeWhitespace(
        [
          card.find("blockquote").text(),
          card.find("p").text(),
          card.find(".we-clamp__text").text(),
          card.find(".multiline-clamp__text").not(":has(h3)").text(),
        ]
          .filter(Boolean)
          .join(" ")
      );
      const publishedAtText = card.find("time").attr("datetime") || "";
      const publishedAt = publishedAtText ? Math.floor(new Date(publishedAtText).getTime() / 1000) : null;
      const sourceUrl = `${endpoint}#review-${card.find("h3").attr("id") || makeId(title, publishedAtText)}`;

      return {
        id: makeId("as", app.appStoreId, sourceUrl, title, body),
        source: "app_store" as const,
        app: app.name,
        author: normalizeWhitespace(card.find(".author").first().text()) || null,
        rating: parseRating(card.find(".stars").attr("aria-label")),
        content: normalizeWhitespace([title, body].filter(Boolean).join(" ")),
        publishedAt,
        sourceUrl,
        rawJson: {
          title,
          body,
          publishedAtText,
          author: card.find(".author").first().text(),
          ratingLabel: card.find(".stars").attr("aria-label"),
        },
      };
    })
    .get()
    .filter((review) => review.content && !isLowSignalContent(review.content) && !isLikelyPromotionalSpam(review.content));

  const recentReviews = reviews.filter((review) => !olderThanCutoff(review.publishedAt, cutoffUnix));
  return recentReviews.length > 0 ? recentReviews : reviews.slice(0, 25);
}
