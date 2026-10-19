/* OpenRouter fallback for an Anthropic call that will not succeed on retry.

   The nightly job's Anthropic workspace can return 400 once the usage
   limit or credit balance is exhausted. shouldRetry already refuses those.
   OpenRouter bills a separate account, so a Claude model there is not the
   same workspace. The Messages body is translated into one chat-completions
   request. The reply is handed back as text blocks so extractJSON and the
   citation reader keep the existing contract. */

import { scrubSecrets } from "./grok-alert.js";
import { MIN_MODEL_RETRY_MS } from "./refresh-budget.js";
import { postAnthropicMessage } from "./refresh-usage.js";

/* Public models list, 2026-10-19:
   https://openrouter.ai/api/v1/models
   `anthropic/claude-sonnet-5.5` (canonical anthropic/claude-sonnet-5.5-20260928).
   Current Sonnet, structured_outputs and response_format, no expiration.
   OpenRouter invoices this separately from the Anthropic workspace.
   Reasoning is mandatory and defaults to high, which keeps about 80% of
   max_tokens for the trace. Low leaves the visible JSON room to finish. */
export const DEFAULT_FALLBACK_MODEL = "anthropic/claude-sonnet-5.5";
export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

const USAGE_OR_CREDIT_RE = /usage limit|regain access|credit balance|insufficient credit|out of credits|quota/i;

const round6 = (n) => Math.round((n + Number.EPSILON) * 1e6) / 1e6;

const truncate = (value, n = 500) => {
  const text = String(value || "");
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};

export const fallbackModelFromEnv = (env = process.env) => {
  const raw = env && env.FALLBACK_MODEL;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return DEFAULT_FALLBACK_MODEL;
};

/* Usage-limit and credit errors fall back immediately. Other non-retryable
   4xx do too. 429 waits until the Anthropic retry policy is finished
   (a second attempt, or not enough time left to start one). 408, 5xx,
   network errors, aborts, spend-cap refusals, and billed replies do not:
   those already have a retry or already spent the call. */
export const classifyFallback = ({
  httpStatus = null,
  message = "",
  billed = false,
  aborted = false,
  spendCap = false,
  retriesExhausted = false,
  remainingMs = null,
} = {}) => {
  if (aborted) return { fallback: false, reason: "aborted" };
  if (spendCap) return { fallback: false, reason: "spend-cap" };
  if (billed) return { fallback: false, reason: "billed" };
  if (USAGE_OR_CREDIT_RE.test(String(message || ""))) {
    return { fallback: true, reason: "usage-limit" };
  }
  if (httpStatus === 429) {
    const outOfTime = typeof remainingMs === "function" && remainingMs() < MIN_MODEL_RETRY_MS;
    if (retriesExhausted || outOfTime) {
      return { fallback: true, reason: "rate-limit-after-retries" };
    }
    return { fallback: false, reason: "rate-limit-retryable" };
  }
  if (httpStatus === 408) return { fallback: false, reason: "retryable" };
  if (typeof httpStatus === "number" && httpStatus >= 500) {
    return { fallback: false, reason: "retryable" };
  }
  if (typeof httpStatus === "number" && httpStatus >= 400 && httpStatus < 500) {
    return { fallback: true, reason: "client-error" };
  }
  return { fallback: false, reason: "not-eligible" };
};

export const planModelFallback = ({
  error,
  env = process.env,
  retriesExhausted = false,
  remainingMs = null,
} = {}) => {
  const decision = classifyFallback({
    httpStatus: error && error.httpStatus != null ? error.httpStatus : null,
    message: error && error.message,
    billed: Boolean(error && error.billed),
    aborted: Boolean(error && error.aborted),
    spendCap: Boolean(error && error.spendCap),
    retriesExhausted,
    remainingMs,
  });
  if (!decision.fallback) return { action: "raise", ...decision };
  const key = env && typeof env.OPENROUTER_API_KEY === "string" ? env.OPENROUTER_API_KEY.trim() : "";
  if (!key) {
    return { action: "raise", reason: "no-fallback-configured", prior: decision.reason };
  }
  return {
    action: "fallback",
    reason: decision.reason,
    model: fallbackModelFromEnv(env),
    apiKey: key,
  };
};

export const modelPathLine = ({ provider, model, jobId }) => {
  const section = jobId ? ` section ${jobId}` : "";
  if (provider === "openrouter") return `Model path: OpenRouter fallback (${model})${section}`;
  return `Model path: Anthropic (${model})${section}`;
};

const flattenContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((block) => {
    if (!block || typeof block !== "object") return "";
    if (typeof block.text === "string" && block.text) return block.text;
    if (typeof block.content === "string") return block.content;
    if (Array.isArray(block.content)) return flattenContent(block.content);
    return "";
  }).filter(Boolean).join("\n");
};

export const anthropicMessagesToOpenAI = (messages, prompt) => {
  const source = Array.isArray(messages) && messages.length
    ? messages
    : [{ role: "user", content: prompt || "" }];
  return source.map((message) => ({
    role: message && message.role === "assistant" ? "assistant" : "user",
    content: flattenContent(message && message.content),
  })).filter((message) => message.content);
};

/* Search stays inside the same max_uses cap. A reformat has no tool and
   is asked for one JSON object, so json_object mode is safe there.
   Search replies are prose plus citations; forcing JSON would drop them. */
export const openRouterBody = ({ model, messages, maxTokens, tool }) => {
  const body = {
    model,
    messages,
    max_tokens: maxTokens,
  };
  if (model === DEFAULT_FALLBACK_MODEL) body.reasoning = { effort: "low" };
  if (tool && tool.name === "web_search") {
    const plugin = { id: "web" };
    if (Number.isFinite(Number(tool.max_uses)) && Number(tool.max_uses) > 0) {
      plugin.max_results = Number(tool.max_uses);
    }
    if (Array.isArray(tool.allowed_domains) && tool.allowed_domains.length) {
      plugin.include_domains = [...tool.allowed_domains];
    }
    body.plugins = [plugin];
  } else {
    body.response_format = { type: "json_object" };
  }
  return body;
};

const messageText = (message) => {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return flattenContent(content);
  return "";
};

const citationsFromAnnotations = (annotations) => (annotations || [])
  .filter((item) => item && item.type === "url_citation" && item.url_citation)
  .map((item) => ({
    type: "web_search_result_location",
    url: item.url_citation.url || "",
    title: item.url_citation.title || "",
    cited_text: String(item.url_citation.content || "").trim(),
  }))
  .filter((cite) => cite.cited_text);

const stopReasonFromFinish = (reason) => {
  if (reason === "stop") return "end_turn";
  if (reason === "length") return "max_tokens";
  return reason || "end_turn";
};

const fallbackContinuation = (continuation) => {
  if (continuation == null || continuation === 0) return "openrouter";
  return `${continuation}-openrouter`;
};

const finiteOrNull = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export const postOpenRouterMessage = async ({
  fetchImpl = fetch,
  apiKey,
  model,
  prompt,
  messages = null,
  maxTokens,
  tool = null,
  jobId,
  attempt,
  continuation = 0,
  signal,
  usageLog,
  now = Date.now,
}) => {
  const started = now();
  const loggedContinuation = fallbackContinuation(continuation);
  const wireMessages = anthropicMessagesToOpenAI(messages, prompt);
  usageLog.start({ jobId, attempt, continuation: loggedContinuation, model });
  const finishError = (fields) => {
    const durationMs = Math.max(0, now() - started);
    const usage = fields.usage && typeof fields.usage === "object" ? fields.usage : null;
    const inputTokens = usage ? finiteOrNull(usage.prompt_tokens) : null;
    const outputTokens = usage ? finiteOrNull(usage.completion_tokens) : null;
    const reported = usage ? finiteOrNull(usage.cost) : null;
    const record = {
      jobId,
      attempt,
      continuation: loggedContinuation,
      provider: "openrouter",
      model,
      durationMs,
      stopReason: null,
      httpStatus: fields.httpStatus ?? null,
      inputTokens,
      outputTokens,
      cacheCreationInputTokens: null,
      cacheReadInputTokens: null,
      cacheCreation: null,
      cacheWrite: { ephemeral5m: null, ephemeral1h: null, assumed5m: false },
      serverToolUse: {},
      serviceTier: null,
      usage,
      estimatedUsd: reported == null ? null : round6(reported),
      estimateComplete: false,
      unpriced: reported == null
        ? ["provider:openrouter", "usage-not-reported"]
        : ["provider:openrouter", "openrouter-reported-cost"],
      notes: ["OpenRouter usage.cost when the response has it. Not the Claude API list-price table."],
      billed: fields.billed === true,
      likelyBilled: Boolean(fields.aborted),
      aborted: Boolean(fields.aborted),
      error: fields.error ? truncate(fields.error) : null,
    };
    usageLog.finish(record);
    const error = new Error(fields.message);
    error.httpStatus = record.httpStatus;
    error.billed = fields.billed === true;
    error.aborted = Boolean(fields.aborted);
    error.fallbackAttempted = true;
    error.usageRecord = record;
    return error;
  };

  let res;
  try {
    res = await fetchImpl(OPENROUTER_CHAT_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://github.com/VolantTyler/state-of-ai-briefing",
        "X-Title": "State of AI briefing",
      },
      body: JSON.stringify(openRouterBody({
        model,
        messages: wireMessages,
        maxTokens,
        tool,
      })),
    });
  } catch (e) {
    const aborted = Boolean(signal && signal.aborted) || e.name === "AbortError";
    throw finishError({
      usage: null,
      httpStatus: null,
      billed: false,
      aborted,
      error: e.message,
      message: aborted ? "time budget exhausted" : `openrouter network: ${e.message}`,
    });
  }

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  const usage = data && data.usage && typeof data.usage === "object" ? data.usage : null;
  if (!res.ok) {
    throw finishError({
      usage,
      httpStatus: res.status,
      billed: Boolean(usage),
      aborted: false,
      error: text,
      message: `openrouter ${res.status}: ${truncate(text, 300)}`,
    });
  }
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice && choice.message;
  const reply = messageText(message);
  if (!data || !reply.trim()) {
    throw finishError({
      usage,
      httpStatus: res.status,
      billed: true,
      aborted: false,
      error: "empty response",
      message: "openrouter empty response",
    });
  }

  const reported = finiteOrNull(usage && usage.cost);
  const record = {
    jobId,
    attempt,
    continuation: loggedContinuation,
    provider: "openrouter",
    model: (data && data.model) || model,
    durationMs: Math.max(0, now() - started),
    stopReason: stopReasonFromFinish(choice && choice.finish_reason),
    httpStatus: res.status,
    inputTokens: usage ? finiteOrNull(usage.prompt_tokens) : null,
    outputTokens: usage ? finiteOrNull(usage.completion_tokens) : null,
    cacheCreationInputTokens: null,
    cacheReadInputTokens: null,
    cacheCreation: null,
    cacheWrite: { ephemeral5m: null, ephemeral1h: null, assumed5m: false },
    serverToolUse: {},
    serviceTier: null,
    usage,
    estimatedUsd: reported == null ? null : round6(reported),
    estimateComplete: false,
    unpriced: reported == null
      ? ["provider:openrouter", "usage-not-reported"]
      : ["provider:openrouter", "openrouter-reported-cost"],
    notes: ["OpenRouter usage.cost when the response has it. Not the Claude API list-price table."],
    billed: true,
    likelyBilled: false,
    aborted: false,
    error: null,
  };
  usageLog.finish(record);
  const citations = citationsFromAnnotations(message && message.annotations);
  return {
    content: [{
      type: "text",
      text: reply,
      ...(citations.length ? { citations } : {}),
    }],
    stopReason: record.stopReason,
    usageRecord: record,
  };
};

const logSkip = (jobId, error, prior) => {
  console.log("Model fallback: no fallback configured");
  console.log(JSON.stringify({
    source: "state-of-ai-briefing",
    event: "model_fallback_skipped",
    reason: "no fallback configured",
    jobId: jobId || null,
    httpStatus: error && error.httpStatus != null ? error.httpStatus : null,
    prior: prior || null,
  }));
};

/* One Anthropic call, then at most one OpenRouter call. A missing
   OPENROUTER_API_KEY keeps the Anthropic error and says so. */
export const postModelMessage = async ({
  env = process.env,
  remainingMs = null,
  retriesExhausted = false,
  onPath = () => {},
  onFallback = () => {},
  ...anthropicArgs
}) => {
  const fetchImpl = anthropicArgs.fetchImpl || fetch;
  try {
    const result = await postAnthropicMessage({ ...anthropicArgs, fetchImpl });
    const line = modelPathLine({
      provider: "anthropic",
      model: anthropicArgs.model,
      jobId: anthropicArgs.jobId,
    });
    console.log(line);
    onPath({ provider: "anthropic", model: anthropicArgs.model, jobId: anthropicArgs.jobId });
    return result;
  } catch (error) {
    const plan = planModelFallback({ error, env, retriesExhausted, remainingMs });
    if (plan.action !== "fallback") {
      if (plan.reason === "no-fallback-configured") logSkip(anthropicArgs.jobId, error, plan.prior);
      throw error;
    }
    console.log(JSON.stringify({
      source: "state-of-ai-briefing",
      event: "model_fallback",
      jobId: anthropicArgs.jobId || null,
      reason: plan.reason,
      anthropicModel: anthropicArgs.model || null,
      model: plan.model,
    }));
    try {
      const result = await postOpenRouterMessage({
        fetchImpl,
        apiKey: plan.apiKey,
        model: plan.model,
        prompt: anthropicArgs.prompt,
        messages: anthropicArgs.messages,
        maxTokens: anthropicArgs.maxTokens,
        tool: anthropicArgs.tool,
        jobId: anthropicArgs.jobId,
        attempt: anthropicArgs.attempt,
        continuation: anthropicArgs.continuation,
        signal: anthropicArgs.signal,
        usageLog: anthropicArgs.usageLog,
        now: anthropicArgs.now,
      });
      console.log(modelPathLine({
        provider: "openrouter",
        model: plan.model,
        jobId: anthropicArgs.jobId,
      }));
      onPath({ provider: "openrouter", model: plan.model, jobId: anthropicArgs.jobId });
      onFallback({
        jobId: anthropicArgs.jobId,
        provider: "openrouter",
        model: plan.model,
        anthropicModel: anthropicArgs.model || null,
        reason: plan.reason,
        httpStatus: error && error.httpStatus != null ? error.httpStatus : null,
      });
      return result;
    } catch (fallbackError) {
      const wrapped = new Error(scrubSecrets(
        `${error && error.message ? error.message : error}; OpenRouter fallback failed (${fallbackError && fallbackError.message ? fallbackError.message : fallbackError})`,
      ));
      wrapped.fallbackAttempted = true;
      wrapped.billed = Boolean(fallbackError && fallbackError.billed);
      wrapped.aborted = Boolean(fallbackError && fallbackError.aborted);
      wrapped.httpStatus = fallbackError && fallbackError.httpStatus != null ? fallbackError.httpStatus : null;
      throw wrapped;
    }
  }
};
