import crypto from "crypto";

export function makeId(...parts: Array<string | number | null | undefined>) {
  return crypto
    .createHash("sha1")
    .update(parts.filter((part) => part !== null && part !== undefined).join("|"))
    .digest("hex");
}

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}

export function olderThanCutoff(timestamp: number | null | undefined, cutoffUnix: number) {
  if (!timestamp) {
    return false;
  }
  return timestamp < cutoffUnix;
}

export function cutoffFromDays(days: number) {
  return nowUnix() - days * 24 * 60 * 60;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

const PROMO_PATTERNS = [
  /mã (giới thiệu|khuyến mại|khuyến mãi)/i,
  /nhập mã/i,
  /ưu đãi/i,
  /nhận\s+\d+[a-z0-9.]*/i,
  /liên kết ngân hàng/i,
  /nạp tiền vào ví/i,
  /đăng ký kênh/i,
  /subscribe/i,
  /review các app vay tiền/i,
  /playlist/i,
  /https?:\/\//i,
  /www\./i,
];

const LOW_SIGNAL_PATTERNS = [/^[\W_]+$/u, /^[a-z]$/i, /^[0-9]+$/];

export function isLowSignalContent(content: string) {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return true;
  }

  if (normalized.length < 8) {
    return true;
  }

  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const alphaNumericCount = (normalized.match(/[0-9\p{L}]/gu) || []).length;
  return alphaNumericCount < 4;
}

export function isLikelyPromotionalSpam(content: string) {
  const normalized = normalizeWhitespace(content);
  if (!normalized) {
    return false;
  }

  return PROMO_PATTERNS.some((pattern) => pattern.test(normalized));
}
