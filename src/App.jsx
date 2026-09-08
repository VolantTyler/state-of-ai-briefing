import React, { useState, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList, Legend,
} from "recharts";
import { useBriefingData } from "./useBriefingData.js";
import {
  EDITION, INK, PAPER, FAINT, RULE_SOFT, C, TEXT_BRICK, TEXT_CLAY,
  BRAND_COLOR, BRAND_OF, brandFill,
  BASELINE, TRACKERS, SRC, snapshot, panelTimes,
} from "./briefing-data.js";

/* ——— How old is it? ———
   One vocabulary for every timestamp on the page. `span` is the bare
   magnitude ("9 days"), `ago` is the same thing as an age ("9 days ago").
   Everything spells the unit out: at 10px mono in a card corner "9d" reads
   as a code, and the whole point of these stamps is that a reader can tell
   at a glance whether a number is current. */
const span = (iso) => {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return null;
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"}`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"}`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};

const ago = (iso) => {
  const s = span(iso);
  return s ? `${s} ago` : iso ? "just now" : null;
};

/* The nightly cron fires at 08:00 UTC, and Vercel fires it within the hour,
   so a panel checked inside the last two days is on schedule — one late run
   is not a fault. Past that, something is actually wrong. */
const STALE_MS = 2 * 24 * 60 * 60 * 1000;
const isStale = (iso) => !iso || Date.now() - new Date(iso).getTime() > STALE_MS;

/* ——— What the corner of a panel says ———

   The old stamp said "Refreshed 9d ago" whether the job had run nightly and
   found nothing new, or had not run at all since August. Those are opposite
   situations — one is the dashboard working, the other is the dashboard
   broken — and they read identically, so a healthy panel looked like a fault.

   Four states now, and only the last two are problems:

     Refreshed 5 hours ago                            checked, numbers moved
     Refreshed 5 hours ago · no change in 9 days      checked, nothing to move
     Last checked 9 days ago                          the check itself stopped
     Refresh failed 5 hours ago                       the check ran and errored

   Tone carries the same split as the words, so the distinction survives a
   glance that doesn't stop to read: faint for the two healthy states, clay
   for a stalled check, brick for an outright failure. */
const refreshStamp = (meta) => {
  const t = panelTimes(meta);
  if (!t) return { text: "Baseline data", tone: "faint" };

  if (t.failed) {
    /* A panel with no `checkedAt` at all has never once come back clean, so
       there are no "prior values" from a refresh to point at — it is showing
       the seeded baseline. Saying "failed 5 hours ago" there would imply a
       working panel that had one bad night. */
    if (!t.checkedAt) {
      return {
        text: "Refresh has never succeeded · showing seeded values",
        tone: "bad",
        title: t.error ? `Reason: ${t.error}` : "This panel has no successful refresh on record.",
      };
    }
    return {
      text: `Refresh failed ${ago(t.erroredAt || t.checkedAt)} · showing values from ${ago(t.checkedAt)}`,
      tone: "bad",
      title: t.error ? `Reason: ${t.error}` : undefined,
    };
  }

  if (!t.checkedAt) return { text: "Awaiting first refresh", tone: "warn" };

  if (isStale(t.checkedAt)) {
    return {
      text: `Last checked ${ago(t.checkedAt)}`,
      tone: "warn",
      title: "The nightly refresh has not successfully checked this panel since then — the values shown are that old.",
    };
  }

  /* Checked on schedule. If the numbers themselves haven't moved, say so
     rather than letting the reader assume the check is what went quiet.

     Only worth saying once a full day has passed without a move, though: on
     a nightly job every panel is trivially "unchanged since this morning",
     and a suffix that never goes away stops carrying information.
     `changedAt` is also null for panels last written before the two
     timestamps were split, where there is nothing truthful to add. */
  const heldSince = t.changedAt && t.changedAt < t.checkedAt ? t.changedAt : null;
  const held = heldSince && Date.now() - new Date(heldSince).getTime() >= 24 * 60 * 60 * 1000
    ? span(heldSince) : null;
  return {
    text: `Refreshed ${ago(t.checkedAt)}${held ? ` · no change in ${held}` : ""}`,
    tone: "faint",
    title: held ? `Checked nightly. The last time any figure in this panel moved was ${ago(heldSince)}.` : undefined,
  };
};

/* ——— In-page navigation ———
   This document renders inside a sandboxed frame. Two consequences, both of
   which quietly broke href="#id" jumps in v2.2/v2.3:
     1. There is no navigable document URL for a fragment to attach to, so the
        browser resolves the click to nothing at all.
     2. The element that actually scrolls is frequently an ancestor of the
        frame, not the frame's own <html> — which is also why
        `html { scroll-behavior: smooth }` never applied.
   So we never ask the browser to navigate. We find whatever genuinely scrolls
   and move it ourselves, falling back outward until something works. */
const reducedMotion = () => {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  catch (e) { return false; }
};

const scrollerFor = (el) => {
  let node = el && el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    let oy = "";
    try { oy = window.getComputedStyle(node).overflowY || ""; } catch (e) {}
    if (/(auto|scroll|overlay)/.test(oy) && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  const doc = document.scrollingElement || document.documentElement;
  return doc && doc.scrollHeight > doc.clientHeight + 1 ? doc : null;
};

const isDocScroller = (s) =>
  !!s && (s === document.scrollingElement || s === document.documentElement || s === document.body);

const moveTo = (scroller, top, behavior, el) => {
  const y = Math.max(0, top);
  if (scroller && !isDocScroller(scroller)) {
    try { scroller.scrollTo({ top: y, behavior }); } catch (e) { scroller.scrollTop = y; }
    return true;
  }
  if (scroller) {
    try { window.scrollTo({ top: y, behavior }); return true; }
    catch (e) {
      try { window.scrollTo(0, y); return true; }
      catch (e2) { scroller.scrollTop = y; return true; }
    }
  }
  /* Nothing inside the frame scrolls — the host page is the scroller.
     scrollIntoView is the one call that reaches across that boundary. */
  if (el) {
    try { el.scrollIntoView({ behavior, block: "start" }); return true; }
    catch (e) { try { el.scrollIntoView(); return true; } catch (e2) {} }
  }
  return false;
};

const scrollToId = (id, offset = 16) => {
  if (typeof document === "undefined") return false;
  const el = document.getElementById(id);
  if (!el) return false;
  const behavior = reducedMotion() ? "auto" : "smooth";
  const scroller = scrollerFor(el);
  if (!scroller) return moveTo(null, 0, behavior, el);
  const top = isDocScroller(scroller)
    ? el.getBoundingClientRect().top + (window.pageYOffset != null ? window.pageYOffset : scroller.scrollTop) - offset
    : scroller.scrollTop + (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - offset;
  return moveTo(scroller, top, behavior, el);
};

const scrollToTop = () => {
  if (typeof document === "undefined") return false;
  const el = document.getElementById("top");
  const behavior = reducedMotion() ? "auto" : "smooth";
  const scroller = el ? scrollerFor(el) : (document.scrollingElement || document.documentElement);
  return moveTo(scroller, 0, behavior, el);
};

/* ——— UI atoms ——— */
const mono = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };
const serif = { fontFamily: "'Newsreader', Georgia, 'Times New Roman', serif" };

const Eyebrow = ({ children, style }) => (
  <div style={{ ...mono, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: FAINT, ...style }}>{children}</div>
);

const SectionHead = ({ n, title, sub, id }) => (
  <div id={id} style={{ marginTop: 56, marginBottom: 20, scrollMarginTop: 24 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 14, borderTop: `1px solid ${INK}`, paddingTop: 14 }}>
      <span style={{ ...mono, fontSize: 12, color: FAINT }}>§ {n}</span>
      <h2 style={{ ...serif, fontSize: 27, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>{title}</h2>
    </div>
    {sub && <p style={{ ...serif, fontSize: 15, color: FAINT, margin: "6px 0 0 0", fontStyle: "italic" }}>{sub}</p>}
  </div>
);

/* ——— Back to top: ^-only icon button, dropped at the end of every section ———
   Kept as an <a href="#top"> for semantics and keyboard behavior, but the
   click is handled in JS — see the In-page navigation note above. */
const BackToTop = () => (
  <div style={{ display: "flex", justifyContent: "flex-end", margin: "10px 0 0" }}>
    <a href="#top" aria-label="Back to top"
      onClick={(e) => { e.preventDefault(); scrollToTop(); }}
      style={{ ...mono, fontSize: 13, lineHeight: 1, textDecoration: "none", color: INK, background: PAPER, border: `1px solid ${INK}`, borderRadius: 2, padding: "6px 11px", boxShadow: "2px 2px 0 rgba(25,23,20,0.15)" }}>
      ^
    </a>
  </div>
);

/* ——— Table of contents: collapsible, responsive, links to every § section ——— */
const TOC = ({ items, open, onToggle }) => (
  <div style={{ border: `1px solid ${INK}`, borderRadius: 2, background: PAPER, padding: "16px 20px", marginTop: 18, boxShadow: "3px 3px 0 rgba(25,23,20,0.08)" }}>
    <button onClick={onToggle} aria-expanded={open} aria-controls="toc-nav"
      style={{ ...mono, fontSize: 10.5, letterSpacing: "0.22em", textTransform: "uppercase", color: FAINT, background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 9 }}>
      <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>▸</span>
      Contents
    </button>
    {open && (
      <nav id="toc-nav" style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "6px 20px" }}>
        {items.map((it) => (
          <a key={it.id} href={`#${it.id}`}
            onClick={(e) => { e.preventDefault(); scrollToId(it.id, 20); }}
            style={{ ...serif, fontSize: 14.5, color: INK, textDecoration: "none", padding: "3px 0", borderBottom: `1px solid ${RULE_SOFT}` }}>
            <span style={{ ...mono, fontSize: 10, color: FAINT, marginRight: 9 }}>§ {it.n}</span>{it.title}
          </a>
        ))}
      </nav>
    )}
  </div>
);

/* ——— AA Index: only crowded points cluster; everyone else keeps the line ———
   Live model names carry verbose reasoning-effort qualifiers (e.g. "Claude
   Opus 5 (Adaptive Reasoning, High Effort)") that are far wider than the
   gap between two close scores — packing every model onto one line, even
   in separate lanes, made labels overlap regardless. Two moves fix that
   without hiding anyone:
     · a model alone at its point keeps its name on the primary line, shown
       as the base name only; the variant qualifier is the fine print, so it
       surfaces on hover and in the cluster list rather than on the axis.
     · models crowding the *same* point (within POINT_EPSILON, where their
       dots would sit on top of each other) collapse into one lettered mark,
       and are unpacked below on their own number line whose full width
       covers only that sliver of the axis.
   Hovering links the two halves: a cluster to its detail section, a zoomed
   dot to its row. Scales without new crowding — a tighter frontier just
   grows the clusters, not the overlap. */
const POINT_EPSILON = 0.2; // scores this close share a point on the primary axis
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* "Claude Opus 5 (Adaptive Reasoning, Max Effort)" → base + variant. The base
   names the model on the axis; the variant says which configuration was
   scored, which only matters once you're reading a specific number. */
const splitModelName = (name) => {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name);
  return m && m[1] ? { base: m[1], sub: m[2] } : { base: name, sub: null };
};

/* Brand color: verbose names miss BRAND_OF's exact keys, so try the base
   name before falling back to the lab. */
const dotFill = (it) =>
  (it.cn ? C.clay : brandFill(it.model, brandFill(splitModelName(it.model).base, brandFill(it.lab, C.plum))));

const groupByPoint = (items) => {
  const sorted = [...items].sort((a, b) => a.score - b.score);
  const groups = [];
  for (const it of sorted) {
    const last = groups[groups.length - 1];
    if (last && it.score - last[last.length - 1].score <= POINT_EPSILON) last.push(it);
    else groups.push([it]);
  }
  const byScore = groups
    .map((g) => ({ items: g, min: Math.min(...g.map((i) => i.score)), max: Math.max(...g.map((i) => i.score)) }))
    .sort((a, b) => b.max - a.max);
  let li = 0;
  return byScore.map((c) => (c.items.length > 1 ? { ...c, letter: LETTERS[li++] || "?" } : c));
};

/* A cluster of exact ties has no range to print — "60.0", not "60.0–60.0". */
const rangeLabel = (c) => (c.max - c.min > 0.001 ? `${c.min.toFixed(1)}–${c.max.toFixed(1)}` : c.min.toFixed(1));

/* Sweep-line lane packer: bumps a node to the next lane only when it
   collides with the last (rightmost) node already placed in that lane —
   guarantees no two same-lane footprints overlap, however wide. */
const packLanes = (nodes) => {
  const sorted = [...nodes].sort((a, b) => a.x - b.x);
  const laneLast = [];
  return sorted.map((n) => {
    let lane = 0;
    while (laneLast[lane] && n.x - laneLast[lane].x < n.halfWidth + laneLast[lane].halfWidth) lane++;
    laneLast[lane] = n;
    return { ...n, lane };
  });
};

const truncateLabel = (s, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const AAOverview = ({ clusters, allItems, topScore, hoverCluster, onHoverCluster, hoverModel, onHoverModel }) => {
  const W = 800, marginX = 54, usableW = W - marginX * 2;
  const scores = allItems.map((m) => m.score);
  const domainMin = Math.floor(Math.min(...scores)) - 1;
  const domainMax = Math.ceil(Math.max(...scores)) + 1;
  const xScale = (s) => marginX + ((s - domainMin) / (domainMax - domainMin)) * usableW;
  const ticks = [];
  for (let t = domainMin; t <= domainMax; t++) ticks.push(t);

  const nodes = clusters.map((c) => {
    if (c.items.length === 1) {
      const it = c.items[0];
      const { base, sub } = splitModelName(it.model);
      const label = truncateLabel(base);
      /* mono advances ~6.3px/char at 10.5px — half the label, plus air */
      return { kind: "single", item: it, base: label, sub, x: xScale(it.score), halfWidth: label.length * 3.2 + 9 };
    }
    return { kind: "cluster", cluster: c, x: xScale((c.min + c.max) / 2), x0: xScale(c.min), x1: xScale(c.max), halfWidth: 64 };
  });
  const laid = packLanes(nodes);
  const maxLane = Math.max(0, ...laid.map((n) => n.lane));
  /* Reserve the hover row up front so revealing a variant never reflows. */
  const hoverRow = nodes.some((n) => n.kind === "single" && n.sub) ? 22 : 0;
  const laneStep = 40, topPad = 50 + hoverRow, belowBaseline = 26;
  const baseline = topPad + maxLane * laneStep;
  const svgH = baseline + belowBaseline;

  return (
    <div style={{ height: Math.min(svgH * (860 / W), 460) }}>
      <svg viewBox={`0 0 ${W} ${svgH}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <line x1={marginX} y1={baseline} x2={W - marginX} y2={baseline} stroke={INK} strokeWidth={1} />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={xScale(t)} y1={baseline - 4} x2={xScale(t)} y2={baseline + 4} stroke={RULE_SOFT} />
            <text x={xScale(t)} y={baseline + 19} textAnchor="middle" style={{ ...mono, fontSize: 10.5, fill: FAINT }}>{t}</text>
          </g>
        ))}
        {laid.map((n) => {
          const topY = baseline - 24 - n.lane * laneStep;
          if (n.kind === "single") {
            const it = n.item;
            const isLeader = it.score === topScore;
            const on = hoverModel === it.model;
            const r = isLeader ? 7.5 : 6;
            const chipW = n.sub ? Math.max(44, n.sub.length * 5.4 + 14) : 0;
            return (
              <g key={it.model} onMouseEnter={() => onHoverModel(it.model)} onMouseLeave={() => onHoverModel(null)}>
                <line x1={n.x} y1={topY + r + 1} x2={n.x} y2={baseline - 4} stroke={RULE_SOFT} strokeWidth={1} />
                <circle cx={n.x} cy={topY} r={on ? r + 1.5 : r} fill={dotFill(it)} stroke={INK} strokeWidth={on || isLeader ? 1.5 : 1} />
                <text x={n.x} y={topY - 13} textAnchor="middle" style={{ ...mono, fontSize: 10.5, fontWeight: isLeader ? 500 : 400, fill: INK }}>{n.base}</text>
                <text x={n.x} y={topY - 25} textAnchor="middle" style={{ ...mono, fontSize: 9.5, fill: on ? INK : FAINT }}>{it.score.toFixed(1)}</text>
                {on && n.sub && (
                  <g>
                    <rect x={n.x - chipW / 2} y={topY - 47} width={chipW} height={15} rx={2} fill={PAPER} stroke={RULE_SOFT} strokeWidth={1} />
                    <text x={n.x} y={topY - 36.5} textAnchor="middle" style={{ ...mono, fontSize: 9, fill: FAINT }}>{n.sub}</text>
                  </g>
                )}
                <circle cx={n.x} cy={topY} r={18} fill="transparent" />
                <title>{it.model}</title>
              </g>
            );
          }
          const c = n.cluster;
          const hasLeader = c.items.some((it) => it.score === topScore);
          const on = hoverCluster === c.letter;
          const badgeY = topY - 4;
          const pillX = n.x0 - 10, pillW = Math.max(20, n.x1 - n.x0 + 20);
          return (
            <g key={c.letter} onMouseEnter={() => onHoverCluster(c.letter)} onMouseLeave={() => onHoverCluster(null)}>
              <rect x={pillX} y={baseline - 9} width={pillW} height={18} rx={9} fill={on ? C.neutral : C.paperDeep} stroke={INK} strokeWidth={on ? 2 : hasLeader ? 1.5 : 1} />
              <line x1={n.x} y1={badgeY + 9} x2={n.x} y2={baseline - 9} stroke={RULE_SOFT} strokeWidth={1} />
              <circle cx={n.x} cy={badgeY} r={9} fill={on ? INK : PAPER} stroke={INK} strokeWidth={on ? 1.75 : 1.25} />
              <text x={n.x} y={badgeY + 3.5} textAnchor="middle" style={{ ...mono, fontSize: 10, fontWeight: 600, fill: on ? PAPER : INK }}>{c.letter}</text>
              <text x={n.x} y={badgeY - 13} textAnchor="middle" style={{ ...mono, fontSize: 9.5, fill: on ? INK : FAINT }}>{c.items.length} models · {rangeLabel(c)}</text>
              <rect x={Math.min(pillX, n.x - 44)} y={badgeY - 21} width={Math.max(pillW, 88)} height={baseline + 11 - badgeY + 21} fill="transparent" />
              <title>{`Cluster ${c.letter} — ${c.items.map((i) => splitModelName(i.model).base).join(", ")}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const AAClusterZoom = ({ cluster, topScore, hoverModel, onHoverModel }) => {
  const W = 800, marginX = 54, usableW = W - marginX * 2;
  const spread = cluster.max - cluster.min;
  const pad = Math.max(0.4, spread * 0.35);
  const domainMin = cluster.min - pad, domainMax = cluster.max + pad;
  const xScale = (s) => marginX + ((s - domainMin) / (domainMax - domainMin)) * usableW;

  const nodes = cluster.items.map((it) => ({ ...it, x: xScale(it.score), halfWidth: 10 }));
  const laid = packLanes(nodes);
  const maxLane = Math.max(0, ...laid.map((d) => d.lane));
  const baseline = 22 + maxLane * 18;
  const svgH = baseline + 20;
  /* Exact ties put both end ticks at one x — print the score once. */
  const endTicks = spread > 0.001 ? [cluster.min, cluster.max] : [cluster.min];

  return (
    <div style={{ height: Math.min(svgH * (860 / W) + 4, 150) }}>
      <svg viewBox={`0 0 ${W} ${svgH}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <line x1={marginX} y1={baseline} x2={W - marginX} y2={baseline} stroke={RULE_SOFT} strokeWidth={1} />
        {endTicks.map((t) => (
          <g key={t}>
            <line x1={xScale(t)} y1={baseline} x2={xScale(t)} y2={baseline + 6} stroke={FAINT} />
            <text x={xScale(t)} y={baseline + 18} textAnchor="middle" style={{ ...mono, fontSize: 9.5, fill: FAINT }}>{t.toFixed(1)}</text>
          </g>
        ))}
        {laid.map((d) => {
          const cy = baseline - 11 - d.lane * 18;
          const isLeader = d.score === topScore;
          const on = hoverModel === d.model;
          const dim = hoverModel && !on;
          const r = isLeader ? 7 : 5.5;
          return (
            <g key={d.model} opacity={dim ? 0.4 : 1} onMouseEnter={() => onHoverModel(d.model)} onMouseLeave={() => onHoverModel(null)}>
              <line x1={d.x} y1={cy + r} x2={d.x} y2={baseline} stroke={RULE_SOFT} strokeWidth={1} />
              <circle cx={d.x} cy={cy} r={on ? r + 2 : r} fill={dotFill(d)} stroke={INK} strokeWidth={on || isLeader ? 2 : 1} />
              <circle cx={d.x} cy={cy} r={14} fill="transparent" />
              <title>{d.model}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const AAClusterList = ({ cluster, topScore, hoverModel, onHoverModel }) => (
  <div>
    {[...cluster.items].sort((a, b) => b.score - a.score).map((it) => {
      const isLeader = it.score === topScore;
      const on = hoverModel === it.model;
      const { base, sub } = splitModelName(it.model);
      return (
        <div
          key={it.model}
          onMouseEnter={() => onHoverModel(it.model)}
          onMouseLeave={() => onHoverModel(null)}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "5px 6px", margin: "0 -6px",
            borderBottom: `1px solid ${RULE_SOFT}`, background: on ? C.paperDeep : "transparent",
            boxShadow: on ? `inset 2px 0 0 ${INK}` : "none", transition: "background 120ms ease, box-shadow 120ms ease",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: dotFill(it), border: `1px solid ${INK}`, flexShrink: 0, transform: on ? "scale(1.35)" : "none", transition: "transform 120ms ease" }} />
          <span style={{ ...serif, fontSize: 13.5, flex: 1 }}>
            {base}
            {sub && <span style={{ ...mono, fontSize: 9.5, color: FAINT, marginLeft: 7, letterSpacing: "0.04em" }}>{sub}</span>}
            {isLeader && <span style={{ ...mono, fontSize: 9, color: FAINT, marginLeft: 8, letterSpacing: "0.08em" }}>★ LEADER</span>}
          </span>
          <span style={{ ...mono, fontSize: 12, color: INK }}>{it.score.toFixed(1)}</span>
        </div>
      );
    })}
  </div>
);

const AASwarm = ({ items }) => {
  /* Hover state lives here because both links cross component boundaries:
     a cluster mark on the line ↔ its section below, a zoomed dot ↔ its row. */
  const [hoverCluster, setHoverCluster] = useState(null);
  const [hoverModel, setHoverModel] = useState(null);
  if (!items.length) return null;
  const scores = items.map((m) => m.score);
  const topScore = Math.max(...scores);
  const spread = Math.round((topScore - Math.min(...scores)) * 10) / 10;
  const clusters = groupByPoint(items);
  const multi = clusters.filter((c) => c.items.length > 1);

  return (
    <div>
      <AAOverview
        clusters={clusters} allItems={items} topScore={topScore}
        hoverCluster={hoverCluster} onHoverCluster={setHoverCluster}
        hoverModel={hoverModel} onHoverModel={setHoverModel}
      />
      <div style={{ ...mono, fontSize: 10, color: FAINT, marginTop: 4 }}>
        {multi.length
          ? `Lettered marks = models sharing one point, unpacked below · hover a model for its variant, a cluster to link it · full field spans ${spread} points`
          : `Hover a model for its variant · full field spans ${spread} points`}
      </div>
      {multi.map((c) => {
        const on = hoverCluster === c.letter;
        return (
          <div
            key={c.letter}
            onMouseEnter={() => setHoverCluster(c.letter)}
            onMouseLeave={() => setHoverCluster(null)}
            style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${RULE_SOFT}` }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
              <span style={{ ...mono, fontSize: 10.5, fontWeight: 600, color: on ? PAPER : INK, background: on ? INK : "transparent", border: `1px solid ${INK}`, borderRadius: "50%", width: 18, height: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 120ms ease, color 120ms ease" }}>{c.letter}</span>
              <span style={{ ...mono, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: on ? INK : FAINT, transition: "color 120ms ease" }}>
                Cluster {c.letter} · {c.items.length} models · {rangeLabel(c)}
              </span>
            </div>
            <AAClusterZoom cluster={c} topScore={topScore} hoverModel={hoverModel} onHoverModel={setHoverModel} />
            <AAClusterList cluster={c} topScore={topScore} hoverModel={hoverModel} onHoverModel={setHoverModel} />
          </div>
        );
      })}
    </div>
  );
};

/* ——— Trend log: scale-aware series ———
   Artificial Analysis re-anchors its index periodically (v4.1.1 → v4.2 in
   Sep '26 dropped every score ~6 points without any model regressing). A
   single line across that boundary would draw a cliff that never happened,
   so topScore is split into one series per scale: each segment carries its
   own dataKey and is null outside its own rows, which makes the line break
   at the seam instead of interpolating across it. */
const SCALE_TONES = [C.clay, C.slate, C.neutral];

const splitByScale = (history, key) => {
  const scales = [];
  history.forEach((r) => {
    if (r[key] == null) return;
    const v = r.scale || "earlier scale";
    if (!scales.includes(v)) scales.push(v);
  });
  if (scales.length < 2) return { rows: history, series: [[key, "AA Index", C.clay]] };

  const rows = history.map((r) => {
    const out = { ...r };
    scales.forEach((v, i) => {
      const mine = (r.scale || "earlier scale") === v;
      out[`${key}__${i}`] = mine ? r[key] : null;
    });
    return out;
  });
  /* Newest scale keeps the live tone; older ones fade back. */
  const series = scales.map((v, i) => [
    `${key}__${i}`,
    v,
    SCALE_TONES[Math.min(scales.length - 1 - i, SCALE_TONES.length - 1)],
  ]);
  return { rows, series, scales };
};

const Commentary = ({ children }) => (
  <p style={{ ...serif, fontSize: 15, lineHeight: 1.65, margin: "14px 0 0 0", paddingTop: 12, borderTop: `1px solid ${RULE_SOFT}` }}>
    <span style={{ ...mono, fontSize: 10, letterSpacing: "0.18em", color: FAINT, marginRight: 8 }}>ANALYST NOTE</span>
    {children}
  </p>
);

const SourceRow = ({ items }) => (
  <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
    {items.map(([label, url]) => (
      <a key={url} href={url} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 10.5, color: FAINT, textDecoration: "underline", textUnderlineOffset: 3 }}>↗ {label}</a>
    ))}
  </div>
);

const PaperTooltip = ({ active, payload, label, unit = "" }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: PAPER, border: `1px solid ${INK}`, padding: "8px 12px", boxShadow: "2px 2px 0 rgba(25,23,20,0.12)" }}>
      <div style={{ ...mono, fontSize: 11, marginBottom: 2 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ ...mono, fontSize: 12 }}>{p.name !== label ? `${p.name}: ` : ""}{Number(p.value).toLocaleString()}{unit}</div>
      ))}
    </div>
  );
};

const tick = { ...mono, fontSize: 11, fill: INK };
const tickFaint = { ...mono, fontSize: 10.5, fill: FAINT };

/* ——— The masthead line ———
   Reads off the panels rather than off `updatedAt`, because `updatedAt` also
   moves when a human edits the file by hand — which would report a nightly
   job as healthy on a day it never ran. The newest successful panel check is
   the honest answer to "when did this last refresh". */
const runStamp = (lastRunAt, updatedAt, meta) => {
  const panels = Object.values(meta || {}).map(panelTimes).filter(Boolean);
  if (!panels.length) return { text: `Refreshed nightly · last successful check ${ago(updatedAt)}`, tone: "faint" };

  const checks = panels.map((p) => p.checkedAt).filter(Boolean);
  const newest = checks.length ? checks.reduce((a, b) => (a > b ? a : b)) : null;
  const behind = panels.filter((p) => p.failed || isStale(p.checkedAt)).length;

  /* The job fired and every panel came back empty. Worth its own sentence:
     the fix is upstream — an API key, a rate limit — not in the data. */
  if (lastRunAt && !isStale(lastRunAt) && behind === panels.length) {
    return { text: `Nightly refresh ran ${ago(lastRunAt)} · every panel failed`, tone: "bad" };
  }

  if (isStale(newest)) {
    return {
      text: newest ? `Nightly refresh has not run in ${span(newest)}` : "Nightly refresh has not run yet",
      tone: "warn",
    };
  }

  const lead = `Refreshed nightly · last successful check ${ago(newest)}`;
  return behind
    ? { text: `${lead} · ${behind} of ${panels.length} panels behind`, tone: "warn" }
    : { text: lead, tone: "faint" };
};

const STAMP_COLOR = { faint: FAINT, warn: TEXT_CLAY, bad: TEXT_BRICK };

/* ——— Panel: card with read-only timestamp ——— */
const Panel = ({ id, label, meta, children, sources }) => {
  const stamp = refreshStamp(meta);
  return (
    <div style={{ border: `1px solid ${INK}`, borderRadius: 2, background: PAPER, padding: 22, marginBottom: 18, boxShadow: "3px 3px 0 rgba(25,23,20,0.08)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <Eyebrow>{label}</Eyebrow>
        {meta !== null && (
          <span title={stamp.title} style={{ ...mono, fontSize: 10, color: STAMP_COLOR[stamp.tone] }}>
            {stamp.text}
          </span>
        )}
      </div>
      {children}
      {sources && <SourceRow items={sources} />}
    </div>
  );
};

/* ————————————————— main ————————————————— */
export default function App() {
  const { data, meta, history, updatedAt, lastRunAt, status: loadStatus } = useBriefingData();
  const [showCN, setShowCN] = useState(true);
  const [tocOpen, setTocOpen] = useState(true);

  /* China filtering */
  const f = (arr) => (showCN ? arr : arr.filter((x) => !x.cn));
  const valuations = useMemo(() => f(data.valuations), [data.valuations, showCN]);
  const aaIndex = useMemo(() => f(data.aaIndex), [data.aaIndex, showCN]);
  const cnCount = data.valuations.filter((x) => x.cn).length + data.aaIndex.filter((x) => x.cn).length;

  const tocItems = useMemo(() => {
    const items = [
      { n: "01", id: "sec-01", title: "Private-market valuations" },
      { n: "02", id: "sec-02", title: "Public markets" },
      { n: "03", id: "sec-03", title: "Model capability" },
      { n: "04", id: "sec-04", title: "Who's actually using this" },
      { n: "05", id: "sec-05", title: "The capital behind it" },
      { n: "06", id: "sec-06", title: "Energy & data centers" },
    ];
    if (showCN) items.push({ n: "07", id: "sec-07", title: "The China position" });
    items.push({ n: showCN ? "08" : "07", id: "sec-08", title: "Trend log" });
    return items;
  }, [showCN]);

  const hasTrend = history.length > 1;
  const runLine = runStamp(lastRunAt, updatedAt, meta);

  return (
    <div style={{ background: PAPER, minHeight: "100vh", color: INK }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;500&display=swap');
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }
        a:focus-visible, button:focus-visible { outline: 2px solid ${INK}; outline-offset: 2px; }
        button:hover:not(:disabled) { background: ${C.paperDeep}; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } html { scroll-behavior: auto; } }
      `}</style>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Masthead */}
        <header id="top" style={{ borderTop: `3px solid ${INK}`, borderBottom: `1px solid ${INK}`, padding: "18px 0 16px", scrollMarginTop: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Eyebrow>A living briefing · aggregated industry metrics</Eyebrow>
            <Eyebrow>Edition {EDITION.version} · {EDITION.date}</Eyebrow>
          </div>
          <h1 style={{ ...serif, fontSize: "clamp(38px, 7vw, 58px)", fontWeight: 600, margin: "10px 0 6px", letterSpacing: "-0.02em", lineHeight: 1.02 }}>The State of AI</h1>
          <p style={{ ...serif, fontStyle: "italic", fontSize: 16.5, color: FAINT, margin: 0, maxWidth: 640 }}>
            Valuations, public markets, model capability, user bases, energy, and the capital behind it all —
            compiled like a report, updated panel by panel.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ ...mono, fontSize: 11, display: "flex", alignItems: "center", gap: 7, cursor: "pointer", border: `1px solid ${showCN ? INK : RULE_SOFT}`, padding: "8px 12px", borderRadius: 2 }}>
              <input type="checkbox" checked={showCN} onChange={(e) => setShowCN(e.target.checked)} style={{ accentColor: INK }} />
              Chinese labs {showCN ? "shown" : "hidden"} ({cnCount})
            </label>
          </div>
          <div style={{ ...mono, fontSize: 10, color: loadStatus === "ok" ? STAMP_COLOR[runLine.tone] : FAINT, marginTop: 10 }}>
            {loadStatus === "loading" && "Loading…"}
            {loadStatus === "ok" && runLine.text}
            {loadStatus === "baseline" && "Showing compiled-in baseline — published data unavailable"}
          </div>
        </header>

        <TOC items={tocItems} open={tocOpen} onToggle={() => setTocOpen((o) => !o)} />

        <p style={{ ...mono, fontSize: 10.5, color: FAINT, lineHeight: 1.7, marginTop: 14 }}>
          Methodological caveat: figures mix disclosure types — private valuations are last-round marks, user counts mix
          weekly/monthly/embedded bases, energy figures are analyst forecasts. Treat magnitudes and trends as the signal.
        </p>

        {/* §01 Valuations */}
        <SectionHead id="sec-01" n="01" title="Private-market valuations" sub="The most valuable startups ever built, priced in billions of dollars" />
        <Panel id="valuations" label="Latest disclosed round · $ billions" meta={meta.valuations} sources={SRC.valuations}>
          <div style={{ height: 32 + valuations.length * 34 }}>
            <ResponsiveContainer>
              <BarChart data={valuations} layout="vertical" margin={{ left: 8, right: 64, top: 8 }}>
                <CartesianGrid horizontal={false} stroke={RULE_SOFT} />
                <XAxis type="number" tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={104} tick={tick} axisLine={{ stroke: INK }} tickLine={false} />
                <Tooltip content={<PaperTooltip unit="B" />} cursor={{ fill: "rgba(25,23,20,0.04)" }} />
                <Bar dataKey="value" stroke={INK} strokeWidth={1} barSize={20} isAnimationActive={false}>
                  {valuations.map((v) => <Cell key={v.name} fill={brandFill(v.name, v.cn ? C.clay : C.blue)} />)}
                  <LabelList dataKey="value" position="right" style={{ ...mono, fontSize: 11, fill: INK }} formatter={(v) => `$${v}B`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...mono, fontSize: 10, color: FAINT, marginTop: 6 }}>
            ■ colored bars use each company's brand color from the web-traffic chart (§04), plus Meta (teal), added when Muse Spark reached the frontier{showCN ? " · tan = China-based labs without a tracked brand color" : ""}
          </div>
          <Commentary>
            Anthropic's $65B Series H still makes it the most valuable private AI lab at $965B, ahead of OpenAI's $852B;
            Databricks jumped from $134B to $190B on a fresh $5B round in August, and Anduril is reportedly negotiating
            a leap to $100B from its confirmed $61B mark. xAI's $250B figure is now stale in a different way — it
            merged into SpaceX in February, which itself went public in June and now trades around a $1.87T market cap,
            so a standalone xAI number no longer really exists.
            {showCN && " The Chinese tier moved unevenly: DeepSeek rose to ~$74B on a resumed raise, while Zhipu and MiniMax's HK-listed market caps have actually fallen well below their prior private marks — a reminder that public listings can reprice these companies down as easily as up."}
            {" "}Both Anthropic and OpenAI have filed confidential S-1s; these are last-round marks, not offering prices.
          </Commentary>
        </Panel>
        <Panel id="race" label="The race to a trillion · valuation by round, $ billions" meta={meta.valuations}>
          <div style={{ height: 270 }}>
            <ResponsiveContainer>
              <LineChart data={data.race} margin={{ left: 4, right: 24, top: 12 }}>
                <CartesianGrid stroke={RULE_SOFT} vertical={false} />
                <XAxis dataKey="t" tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <YAxis tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <Tooltip content={<PaperTooltip unit="B" />} />
                <Legend wrapperStyle={{ ...mono, fontSize: 11 }} />
                <Line type="monotone" dataKey="OpenAI" stroke={brandFill("OpenAI", C.brick)} strokeWidth={2} connectNulls dot={{ r: 4, fill: PAPER, stroke: INK, strokeWidth: 1 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="Anthropic" stroke={brandFill("Anthropic", C.blue)} strokeWidth={2} connectNulls dot={{ r: 4, fill: PAPER, stroke: INK, strokeWidth: 1 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Commentary>
            Historical record — the final point tracks whatever the valuations panel last pulled. Anthropic repriced
            from $380B to $965B in about three months, chasing a run-rate that has now gone from ~$1B to $65B in
            under two years. Because that revenue base is larger, its implied multiple (~15×) is <em>lower</em> than
            OpenAI's (~21×) — the gap between the two labs' multiples widened this refresh as Anthropic's revenue
            growth outran its valuation growth.
          </Commentary>
        </Panel>
        <BackToTop />

        {/* §02 Public markets */}
        <SectionHead id="sec-02" n="02" title="Public markets" sub="How Wall Street is pricing the picks, shovels, and platforms" />
        <Panel id="markets" label="Key AI equities" meta={meta.markets} sources={SRC.markets}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
            <thead><tr>{["Ticker", "Company", "Price", "Mkt cap", "Note"].map((h) => (
              <th key={h} style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: FAINT, textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${INK}` }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {data.stocks.map((s, i) => (
                <tr key={s.ticker} style={{ background: i % 2 ? "transparent" : "rgba(25,23,20,0.025)" }}>
                  <td style={{ ...mono, fontSize: 12.5, fontWeight: 500, padding: "9px 8px", borderBottom: `1px solid ${RULE_SOFT}` }}>{s.ticker}</td>
                  <td style={{ ...serif, fontSize: 14.5, padding: "9px 8px", borderBottom: `1px solid ${RULE_SOFT}` }}>{s.name}</td>
                  <td style={{ ...mono, fontSize: 12.5, padding: "9px 8px", borderBottom: `1px solid ${RULE_SOFT}` }}>${s.price.toLocaleString()}</td>
                  <td style={{ ...mono, fontSize: 12, color: FAINT, padding: "9px 8px", borderBottom: `1px solid ${RULE_SOFT}` }}>{s.cap}</td>
                  <td style={{ ...serif, fontSize: 13.5, fontStyle: "italic", color: FAINT, padding: "9px 8px", borderBottom: `1px solid ${RULE_SOFT}` }}>{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Commentary>
            Combined 2026 capex guidance across the big four hyperscalers now sits at roughly $720–745B, up 77% year
            over year, with the mix shifting: Amazon and Alphabet raised their budgets while Microsoft trimmed its
            guidance after extending the useful life of its data-center assets from 15 to 25 years — an accounting
            change, not a spending pullback. Nvidia reports Q2 FY27 after the close today; consensus sits near $92B
            in revenue, and options markets are pricing an 8–12% swing on the print.
          </Commentary>
        </Panel>
        <BackToTop />

        {/* §03 Models */}
        <SectionHead id="sec-03" n="03" title="Model capability" sub="Where the frontier sits, per the four most-watched scoreboards" />
        <Panel id="models" label="Artificial Analysis Intelligence Index v4.2" meta={meta.models} sources={SRC.models}>
          <AASwarm items={aaIndex} />
          <div style={{ ...mono, fontSize: 10, color: TEXT_BRICK, marginTop: 6 }}>
            ▲ scale change — v4.2 re-anchored the index, so these scores are not comparable to the v4.1.1 numbers in editions ≤ v2.3
          </div>
          <Commentary>
            Three frontier releases landed in three days and the whole board moved. Anthropic shipped Claude Fable 5.1
            on Sep 1 (and Mythos 5.1, the same weights under trusted-access safeguards, so it takes no separate slot
            here); Google shipped Gemini 3.8 Flash on Sep 2; OpenAI shipped GPT-6 Astra and Meta shipped Muse Spark
            1.3 on Sep 3. Artificial Analysis re-cut its index to v4.2 in the middle of it — two new evals, the
            saturated GPQA Diamond retired, and 40% of the weight now private held-out data specifically to make the
            leaderboard harder to train against. Every score above is on that new, lower scale; last edition's 63.0
            for Opus 5 reads as 54.0 here, and nothing regressed. The substance is that Fable 5.1 leads at 57.0,
            GPT-6 Astra enters second at 55.0 — OpenAI's president called it a "generational leap" and the first
            model OpenAI has rated critical for cyber under its preparedness framework — and Meta, absent from this
            chart all year, arrives fourth-equal with Muse Spark 1.3, its fourth Muse Spark release in five months.
            Grok 4.7 is not here because it does not exist yet: Musk announced it for mid-September, but xAI has
            published no model card, price, or API id, so 4.6 still stands in for xAI.
            {showCN ? " Chinese representation in the top eight has narrowed to Kimi K3 alone — GLM-5.3 and Qwen sit in the upper half of v4.2 without published scores yet, so their absence here is a reporting gap, not a fall." : " Hide/show has removed the Chinese entries; on the current board that is one model, Kimi K3."}
          </Commentary>
        </Panel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 18 }}>
          {TRACKERS.map((t) => (
            <div key={t.name} style={{ border: `1px solid ${INK}`, borderRadius: 2, padding: 16 }}>
              <Eyebrow style={{ letterSpacing: "0.14em" }}>{t.name}</Eyebrow>
              <div style={{ ...serif, fontSize: 18, fontWeight: 500, margin: "6px 0 4px" }}>{t.leader}</div>
              <div style={{ ...serif, fontSize: 13.5, fontStyle: "italic", color: FAINT, lineHeight: 1.5 }}>{t.detail}</div>
              <a href={t.url} target="_blank" rel="noreferrer" style={{ ...mono, fontSize: 10.5, color: FAINT, textDecoration: "underline", textUnderlineOffset: 3 }}>↗ leaderboard</a>
            </div>
          ))}
        </div>
        <BackToTop />

        {/* §04 Users */}
        <SectionHead id="sec-04" n="04" title="Who's actually using this" sub="Assistant user bases and the redistribution of attention" />
        <Panel id="users" label="Reported users · millions (mixed bases)" meta={meta.users} sources={SRC.users}>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={data.users} layout="vertical" margin={{ left: 8, right: 64, top: 8 }}>
                <CartesianGrid horizontal={false} stroke={RULE_SOFT} />
                <XAxis type="number" tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={78} tick={tick} axisLine={{ stroke: INK }} tickLine={false} />
                <Tooltip content={<PaperTooltip unit="M" />} cursor={{ fill: "rgba(25,23,20,0.04)" }} />
                <Bar dataKey="users" stroke={INK} strokeWidth={1} barSize={20} isAnimationActive={false}>
                  {data.users.map((u) => <Cell key={u.name} fill={brandFill(u.name, C.neutral)} />)}
                  <LabelList dataKey="users" position="right" style={{ ...mono, fontSize: 11, fill: INK }} formatter={(v) => `${v}M`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ ...mono, fontSize: 10, color: FAINT, marginTop: 6 }}>■ bars use each product's brand color · Meta AI now carries Meta's teal, added to the palette in §03 when Muse Spark reached the frontier</div>
          <Commentary>
            Read the bases before the bars: Meta AI's 1.2B counts anyone who touched it inside WhatsApp or Instagram,
            while ChatGPT's reflects deliberate use. Gemini crossed 1 billion monthly actives in mid-August — Google's
            fastest-growing product ever — closing most of the gap with ChatGPT. Beneath the ranking, ChatGPT's
            app-market share remains below 50%, with Claude posting the fastest relative growth from a small base.
            {showCN && " ByteDance's Doubao is China's most-used assistant but publishes no comparable MAU figure, so it can't honestly be placed on this chart."}
          </Commentary>
        </Panel>
        <Panel id="share" label="Global chatbot web-traffic share · Similarweb" meta={meta.share} sources={SRC.users}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <div style={{ height: 240, flex: "1 1 260px", minWidth: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={data.webShare} dataKey="value" nameKey="name" innerRadius={56} outerRadius={98} stroke={INK} strokeWidth={1} isAnimationActive={false}>
                    {data.webShare.map((s) => <Cell key={s.name} fill={s.color} />)}
                  </Pie>
                  <Tooltip content={<PaperTooltip unit="%" />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: "1 1 220px" }}>
              {data.webShare.map((s) => (
                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
                  <span style={{ width: 12, height: 12, background: s.color, border: `1px solid ${INK}`, display: "inline-block" }} />
                  <span style={{ ...serif, fontSize: 14.5, flex: 1 }}>{s.name}</span>
                  <span style={{ ...mono, fontSize: 12 }}>{s.value}%</span>
                </div>
              ))}
            </div>
          </div>
          <Commentary>
            A year ago this was one big circle: ChatGPT held ~79%. The redistribution since — while total category
            visits still grew ~49% — is the clearest evidence the single-vendor era is over. This refresh shows
            Gemini's first share decline in over a year (down ~1 point), while ChatGPT and Claude both ticked up.
          </Commentary>
        </Panel>
        <BackToTop />

        {/* §05 Capital */}
        <SectionHead id="sec-05" n="05" title="The capital behind it" sub="What the industry is spending and earning" />
        <Panel id="capital" label="2026 capex plans & lab run-rates · $ billions" meta={meta.capital} sources={SRC.capital}>
          <div style={{ height: 210 }}>
            <ResponsiveContainer>
              <BarChart data={data.capex} margin={{ left: 0, right: 12, top: 22 }}>
                <CartesianGrid stroke={RULE_SOFT} vertical={false} />
                <XAxis dataKey="name" tick={tick} axisLine={{ stroke: INK }} tickLine={false} />
                <YAxis tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <Tooltip content={<PaperTooltip unit="B" />} cursor={{ fill: "rgba(25,23,20,0.04)" }} />
                <Bar dataKey="value" stroke={INK} strokeWidth={1} barSize={44} isAnimationActive={false}>
                  {data.capex.map((c) => <Cell key={c.name} fill={brandFill(c.name, C.ochre)} />)}
                  <LabelList dataKey="range" position="top" style={{ ...mono, fontSize: 10.5, fill: INK }} formatter={(v) => `$${v}B`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ height: 170, marginTop: 18, borderTop: `1px solid ${RULE_SOFT}`, paddingTop: 12 }}>
            <Eyebrow>Annualized revenue run-rates · frontier labs</Eyebrow>
            <ResponsiveContainer>
              <BarChart data={data.revenue} layout="vertical" margin={{ left: 8, right: 64, top: 8 }}>
                <CartesianGrid horizontal={false} stroke={RULE_SOFT} />
                <XAxis type="number" tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <YAxis type="category" dataKey="name" width={86} tick={tick} axisLine={{ stroke: INK }} tickLine={false} />
                <Tooltip content={<PaperTooltip unit="B" />} cursor={{ fill: "rgba(25,23,20,0.04)" }} />
                <Bar dataKey="value" stroke={INK} strokeWidth={1} barSize={20} isAnimationActive={false}>
                  {data.revenue.map((r) => <Cell key={r.name} fill={brandFill(r.name, C.brick)} />)}
                  <LabelList dataKey="value" position="right" style={{ ...mono, fontSize: 11, fill: INK }} formatter={(v) => `$${v}B`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Commentary>
            Four companies plan roughly three-quarters of a trillion dollars of capex in 2026, most of it AI data
            centers. Against that, Anthropic's run-rate jumped again — from $47B to $65B in about three months,
            widening its lead over OpenAI's reconfirmed $40B — with the same live caveat as last edition: the SEC
            may force cloud-credit revenue onto a net basis pre-IPO, which would shrink the headline.
          </Commentary>
        </Panel>
        <BackToTop />

        {/* §06 Energy */}
        <SectionHead id="sec-06" n="06" title="Energy & data centers" sub="The physical constraint that now sets the pace" />
        <Panel id="energy" label="Global data center electricity by workload · TWh" meta={meta.energy} sources={SRC.energy}>
          <div style={{ height: 250 }}>
            <ResponsiveContainer>
              <BarChart data={data.energy} margin={{ left: 0, right: 12, top: 16 }}>
                <CartesianGrid stroke={RULE_SOFT} vertical={false} />
                <XAxis dataKey="year" tick={tick} axisLine={{ stroke: INK }} tickLine={false} />
                <YAxis tick={tickFaint} axisLine={{ stroke: INK }} tickLine={false} />
                <Tooltip content={<PaperTooltip unit=" TWh" />} cursor={{ fill: "rgba(25,23,20,0.04)" }} />
                <Legend wrapperStyle={{ ...mono, fontSize: 11 }} />
                <Bar dataKey="ai" name="AI-optimized servers" fill={C.brick} stroke={INK} strokeWidth={1} barSize={34} isAnimationActive={false} />
                <Bar dataKey="conventional" name="Conventional servers" fill={C.slate} stroke={INK} strokeWidth={1} barSize={34} isAnimationActive={false} />
                <Bar dataKey="cooling" name="Cooling & infrastructure" fill={C.sage} stroke={INK} strokeWidth={1} barSize={34} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 16 }}>
            {[
              [`${data.energyStats.totalTWh} TWh`, "total data center draw, 2026 — up 26% in a year"],
              [`${data.energyStats.peakGW} GW`, "peak power demand — a large country's entire capacity"],
              [`${data.energyStats.usShare}%`, "of global consumption sits in the United States"],
              [`${data.energyStats.aiShareOfDC}%`, "of data center power is AI-optimized servers"],
            ].map(([big, small]) => (
              <div key={small} style={{ border: `1px solid ${INK}`, borderRadius: 2, padding: "14px 12px", background: C.paperDeep }}>
                <div style={{ ...serif, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>{big}</div>
                <div style={{ ...serif, fontSize: 12.5, fontStyle: "italic", color: "#5C564B", lineHeight: 1.45, marginTop: 3 }}>{small}</div>
              </div>
            ))}
          </div>
          <Commentary>
            The shape here is the whole argument: conventional server draw is flat (~1% growth), while AI-optimized
            servers jump 84% in one year and overtake conventional hardware entirely in 2027. This refresh's one
            real move is the US share of global data-center power, now measured at ~40% by a newly published Energy
            Institute dataset (up from the 36% Gartner-derived figure last edition) — a different source and
            methodology, so read it as a data-quality footnote as much as a trend. Power availability — not chips —
            remains the binding constraint on AI expansion, which is why Meta's Hyperion campus is specced at 5 GW
            and Stargate is measured in gigawatts rather than dollars.
          </Commentary>
        </Panel>
        <BackToTop />

        {/* §07 China */}
        {showCN && (
          <>
            <SectionHead id="sec-07" n="07" title="The China position" sub="Cheaper, closer, and increasingly the default in developer tooling" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 18 }}>
              {[
                [`${data.china.tokenShare}%`, "of OpenRouter token traffic now runs on Chinese models — up from under 2% a year ago, and now above 45% within a few months"],
                [`${data.china.gap} pts`, "separate the top US and top Chinese model, per Stanford's AI Index"],
                [data.china.investRatio, "less private AI investment than the US in 2025 ($12.4B vs $285.9B)"],
                [data.china.costRatio, "cheaper output tokens: DeepSeek-V4-Pro ≈$0.87/M vs Claude Fable ≈$50/M"],
              ].map(([big, small]) => (
                <div key={small} style={{ border: `1px solid ${INK}`, borderRadius: 2, padding: "16px 14px", background: PAPER, boxShadow: "3px 3px 0 rgba(25,23,20,0.08)" }}>
                  <div style={{ ...serif, fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: TEXT_CLAY }}>{big}</div>
                  <div style={{ ...serif, fontSize: 13, fontStyle: "italic", color: "#5C564B", lineHeight: 1.5, marginTop: 4 }}>{small}</div>
                </div>
              ))}
            </div>
            <Panel id="chinaNote" label="Reading the Chinese labs" meta={null}>
              <p style={{ ...serif, fontSize: 15, lineHeight: 1.65, margin: 0 }}>
                Four labs matter most: DeepSeek (Hangzhou, efficiency and price leadership, MIT-licensed weights, now
                mid-way through a resumed $8B raise), Z.ai/Zhipu (state-linked, Palantir-style on-prem deployments,
                the only one with ~40% gross margins), Moonshot/Kimi (agentic coding, 2.8T-parameter K3, confirmed at
                $35B), and MiniMax (long-context and multimodal). Zhipu and MiniMax already trade in Hong Kong — and
                this refresh is the clearest evidence yet of how volatile that makes their valuations, with both now
                trading well under their prior private marks. The bigger story this edition is OpenRouter traffic:
                Chinese models now account for roughly 60% of tokens routed there, up from 45% just weeks ago and
                under 2% a year ago, as the top five slots all went Chinese. Two structural caveats still apply:
                HK-listed valuations can swing by double digits in single sessions, and Western procurement treats
                China-based hosting as a compliance question regardless of benchmark score — which is why usage and
                capability keep diverging.
              </p>
              <SourceRow items={SRC.china} />
            </Panel>
            <BackToTop />
          </>
        )}

        {/* §08 Trend log */}
        <SectionHead id="sec-08" n={showCN ? "08" : "07"} title="Trend log" sub="Accumulated from nightly refreshes — one point per day" />
        <Panel id="trend" label={`${history.length} snapshot${history.length === 1 ? "" : "s"} on file`} meta={null}>
          {!hasTrend ? (
            <div style={{ padding: "26px 4px" }}>
              <p style={{ ...serif, fontSize: 15.5, lineHeight: 1.6, margin: 0 }}>
                Only the baseline snapshot is on file. As the nightly job runs, this section will draw lines —
                each refresh writes one dated point per metric, so the log builds its own history over time.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 18 }}>
              {[
                { title: "Valuations · $B", keys: [["anthropic", "Anthropic", brandFill("Anthropic", C.blue)], ["openai", "OpenAI", brandFill("OpenAI", C.brick)]] },
                { title: "Share price · $", keys: [["nvda", "NVDA", C.slate], ["msft", "MSFT", brandFill("MSFT", C.plum)]] },
                { title: "Users · M", keys: [["chatgpt", "ChatGPT", brandFill("ChatGPT", C.sage)], ["gemini", "Gemini", brandFill("Gemini", C.blue)], ["claude", "Claude", brandFill("Claude", C.ochre)]] },
                { title: "Top index score", keys: null, split: "topScore" },
              ].map((chart) => {
                const sp = chart.split ? splitByScale(history, chart.split) : null;
                const rows = sp ? sp.rows : history;
                const keys = sp ? sp.series : chart.keys;
                const broken = sp && sp.scales;
                return (
                <div key={chart.title}>
                  <Eyebrow>{chart.title}</Eyebrow>
                  <div style={{ height: 150, marginTop: 6 }}>
                    <ResponsiveContainer>
                      <LineChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
                        <CartesianGrid stroke={RULE_SOFT} vertical={false} />
                        <XAxis dataKey="date" tick={{ ...mono, fontSize: 9, fill: FAINT }} axisLine={{ stroke: INK }} tickLine={false} />
                        <YAxis tick={{ ...mono, fontSize: 9, fill: FAINT }} axisLine={{ stroke: INK }} tickLine={false} domain={["auto", "auto"]} width={38} />
                        <Tooltip content={<PaperTooltip />} />
                        {keys.map(([k, name, color]) => (
                          <Line key={k} type="monotone" dataKey={k} name={name} stroke={color} strokeWidth={1.75}
                            connectNulls={!chart.split}
                            dot={{ r: 3, fill: PAPER, stroke: INK, strokeWidth: 1 }} isAnimationActive={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {broken && (
                    <div style={{ ...mono, fontSize: 9.5, color: FAINT, marginTop: 4, lineHeight: 1.5 }}>
                      ▲ line breaks where Artificial Analysis re-anchored the index ({broken.join(" → ")}) — the drop is a
                      change of scale, not of capability
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
          <Commentary>
            This is the one section no single source can provide: a longitudinal record updated nightly by the refresh job.
            The log lives in the repository as <span style={{ ...mono, fontSize: 13 }}>public/data/trend.csv</span> —
            each run commits a dated point per metric, and the commit history preserves the full record.
          </Commentary>
        </Panel>
        <BackToTop />

        {/* Colophon */}
        <footer style={{ marginTop: 56, borderTop: `1px solid ${INK}`, paddingTop: 14 }}>
          <Eyebrow>Colophon & edition history</Eyebrow>
          <div style={{ marginTop: 10 }}>
            {EDITION.changelog.map(([v, dt, note]) => (
              <div key={v} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: `1px solid ${RULE_SOFT}` }}>
                <span style={{ ...mono, fontSize: 11, minWidth: 96, color: INK }}>{v} · {dt}</span>
                <span style={{ ...serif, fontSize: 13.5, color: FAINT, lineHeight: 1.5 }}>{note}</span>
              </div>
            ))}
          </div>
          <p style={{ ...serif, fontSize: 13.5, fontStyle: "italic", color: FAINT, lineHeight: 1.65, marginTop: 12 }}>
            The edition number tracks content and layout — it changes when a metric is added or retired, not when the
            numbers move. Each panel carries its own refresh time instead. Live values and the trend log are stored in
            the repository and refreshed nightly, not in this browser, so the record is the same wherever the dashboard
            is opened. Nothing here is investment advice.
          </p>
        </footer>
      </div>
    </div>
  );
}
