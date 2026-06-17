import * as cheerio from "cheerio";

export type SearchHit = {
  title: string;
  link: string;
  description: string;
  publishedAt: number | null;
};

function normalizeSearchText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseBingPubDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
}

export async function searchBingRss(query: string): Promise<SearchHit[]> {
  const endpoint = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "vi,en-US;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`Bing search failed with status ${response.status}`);
  }

  const xml = await response.text();
  const $ = cheerio.load(xml, { xmlMode: true });

  return $("item")
    .map((_, item) => ({
      title: normalizeSearchText($(item).find("title").text()),
      link: normalizeSearchText($(item).find("link").text()),
      description: normalizeSearchText($(item).find("description").text()),
      publishedAt: parseBingPubDate($(item).find("pubDate").text()),
    }))
    .get()
    .filter((item) => item.title && item.link);
}

export function filterSearchHitsByDomain(hits: SearchHit[], domains: string[]) {
  return hits.filter((hit) => {
    try {
      const hostname = new URL(hit.link).hostname.toLowerCase();
      return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  });
}
