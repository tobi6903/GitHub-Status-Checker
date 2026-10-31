import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  MessageContent,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AiConfigError } from "./errors";
import { GitHubAuthError } from "@/lib/github";
import { GitHubHttpError } from "@/lib/github-rest";
import type { AiEvent } from "./events";

export type Emit = (event: AiEvent) => void;
export type Provider = "anthropic" | "openai";
export type Effort = "low" | "medium" | "high";

export { AiConfigError };

const DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: "claude-opus-5-5",
  openai: "gpt-5",
};

export type AiSettings = {
  provider: Provider;
  model: string;
  apiKey: string;
  /** "own": a key the signed-in user entered; "server": the deployment's environment key. */
  source: "own" | "server";
};

export const defaultModel = (provider: Provider) => DEFAULT_MODEL[provider];

// The server's own key, from AI_PROVIDER, AI_MODEL, ANTHROPIC_API_KEY and OPENAI_API_KEY.
// Without AI_PROVIDER it uses whichever key is set (Anthropic first).
export function serverSettings(): AiSettings {
  const explicit = process.env.AI_PROVIDER?.toLowerCase();
  if (explicit && explicit !== "anthropic" && explicit !== "openai") {
    throw new AiConfigError(`AI_PROVIDER must be "anthropic" or "openai", got "${explicit}".`);
  }
  const provider =
    (explicit as Provider | undefined) ??
    (process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.OPENAI_API_KEY
        ? "openai"
        : undefined);

  if (!provider) {
    throw new AiConfigError(
      "No AI key configured. Add your own on the API key tab, or set ANTHROPIC_API_KEY / OPENAI_API_KEY on the server.",
    );
  }
  const keyName = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const apiKey = process.env[keyName];
  if (!apiKey) throw new AiConfigError(`AI_PROVIDER is "${provider}" but ${keyName} is not set.`);

  return {
    provider,
    apiKey,
    model: process.env.AI_MODEL || DEFAULT_MODEL[provider],
    source: "server",
  };
}

// Models that accept an effort setting; the others reject it.
const CLAUDE_EFFORT = /^claude-(opus|sonnet|haiku|fable|mythos)-(5|4-[6-9])/;
const OPENAI_REASONING = /^(o\d|gpt-5)/;

export function getModel(
  ai: AiSettings,
  opts: { maxTokens: number; effort?: Effort },
): BaseChatModel {
  const { provider, model, apiKey } = ai;

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model,
      apiKey,
      maxTokens: opts.maxTokens,
      ...(opts.effort && CLAUDE_EFFORT.test(model) && { outputConfig: { effort: opts.effort } }),
    });
  }
  return new ChatOpenAI({
    model,
    apiKey,
    maxTokens: opts.maxTokens,
    ...(opts.effort && OPENAI_REASONING.test(model) && { reasoning: { effort: opts.effort } }),
  });
}

// Anthropic returns a list of content blocks, OpenAI a plain string.
export function textOf(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => (b.type === "text" && "text" in b && typeof b.text === "string" ? b.text : ""))
    .join("");
}

// Why a finished reply is unusable, in terms that work for both providers.
export function stopProblem(
  message: Pick<AIMessage, "response_metadata" | "additional_kwargs">,
): "refusal" | "truncated" | null {
  const meta = message.response_metadata as { stop_reason?: string; finish_reason?: string };
  const reason = meta.stop_reason ?? meta.finish_reason;
  if (reason === "refusal" || reason === "content_filter" || message.additional_kwargs?.refusal)
    return "refusal";
  if (reason === "max_tokens" || reason === "length") return "truncated";
  return null;
}

export function reportStop(problem: "refusal" | "truncated" | null, emit: Emit) {
  if (problem === "refusal")
    emit({ type: "error", message: "The model declined to answer this request." });
  if (problem === "truncated")
    emit({ type: "error", message: "The answer hit the length limit and was cut off." });
}

export async function streamText(
  model: BaseChatModel,
  messages: BaseMessage[],
  emit: Emit,
  signal: AbortSignal,
) {
  let full: AIMessageChunk | undefined;
  for await (const chunk of await model.stream(messages, { signal })) {
    const text = textOf(chunk.content);
    if (text) emit({ type: "text", text });
    full = full ? full.concat(chunk) : chunk;
  }
  if (full) reportStop(stopProblem(full), emit);
  return full;
}

export function describeError(err: unknown): string {
  if (err instanceof AiConfigError) return err.message;
  if (err instanceof GitHubAuthError)
    return "Your GitHub session expired. Sign out and sign in again.";
  if (err instanceof GitHubHttpError) {
    if (err.status === 401) return "Your GitHub session expired. Sign out and sign in again.";
    if (err.status === 404)
      return "GitHub says that doesn't exist, or your token can't see it (private repo?).";
    if (err.status === 403) return `GitHub refused the request: ${err.message}`;
    return `GitHub error (${err.status}): ${err.message}`;
  }
  // Provider SDK errors (wrapped by LangChain) carry the HTTP status.
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : "Something went wrong.";
  if (status === 401)
    return "The AI provider rejected the API key. Check the key on the API key tab (or the server's env).";
  if (status === 429) return "The AI provider's rate limit was reached. Try again in a minute.";
  if (typeof status === "number" && status >= 400)
    return `AI provider error (${status}): ${message}`;
  return message;
}
