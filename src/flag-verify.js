import { choice } from "@typesafe-ai/sdk";

/* A flagged figure is not dropped. A second source is read, then one
   Choice decides whether that source supports the candidate, contradicts
   it, or says nothing about it. Code publishes the candidate, or keeps
   the previous value, from that label. */

export const RELATION_SUPPORTS = "supports";
export const RELATION_CONTRADICTS = "contradicts";
export const RELATION_NOTHING = "says_nothing";

export const RELATION_QUESTION =
  "How does the passage in `second` relate to the candidate figure in `candidate` for the quantity in `quantity`?";

export function relationQuestions() {
  return {
    relation: choice(RELATION_QUESTION, {
      [RELATION_SUPPORTS]: "The passage states the same figure, or a figure that rounds to the same number, for that quantity.",
      [RELATION_CONTRADICTS]: "The passage states a different figure for that same quantity.",
      [RELATION_NOTHING]: "The passage does not address that quantity.",
    }),
  };
}

export function secondSourcePrompt(flag) {
  const avoid = flag.firstSource && flag.firstSource.url
    ? ` Do not use ${hostOf(flag.firstSource.url) || flag.firstSource.url}.`
    : "";
  return `Search the web once for an independent source of this figure.${avoid}
Quantity: ${flag.quantity} for ${flag.name}. The candidate figure is ${flag.candidate} ${flag.unit}.
Stop after one search. Do not search again to add background.
Your final text block must be a single JSON object and no other characters: {"figure":null,"url":"","passage":""}
Use a null figure and an empty passage when you cannot find an independent source. The passage must be words from that source.`;
}

export function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch (e) {
    return "";
  }
}

export function sameHost(a, b) {
  const left = hostOf(a);
  const right = hostOf(b);
  return Boolean(left) && left === right;
}

/* A reply with no passage, or a passage from the first source's host,
   is not a second source. */
export function passageFromReply(parsed, firstUrl) {
  if (!parsed || typeof parsed !== "object") return null;
  const text = String(parsed.passage || "").trim();
  const url = String(parsed.url || "").trim();
  if (!text) return null;
  if (url && firstUrl && sameHost(url, firstUrl)) return null;
  const figure = parsed.figure == null || parsed.figure === "" ? null : Number(parsed.figure);
  return {
    url,
    text,
    figure: Number.isFinite(figure) ? figure : null,
  };
}

export function judgeState(flag, passage) {
  return {
    quantity: flag.quantity,
    name: flag.name,
    candidate: flag.candidate,
    unit: flag.unit,
    prior: flag.prior,
    second: {
      url: passage.url || "",
      passage: passage.text,
      figure: passage.figure,
    },
  };
}

const figureText = (n, unit) => `${n} ${unit}`;

/* `outcome` is supports, contradicts, says_nothing, or skipped.
   A skip (spend cap, time budget, error, no passage) publishes the
   candidate and marks it single source. says_nothing does the same. */
export function resolveFlag(flag, outcome = {}) {
  const firstUrl = flag.firstSource && flag.firstSource.url;
  const secondUrl = outcome.secondUrl || "";
  const sources = [firstUrl, secondUrl].filter(Boolean);
  const trigger = flag.reason ? `${flag.reason} ` : "";
  if (outcome.outcome === RELATION_CONTRADICTS) {
    const other = outcome.secondFigure == null
      ? "a different figure"
      : figureText(outcome.secondFigure, flag.unit);
    return {
      field: flag.field,
      name: flag.name,
      publish: flag.prior,
      check: {
        status: "unconfirmed",
        value: flag.prior,
        candidate: flag.candidate,
        reason: `${trigger}Kept ${figureText(flag.prior, flag.unit)}. Candidate ${figureText(flag.candidate, flag.unit)} was contradicted by ${other}.`,
        sources,
      },
    };
  }
  if (outcome.outcome === RELATION_SUPPORTS) {
    return {
      field: flag.field,
      name: flag.name,
      publish: flag.candidate,
      check: {
        status: "confirmed",
        value: flag.candidate,
        candidate: flag.candidate,
        reason: `${trigger}A second source agrees with ${figureText(flag.candidate, flag.unit)}.`,
        sources,
      },
    };
  }
  const why = outcome.outcome === RELATION_NOTHING
    ? "the second source does not address this figure"
    : (outcome.skipReason || "no independent passage");
  return {
    field: flag.field,
    name: flag.name,
    publish: flag.candidate,
    check: {
      status: "single source",
      value: flag.candidate,
      candidate: flag.candidate,
      reason: `${trigger}Published ${figureText(flag.candidate, flag.unit)} from one source (${why}).`,
      sources: firstUrl ? [firstUrl] : [],
    },
  };
}

export async function judgeSecondSource({ flag, passage, ask }) {
  const response = await ask({
    state: judgeState(flag, passage),
    questions: relationQuestions(),
    model: "jev-latest",
  });
  const choiceAnswer = response && response.answers && response.answers.relation;
  const picked = choiceAnswer && choiceAnswer.choice;
  const outcome = picked === RELATION_SUPPORTS || picked === RELATION_CONTRADICTS || picked === RELATION_NOTHING
    ? picked
    : RELATION_NOTHING;
  return {
    outcome,
    secondUrl: passage.url || "",
    secondFigure: passage.figure,
    model: response && response.model || null,
    usage: response && response.usage || null,
  };
}

/* Lookups run one at a time so a spend cap can stop the next one.
   Anything that does not return a contradiction publishes the candidate. */
export async function verifyFlags(flags, { canStart, lookup, judge }) {
  const resolutions = [];
  for (const flag of flags) {
    const gate = canStart ? canStart() : { ok: true };
    if (!gate || gate.ok === false) {
      resolutions.push(resolveFlag(flag, {
        outcome: "skipped",
        skipReason: (gate && gate.reason) || "spend cap",
      }));
      continue;
    }
    let passage = null;
    try {
      passage = await lookup(flag);
    } catch (e) {
      resolutions.push(resolveFlag(flag, {
        outcome: "skipped",
        skipReason: String(e && e.message || e).slice(0, 240),
      }));
      continue;
    }
    if (!passage) {
      resolutions.push(resolveFlag(flag, {
        outcome: "skipped",
        skipReason: "no independent passage",
      }));
      continue;
    }
    try {
      const judged = await judge(flag, passage);
      resolutions.push(resolveFlag(flag, judged));
    } catch (e) {
      resolutions.push(resolveFlag(flag, {
        outcome: "skipped",
        skipReason: String(e && e.message || e).slice(0, 240),
      }));
    }
  }
  return resolutions;
}

const FIELD_LIST = {
  val: ["valuations", "name", "value"],
  rev: ["revenue", "name", "value"],
  users: ["users", "name", "users"],
  share: ["webShare", "name", "value"],
};

function writeNamed(data, field, name, value) {
  const spec = FIELD_LIST[field];
  if (!spec) return data;
  const [list, key, prop] = spec;
  const next = {
    ...data,
    [list]: data[list].map((row) => (row[key] === name ? { ...row, [prop]: value } : row)),
  };
  if (field === "users") next.users = [...next.users].sort((a, b) => b.users - a.users);
  if (field === "val") next.valuations = [...next.valuations].sort((a, b) => b.value - a.value);
  return next;
}

function syncRace(data) {
  const race = [...data.race];
  const a = data.valuations.find((x) => x.name === "Anthropic");
  const o = data.valuations.find((x) => x.name === "OpenAI");
  race[race.length - 1] = {
    ...race[race.length - 1],
    Anthropic: a ? a.value : null,
    OpenAI: o ? o.value : null,
  };
  return { ...data, race };
}

/* Named shares that already add up are allowed a residual Others slice.
   A total outside 90–110 is left alone so Others is not clamped over it. */
export function rebalanceShareOthers(data, { min = 90, max = 110 } = {}) {
  const named = data.webShare.filter((row) => row.name !== "Others");
  const sum = named.reduce((total, row) => total + Number(row.value), 0);
  if (!(sum >= min && sum <= max)) return data;
  const others = Math.max(0, Math.round((100 - sum) * 10) / 10);
  return {
    ...data,
    webShare: data.webShare.map((row) => (row.name === "Others" ? { ...row, value: others } : row)),
  };
}

export function commitResolutions(data, resolutions) {
  let next = { ...data, checks: { ...(data.checks || {}) } };
  let share = false;
  let valuations = false;
  for (const res of resolutions || []) {
    const group = { ...(next.checks[res.field] || {}) };
    group[res.name] = res.check;
    next = {
      ...next,
      checks: { ...next.checks, [res.field]: group },
    };
    next = writeNamed(next, res.field, res.name, res.publish);
    if (res.field === "share") share = true;
    if (res.field === "val") valuations = true;
  }
  if (valuations) next = syncRace(next);
  if (share) next = rebalanceShareOthers(next);
  return next;
}

/* Typesafe tokens are recorded on the usage row and left out of the
   Anthropic dollar total. `estimatedUsd` stays null on purpose. */
export function typesafeUsageRecord({ jobId = "verify", attempt = 1, model, usage, error = null }) {
  const inputTokens = usage && Number.isFinite(Number(usage.input_tokens)) ? Number(usage.input_tokens) : null;
  const outputTokens = usage && Number.isFinite(Number(usage.output_tokens)) ? Number(usage.output_tokens) : null;
  return {
    provider: "typesafe",
    jobId,
    attempt,
    continuation: "judge",
    model: model || "jev-latest",
    durationMs: null,
    stopReason: null,
    httpStatus: error ? null : 200,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreation: null,
    cacheWrite: { ephemeral5m: 0, ephemeral1h: 0, assumed5m: false },
    serverToolUse: {},
    serviceTier: null,
    usage: usage || null,
    estimatedUsd: null,
    estimateComplete: true,
    unpriced: [],
    notes: ["Typesafe input tokens are logged and are not part of the Anthropic estimate."],
    webSearchUsd: 0,
    inputUsd: null,
    outputUsd: null,
    cacheReadUsd: null,
    cacheWrite5mUsd: null,
    cacheWrite1hUsd: null,
    billed: false,
    aborted: false,
    error,
  };
}
