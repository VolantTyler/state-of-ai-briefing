import { choice, noul } from "@typesafe-ai/sdk";

/* Questions and the write gate live here so a review can find them together.
   The public site does not mention any of this. dev/jev-actions.md is rewritten
   from these same strings on each refresh. */

export const MODEL = "jev-latest";
export const NONE = "none";
/* Example gate from the TypeSafe Noul docs (`YES = 0.8`). Not tuned on this
   briefing's sources. A value at or below the gate keeps the prior number. */
export const NOUL_YES = 0.8;
export const MIN_BILLIONS = 1;
export const MAX_CANDIDATES = 12;

export const LATEST_PRICE_QUESTION =
  "Which candidate is the latest completed price for the company in `company`? A completed price is a completed funding round's post-money valuation of that company, or the market capitalization of that company on an exchange where that company itself is listed.";

export const COMPLETED_PRICE_TRUE =
  "A completed funding round's post-money valuation of this company, or the market capitalization of this company on an exchange where this company itself is listed.";

export const COMPLETED_PRICE_FALSE =
  "The size of a round, a price still being negotiated, revenue or annualized revenue, the market cap of a parent or acquirer, an IPO offering price, or a price for a different company.";

export function completedPriceQuestion(id) {
  return `Does candidate ${id} report a completed price for the company in \`company\`? Read that candidate's snippet in \`candidates\`.`;
}

const ALIASES = {
  Anthropic: ["Anthropic"],
  OpenAI: ["OpenAI"],
  xAI: ["xAI", "x.ai"],
  Databricks: ["Databricks"],
  "Z.ai (Zhipu)": ["Z.ai", "Zhipu"],
  DeepSeek: ["DeepSeek"],
  Anduril: ["Anduril"],
  "Moonshot AI": ["Moonshot", "Kimi"],
  MiniMax: ["MiniMax"],
};

const MONEY_RE = /(?:(?:\$|USD)\s*)?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(trillion|billion|million|bn|tn)\b|(?:\$|USD)\s*(\d+(?:\.\d+)?)\s*([BMTbmt])\b/gi;

export function citationsFromContent(blocks) {
  const out = [];
  for (const block of blocks || []) {
    for (const cite of block.citations || []) {
      const text = String(cite.cited_text || cite.citedText || "").trim();
      if (!text) continue;
      out.push({ url: cite.url || "", title: cite.title || "", text });
    }
  }
  return out;
}

function mentions(text, company) {
  const aliases = ALIASES[company] || [company];
  return aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9])${escaped}(?=$|[^A-Za-z0-9])`, "i").test(text);
  });
}

function roundBillions(n) {
  return Math.round(n * 10) / 10;
}

function toBillions(n, unit) {
  const u = unit.toLowerCase();
  if (u === "t" || u === "tn" || u === "trillion") return roundBillions(n * 1000);
  if (u === "m" || u === "million") return roundBillions(n / 1000);
  if (u === "b" || u === "bn" || u === "billion") return roundBillions(n);
  return null;
}

function snippetAround(text, index, length) {
  const radius = 280;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  let slice = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) slice = `…${slice}`;
  if (end < text.length) slice = `${slice}…`;
  return slice;
}

export function extractCandidates(passages, company) {
  const found = [];
  const seen = new Set();
  for (const passage of passages || []) {
    const text = String(passage.text || "");
    if (!mentions(text, company)) continue;
    for (const match of text.matchAll(new RegExp(MONEY_RE.source, "gi"))) {
      const raw = match[1] || match[3];
      const unit = match[2] || match[4];
      const n = Number(String(raw).replace(/,/g, ""));
      const billions = toBillions(n, unit);
      if (!billions || billions < MIN_BILLIONS) continue;
      const span = match[0].replace(/\s+/g, " ").trim();
      const snippet = snippetAround(text, match.index, match[0].length);
      const key = `${span}\n${snippet}\n${passage.url || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({
        span,
        billions,
        snippet,
        source: passage.url || "",
        title: passage.title || "",
      });
    }
  }
  const truncated = found.length > MAX_CANDIDATES;
  const candidates = found.slice(0, MAX_CANDIDATES).map((c, i) => ({ ...c, id: `c${i + 1}` }));
  return { candidates, omitted: truncated ? found.length - MAX_CANDIDATES : 0 };
}

export function stateFor(company, candidates) {
  return {
    company,
    candidates: candidates.map((c) => ({
      id: c.id,
      amount: c.span,
      billions_usd: c.billions,
      snippet: c.snippet,
      source: c.source,
    })),
  };
}

export function questionsFor(candidates) {
  const criteria = {
    [NONE]: "No candidate is a completed price for this company.",
  };
  for (const c of candidates) criteria[c.id] = `${c.span} — ${c.snippet}`;
  const questions = {
    latest: choice(LATEST_PRICE_QUESTION, criteria),
  };
  for (const c of candidates) {
    questions[`completed_${c.id}`] = noul(completedPriceQuestion(c.id), {
      true: COMPLETED_PRICE_TRUE,
      false: COMPLETED_PRICE_FALSE,
    });
  }
  return questions;
}

export function decide(candidates, answers) {
  const latest = answers && answers.latest;
  const picked = latest && latest.choice;
  const candidate = candidates.find((c) => c.id === picked);
  if (!candidate || picked === NONE) {
    return { action: "kept", reason: "none", picked: picked || NONE, noul: null };
  }
  const noulAnswer = answers[`completed_${candidate.id}`];
  const probability = noulAnswer && typeof noulAnswer.noul === "number" ? noulAnswer.noul : null;
  if (probability == null) {
    return { action: "kept", reason: "missing-noul", picked, noul: null };
  }
  if (probability > NOUL_YES) {
    return { action: "wrote", reason: "accepted", picked, noul: probability, billions: candidate.billions };
  }
  return { action: "kept", reason: "noul-below-gate", picked, noul: probability };
}

export async function judgeValuations({ companies, passages, ask }) {
  const results = await Promise.all(companies.map(async (company) => {
    const { candidates, omitted } = extractCandidates(passages, company.name);
    const base = {
      company: company.name,
      prior: company.value,
      candidates,
      omitted,
      action: "kept",
      reason: "no-candidates",
      picked: null,
      noul: null,
      billions: null,
      choice: null,
      nouls: {},
      model: null,
      usage: null,
      error: null,
    };
    if (!candidates.length) return base;
    try {
      const response = await ask({
        state: stateFor(company.name, candidates),
        questions: questionsFor(candidates),
        model: MODEL,
      });
      const decision = decide(candidates, response.answers);
      const nouls = {};
      for (const c of candidates) {
        const answer = response.answers[`completed_${c.id}`];
        if (answer && typeof answer.noul === "number") nouls[c.id] = answer.noul;
      }
      return {
        ...base,
        ...decision,
        choice: response.answers.latest || null,
        nouls,
        model: response.model || null,
        usage: response.usage || null,
      };
    } catch (e) {
      return { ...base, reason: "error", error: String(e && e.message || e) };
    }
  }));

  const accepted = {};
  for (const result of results) {
    if (result.action === "wrote") accepted[result.company] = result.billions;
  }
  const withCandidates = results.filter((r) => r.candidates.length);
  const failed = withCandidates.filter((r) => r.error);
  if (withCandidates.length && failed.length === withCandidates.length) {
    const error = new Error(failed.map((r) => `${r.company}: ${r.error}`).join("; "));
    error.results = results;
    throw error;
  }
  return { results, accepted };
}

function pct(n) {
  return typeof n === "number" ? n.toFixed(2) : "—";
}

function money(n) {
  return typeof n === "number" ? `$${n}B` : "the prior mark";
}

function actionSentence(result) {
  if (result.error) return `Kept ${money(result.prior)}. The request failed: ${result.error}`;
  if (result.reason === "no-candidates") {
    return `Kept ${money(result.prior)}. No cited amount named this company, so Jev was not asked.`;
  }
  if (result.reason === "none") {
    return `Kept ${money(result.prior)}. Choice selected none, so code did not copy an amount.`;
  }
  if (result.reason === "missing-noul") {
    return `Kept ${money(result.prior)}. Choice selected ${result.picked}, and that candidate had no Noul answer.`;
  }
  if (result.reason === "noul-below-gate") {
    return `Kept ${money(result.prior)}. Choice selected ${result.picked}, and the Noul on that snippet was ${pct(result.noul)}, which is not above ${NOUL_YES}.`;
  }
  return `Wrote ${money(result.billions)}. Choice selected ${result.picked} and the Noul on that snippet was ${pct(result.noul)}, above ${NOUL_YES}, so code copied the amount the regex had parsed.`;
}

export function renderJevActions(report = {}) {
  const lines = [];
  lines.push("# What Jev did on the valuations refresh");
  lines.push("");
  lines.push("This file is not served on the site. The nightly refresh rewrites it.");
  lines.push("The dashboard copy does not describe these judgments.");
  lines.push("");
  lines.push("Jev does not search and does not invent the number. Code finds dollar amounts in cited passages. Jev judges those passages. Code copies one parsed amount, or leaves the previous mark in place.");
  lines.push("");
  lines.push("## The questions");
  lines.push("");
  lines.push("Each company is one request. The Choice and every Noul see the same state and do not see each other's answers. State is the company name plus the candidates (`id`, the matched amount, the snippet, the source).");
  lines.push("");
  lines.push("### Choice — which candidate is the latest completed price");
  lines.push("");
  lines.push(`> ${LATEST_PRICE_QUESTION}`);
  lines.push("");
  lines.push("The options are the candidate ids, plus `none` when no candidate is that price. Code records Choice confidence and does not use it as permission to write. A split between two real prices can lower confidence without making either price false.");
  lines.push("");
  lines.push("### Noul — does this snippet report a completed price");
  lines.push("");
  lines.push("One Noul per candidate. For candidate `c1` the question is:");
  lines.push("");
  lines.push(`> ${completedPriceQuestion("c1")}`);
  lines.push("");
  lines.push(`- **Yes:** ${COMPLETED_PRICE_TRUE}`);
  lines.push(`- **No:** ${COMPLETED_PRICE_FALSE}`);
  lines.push("");
  lines.push(`The answer is the probability of yes. Code writes the chosen amount only when Choice picks that candidate and this probability is above ${NOUL_YES}. Otherwise the panel keeps its previous number. ${NOUL_YES} is the example gate from the TypeSafe docs. It is not fitted to these sources.`);
  lines.push("");
  lines.push("A yes covers a private last-round mark and the market cap of a company that itself trades. Whether a source is trustworthy is a different question.");
  lines.push("");
  lines.push("## What code does before Jev");
  lines.push("");
  lines.push(`A regex pulls dollar amounts out of cited passages that name the company. Amounts under $${MIN_BILLIONS} billion are dropped. At most ${MAX_CANDIDATES} candidates are sent. The number later written on the panel is one of those regex matches, normalized to billions of USD.`);
  lines.push("");
  lines.push("## Latest run");
  lines.push("");

  if (!report.ran) {
    lines.push("No refresh has written this file yet.");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  lines.push(report.at ? `Ran ${report.at}.` : "Ran.");
  if (report.error) lines.push("", `Search or judgment failed: ${report.error}`);
  lines.push("", `Cited passages: ${report.passageCount || 0}.`);
  lines.push("");

  for (const result of report.results || []) {
    lines.push(`### ${result.company}`);
    lines.push("");
    lines.push(actionSentence(result));
    if (result.omitted) lines.push("", `${result.omitted} further cited amounts were left out of the request.`);
    if (result.model || result.usage) {
      const usage = result.usage
        ? `${result.usage.input_tokens ?? "?"} input tokens, ${result.usage.output_tokens ?? "?"} output tokens`
        : "token usage not reported";
      lines.push("", `Model ${result.model || "—"}. ${usage}.`);
    }
    if (result.candidates.length) {
      lines.push("", "Candidates code found:");
      lines.push("");
      for (const c of result.candidates) {
        const noulP = result.nouls && typeof result.nouls[c.id] === "number" ? ` · Noul ${pct(result.nouls[c.id])}` : "";
        const src = c.source ? ` · ${c.source}` : "";
        lines.push(`- \`${c.id}\` ${c.span} → ${c.billions} billion USD${noulP}${src}`);
        lines.push(`  ${c.snippet}`);
      }
    }
    if (result.choice && result.choice.probabilities) {
      const probs = Object.entries(result.choice.probabilities)
        .sort((a, b) => b[1] - a[1])
        .map(([label, p]) => `${label} ${pct(p)}`)
        .join(", ");
      lines.push("", `Choice: ${result.choice.choice} (confidence ${pct(result.choice.confidence)}). Probabilities: ${probs}.`);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
