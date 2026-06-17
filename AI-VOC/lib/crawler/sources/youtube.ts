import type { RawReview } from "../types.ts";
import { isLikelyPromotionalSpam, isLowSignalContent, makeId, normalizeWhitespace, olderThanCutoff } from "../util.ts";

const YOUTUBE_CONTEXT_TERMS = ["app", "wallet", "finance", "payment", "bank", "vay", "ví", "điện tử", "chuyển khoản"];
const YOUTUBE_QUALITY_TERMS = ["momo", "ví", "vay", "tiền", "ngân hàng", "otp", "xác thực", "trả sau", "chuyển", "app"];

async function fetchVideoComments(videoId: string, apiKey: string) {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/commentThreads");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("videoId", videoId);
  endpoint.searchParams.set("maxResults", "40");
  endpoint.searchParams.set("order", "time");
  endpoint.searchParams.set("textFormat", "plainText");
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`YouTube comments failed with status ${response.status}`);
  }
  return response.json();
}

export async function fetchYouTube(app: { name: string }, cutoffUnix: number): Promise<RawReview[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return [];
  }

  const queryVariants = [`"${app.name}" app vietnam`, `"${app.name}" ví điện tử`, `"${app.name}" review vietnam`];
  const publishedAfter = new Date(cutoffUnix * 1000).toISOString();
  const videoMap = new Map<string, any>();

  for (const query of queryVariants) {
    const search = new URL("https://www.googleapis.com/youtube/v3/search");
    search.searchParams.set("part", "snippet");
    search.searchParams.set("type", "video");
    search.searchParams.set("maxResults", "5");
    search.searchParams.set("order", "relevance");
    search.searchParams.set("publishedAfter", publishedAfter);
    search.searchParams.set("regionCode", "VN");
    search.searchParams.set("relevanceLanguage", "vi");
    search.searchParams.set("q", query);
    search.searchParams.set("key", apiKey);

    const searchResponse = await fetch(search);
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      throw new Error(`YouTube search failed with status ${searchResponse.status}: ${errorText.slice(0, 300)}`);
    }

    const searchBody: any = await searchResponse.json();
    const videos = Array.isArray(searchBody?.items) ? searchBody.items : [];
    for (const video of videos) {
      const videoId = video?.id?.videoId;
      if (videoId) {
        videoMap.set(videoId, video);
      }
    }
  }

  const videos = [...videoMap.values()].filter((item) => {
    const snippet = item?.snippet;
    const haystack = normalizeWhitespace([snippet?.title, snippet?.description].filter(Boolean).join(" ")).toLowerCase();
    return haystack.includes(app.name.toLowerCase()) && YOUTUBE_CONTEXT_TERMS.some((term) => haystack.includes(term));
  });

  const reviewLists = await Promise.all(
    videos.map(async (item: any) => {
      const videoId = item?.id?.videoId;
      if (!videoId) {
        return [];
      }
      const snippet = item?.snippet;
      const videoPublishedAt = snippet?.publishedAt ? Math.floor(new Date(snippet.publishedAt).getTime() / 1000) : null;
      const videoReview: RawReview = {
        id: makeId("yt-video", videoId, snippet?.title, snippet?.description),
        source: "youtube",
        app: app.name,
        author: snippet?.channelTitle || null,
        rating: null,
        content: normalizeWhitespace([snippet?.title, snippet?.description].filter(Boolean).join(" ")),
        publishedAt: videoPublishedAt,
        sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
        rawJson: item,
      };

      const comments: any = await fetchVideoComments(videoId, apiKey).catch(() => ({ items: [] }));
      const commentReviews = (comments?.items ?? []).map((thread: any) => {
        const snippet = thread?.snippet?.topLevelComment?.snippet;
        const content = normalizeWhitespace(snippet?.textDisplay || "");
        const publishedAt = snippet?.publishedAt ? Math.floor(new Date(snippet.publishedAt).getTime() / 1000) : null;
        return {
          id: makeId("yt", thread?.id, content),
          source: "youtube" as const,
          app: app.name,
          author: snippet?.authorDisplayName || null,
          rating: null,
          content,
          publishedAt,
          sourceUrl: `https://www.youtube.com/watch?v=${videoId}&lc=${thread?.id || ""}`,
          rawJson: thread,
        };
      });

      return [videoReview, ...commentReviews];
    })
  );

  return reviewLists
    .flat()
    .filter((review: RawReview) => {
      if (!review.content || olderThanCutoff(review.publishedAt, cutoffUnix)) {
        return false;
      }

      if (isLowSignalContent(review.content) || isLikelyPromotionalSpam(review.content)) {
        return false;
      }

      const normalized = review.content.toLowerCase();
      if (review.sourceUrl.includes("&lc=")) {
        return YOUTUBE_QUALITY_TERMS.some((term) => normalized.includes(term));
      }

      return true;
    });
}
