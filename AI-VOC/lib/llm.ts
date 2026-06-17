import OpenAI from "openai";
import { readEnv, readEnvOr } from "./env.ts";

const DEFAULT_LLM_BASE_URL = "https://maas-llm-aiplatform-hcm.api.vngcloud.vn/v1";
const DEFAULT_LLM_MODEL = "gpt-4.1-mini";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function getLlmConfig() {
  const apiKey = readEnv("OPENAI_API_KEY") || readEnv("LLM_API_KEY");
  const baseUrl = readEnvOr("OPENAI_BASE_URL", readEnvOr("LLM_BASE_URL", DEFAULT_LLM_BASE_URL)).replace(/\/+$/, "");
  const model = readEnv("OPENAI_MODEL") || readEnv("LLM_MODEL") || DEFAULT_LLM_MODEL;

  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY (or LLM_API_KEY).");
  }

  return { apiKey, baseUrl, model };
}

export function createOpenAIClient() {
  const { apiKey, baseUrl } = getLlmConfig();
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
  });
}

export function extractMessageText(payload: any): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part?.type === "text" && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

export function stripCodeFences(text: string) {
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function callChatCompletion(
  messages: ChatMessage[],
  options?: { expectJson?: boolean; user?: string; temperature?: number; model?: string }
) {
  const { apiKey, baseUrl, model: defaultModel } = getLlmConfig();
  const endpoint = `${baseUrl}/chat/completions`;
  const basePayload: Record<string, unknown> = {
    model: options?.model || defaultModel,
    messages,
    temperature: options?.temperature ?? 0.3,
    ...(options?.user ? { user: options.user } : {}),
  };

  const payloads = options?.expectJson
    ? [{ ...basePayload, response_format: { type: "json_object" } }, basePayload]
    : [basePayload];

  let lastError = "Unknown LLM error";

  for (const payload of payloads) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const rawText = await response.text();
    let parsedBody: any = null;
    try {
      parsedBody = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsedBody = null;
    }

    if (!response.ok) {
      lastError =
        parsedBody?.error?.message ||
        parsedBody?.message ||
        rawText ||
        `LLM request failed with status ${response.status}`;
      continue;
    }

    return {
      text: extractMessageText(parsedBody),
      raw: parsedBody,
    };
  }

  throw new Error(lastError);
}

export async function callJsonCompletion(messages: ChatMessage[], options?: { user?: string; model?: string }) {
  const completion = await callChatCompletion(messages, {
    expectJson: true,
    user: options?.user,
    model: options?.model,
  });
  const text = stripCodeFences(completion.text);
  return JSON.parse(text || "{}");
}
