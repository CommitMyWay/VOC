import { getAppRegistry, upsertAppRegistry } from "../db/index.ts";
import type { ResolvedApp } from "./types.ts";

function normalizeAppName(name: string) {
  return name
    .replace(/^(analyse|analyze|benchmark|compare|review|scan|research)\s+/i, "")
    .replace(/\s+(for|vs)\s+.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const APP_ALIASES: Record<string, string> = {
  shoppe: "Shopee",
  shoppee: "Shopee",
  "shopee pay": "ShopeePay",
  shopeepay: "ShopeePay",
  "zalo pay": "ZaloPay",
  zalo: "Zalo",
  vnpay: "VNPAY",
  momo: "MoMo",
  "mb bank": "MBBank",
  mbbank: "MBBank",
  "techcombank": "Techcombank Mobile",
  "bidv": "BIDV SmartBanking",
  "viettelmoney": "Viettel Money",
  "viettel money": "Viettel Money",
  grab: "Grab",
  be: "be",
};

const POPULAR_APP_FALLBACKS: Record<string, { playId: string | null; appStoreId: string | null; iconUrl: string | null }> = {
  Zalo: {
    playId: "com.zing.zalo",
    appStoreId: "579523206",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/dd/2f/c9/dd2fc944-23ce-52cc-533d-f9abf18c2c69/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg",
  },
  Shopee: {
    playId: "com.shopee.vn",
    appStoreId: "959841449",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/95/45/f9/9545f966-1db5-26a5-e59d-c07edb874a20/AppIcon-0-0-1x_U007emarketing-0-6-0-0-85-220.png/512x512bb.jpg",
  },
  ShopeePay: {
    playId: "com.shopeepay.wallet",
    appStoreId: "6451046172",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/c1/8c/62/c18c624d-40cf-d9e3-d632-d40e24ff3745/AppIcon-1x_U007emarketing-0-6-0-0-85-220-0.png/512x512bb.jpg",
  },
  ZaloPay: {
    playId: "vn.com.vng.zalopay",
    appStoreId: "1104616807",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/27/8a/1e/278a1eb6-e8a3-c9df-a737-f93b68d92daa/AppIcon-0-0-1x_U007emarketing-0-6-0-85-220.png/512x512bb.jpg",
  },
  VNPAY: {
    playId: "com.vnpay.vnpayqr",
    appStoreId: "1438243567",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/96/43/c9/9643c976-b471-f6eb-ded3-85cdfe0ce197/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/512x512bb.jpg",
  },
  Grab: {
    playId: "com.grabtaxi.passenger",
    appStoreId: "647268330",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/8a/1d/05/8a1d054a-d3ac-8d97-ec78-d66b82072be2/GrabIcon-0-0-1x_U007emarketing-0-6-0-85-220.png/512x512bb.jpg",
  },
  MoMo: {
    playId: "com.mservice.momotransfer",
    appStoreId: "918751511",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/82/3b/70/823b703f-3109-61b6-b22b-a62b5d5c33f4/AppIcon-0-0-1x_U007emarketing-0-6-0-sRGB-85-220.png/512x512bb.jpg",
  },
  "Viettel Money": {
    playId: "com.viettel.wallet",
    appStoreId: "1492676280",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/2c/ff/8a/2cff8ac9-de6c-9357-ed6e-23a3dc651f8d/AppIcon-0-0-1x_U007emarketing-0-11-0-85-220.png/512x512bb.jpg",
  },
  MBBank: {
    playId: "com.mbmobile",
    appStoreId: "1205807363",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/81/c3/f8/81c3f8dd-0741-8382-0f30-ace3956def6e/AppIcon-0-0-1x_U007emarketing-0-8-0-0-85-220.png/512x512bb.jpg",
  },
  "Techcombank Mobile": {
    playId: "vn.com.techcombank.bb.app",
    appStoreId: "1548623362",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/f4/1d/14/f41d14d4-0173-27fd-e1b0-750992a23459/AppIcon-0-0-1x_U007ephone-0-1-85-220.png/512x512bb.jpg",
  },
  "BIDV SmartBanking": {
    playId: "com.vnpay.bidv",
    appStoreId: "1061867449",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/42/5b/0b/425b0b40-5780-e642-49c6-516146046574/AppIcon-0-0-1x_U007emarketing-0-8-0-85-220.png/512x512bb.jpg",
  },
  be: {
    playId: "xyz.be.customer",
    appStoreId: "1440565902",
    iconUrl: "https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/2d/53/28/2d53283c-e0ab-3645-2423-407cca18a776/AppIcon-0-0-1x_U007ephone-0-1-0-85-220.png/512x512bb.jpg",
  },
};

function canonicalizeAppName(name: string) {
  const normalized = normalizeAppName(name);
  const aliasKey = normalized.toLowerCase();
  return APP_ALIASES[aliasKey] || normalized;
}

async function searchAppStore(name: string) {
  const endpoint = `https://itunes.apple.com/search?entity=software&country=vn&limit=1&term=${encodeURIComponent(name)}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`App Store search failed with status ${response.status}`);
  }
  const body: any = await response.json();
  const app = Array.isArray(body?.results) ? body.results[0] : null;
  if (!app) {
    return { appStoreId: null, iconUrl: null };
  }
  return {
    appStoreId: typeof app.trackId === "number" ? String(app.trackId) : null,
    iconUrl: typeof app.artworkUrl512 === "string" ? app.artworkUrl512 : app.artworkUrl100 || null,
  };
}

async function searchPlayStore(name: string) {
  const endpoint = `https://play.google.com/store/search?c=apps&q=${encodeURIComponent(name)}`;
  const response = await fetch(endpoint, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) {
    throw new Error(`Play Store search failed with status ${response.status}`);
  }
  const html = await response.text();
  const match = html.match(/\/store\/apps\/details\?id=([A-Za-z0-9._-]+)/);
  return match?.[1] ?? null;
}

export async function resolveApp(name: string): Promise<ResolvedApp> {
  const normalizedName = canonicalizeAppName(name) || name.trim();
  const cached = await getAppRegistry(normalizedName);
  const fallback = POPULAR_APP_FALLBACKS[normalizedName];

  let playId = cached?.play_id ?? fallback?.playId ?? null;
  let appStoreId = cached?.app_store_id ?? fallback?.appStoreId ?? null;
  let iconUrl = cached?.icon_url ?? fallback?.iconUrl ?? null;
  let source = cached ? "registry" : fallback ? "popular_fallback" : "search";

  if (!appStoreId || !iconUrl) {
    try {
      const result = await searchAppStore(normalizedName);
      appStoreId = appStoreId ?? result.appStoreId;
      iconUrl = iconUrl ?? result.iconUrl;
      source = "app_store_search";
    } catch {
      // Best effort only.
    }
  }

  if (!playId) {
    try {
      playId = await searchPlayStore(normalizedName);
      source = "play_store_search";
    } catch {
      // Best effort only.
    }
  }

  const resolved: ResolvedApp = {
    name: normalizedName,
    playId,
    appStoreId,
    iconUrl,
    verified: Boolean(playId || appStoreId),
  };

  await upsertAppRegistry({
    name: normalizedName,
    play_id: playId,
    app_store_id: appStoreId,
    category: null,
    icon_url: iconUrl,
    resolved_at: Math.floor(Date.now() / 1000),
    source,
  });

  return resolved;
}
