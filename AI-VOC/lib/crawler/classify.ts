import { createOpenAIClient, getLlmConfig } from "../llm.ts";
import { readEnv } from "../env.ts";
import type { Classification, RawReview, ReviewSentiment } from "./types.ts";
import { clamp, normalizeWhitespace } from "./util.ts";

const DEFAULT_TOPIC = "General";
const CLASSIFY_MODEL = readEnv("CLASSIFY_MODEL") || readEnv("OPENAI_MODEL") || readEnv("LLM_MODEL") || "gpt-4.1-mini";
const TOPIC_KEYWORDS: Record<string, string[]> = {
  Login: ["login", "otp", "password", "signin", "sign in", "đăng nhập"],
  Payment: ["payment", "pay", "transfer", "transaction", "refund", "cash", "bank"],
  Performance: ["slow", "lag", "crash", "bug", "loading", "freeze"],
  UI: ["ui", "ux", "design", "interface", "screen", "button"],
  Promo: ["promo", "voucher", "discount", "reward", "cashback"],
  Support: ["support", "service", "cs", "hotline", "agent"],
};

function heuristicTopic(content: string) {
  const lower = content.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return topic;
    }
  }
  return DEFAULT_TOPIC;
}

function heuristicSentiment(review: RawReview): ReviewSentiment {
  if (typeof review.rating === "number") {
    if (review.rating <= 2) {
      return "negative";
    }
    if (review.rating >= 4) {
      return "positive";
    }
  }

  const lower = review.content.toLowerCase();
  if (/(bad|terrible|poor|lỗi|lag|crash|slow|refund|fail|failed|delay)/.test(lower)) {
    return "negative";
  }
  if (/(great|good|love|smooth|excellent|fast|convenient|best)/.test(lower)) {
    return "positive";
  }
  return "neutral";
}

function fallbackClassify(reviews: RawReview[]): Classification[] {
  return reviews.map((review) => ({
    reviewId: review.id,
    topic: heuristicTopic(review.content),
    sentiment: heuristicSentiment(review),
    confidence: 0.55,
    modelUsed: "heuristic-fallback",
  }));
}

export async function classifyReviews(reviews: RawReview[], batchSize = 20): Promise<Classification[]> {
  if (reviews.length === 0) {
    return [];
  }

  try {
    getLlmConfig();
  } catch {
    console.warn("[classify] llm config missing, using heuristic fallback", {
      reviewCount: reviews.length,
    });
    return fallbackClassify(reviews);
  }

  const client = createOpenAIClient();
  const output: Classification[] = [];
  console.log("[classify] starting classification", {
    reviewCount: reviews.length,
    batchSize,
    model: CLASSIFY_MODEL,
  });

  for (let index = 0; index < reviews.length; index += batchSize) {
    const batch = reviews.slice(index, index + batchSize);
    console.log("[classify] processing batch", {
      batchStart: index,
      batchEnd: index + batch.length - 1,
      batchSize: batch.length,
    });

    try {
      const completion = await client.chat.completions.create({
        model: CLASSIFY_MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classify each review into a concise topic and sentiment. Return strict JSON: {\"items\":[{\"reviewId\":\"...\",\"topic\":\"...\",\"sentiment\":\"positive|neutral|negative\",\"confidence\":0.0}]}",
          },
          {
            role: "user",
            content: JSON.stringify({
              reviews: batch.map((review) => ({
                reviewId: review.id,
                rating: review.rating,
                content: normalizeWhitespace(review.content).slice(0, 1200),
              })),
            }),
          },
        ],
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{\"items\":[]}");
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      console.log("[classify] batch completed", {
        batchStart: index,
        classifiedItems: items.length,
      });

      for (const review of batch) {
        const match = items.find((item: any) => item?.reviewId === review.id);
        if (!match) {
          output.push(...fallbackClassify([review]));
          continue;
        }
        output.push({
          reviewId: review.id,
          topic: typeof match.topic === "string" && match.topic.trim() ? match.topic.trim() : heuristicTopic(review.content),
          sentiment:
            match.sentiment === "positive" || match.sentiment === "neutral" || match.sentiment === "negative"
              ? match.sentiment
              : heuristicSentiment(review),
          confidence: clamp(Number(match.confidence) || 0.7, 0.3, 0.99),
          modelUsed: CLASSIFY_MODEL,
        });
      }
    } catch (error) {
      console.warn("[classify] batch failed, using heuristic fallback", {
        batchStart: index,
        batchSize: batch.length,
        reason: error instanceof Error ? error.message : String(error),
      });
      output.push(...fallbackClassify(batch));
    }
  }

  console.log("[classify] classification finished", {
    reviewCount: reviews.length,
    outputCount: output.length,
  });
  return output;
}
