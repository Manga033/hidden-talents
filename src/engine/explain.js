// Turns engine numbers into sentences a jury, coach or scout can check. Every sentence quotes its numbers.
import { GROUP_PLURAL, LABELS, MEANING, METRICS, SHORT, TAU2 } from './constants.js';
import { breakdown, gaFacts, rawBreakdown } from './engine.js';

export const fmt1 = (x) => (x == null || Number.isNaN(x) ? '–' : (Math.round(x * 10) / 10).toFixed(1));
export const fmt2 = (x) => (x == null || Number.isNaN(x) ? '–' : (Math.round(x * 100) / 100).toFixed(2));
export const signed = (x, d = 1) => {
  if (x == null || Number.isNaN(x)) return '–';
  const v = Number(x.toFixed(d));
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(d)}`;
};
export const money = (v) => {
  if (v == null || Number.isNaN(v)) return 'not recorded';
  if (v >= 1e6) return `€${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}m`;
  if (v >= 1e3) return `€${Math.round(v / 1e3)}k`;
  return `€${v}`;
};
export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

// The metric in its own unit, compared with the average player of the same position group.
export function metricFact(ctx, i, m) {
  const { base } = ctx;
  const p = base.players[i];
  const pct = Math.round(base.pct[i][m] * 100);
  const grp = GROUP_PLURAL[p.grp].toLowerCase();
  if (m === 'ga90') {
    const f = gaFacts(base, i);
    return `${p.ga} G+A in ${p.minutes.toLocaleString('en')} min = ${fmt2(f.rawRate)} per 90. With k = ${f.k} matches of shrinkage this is read as ${fmt2(f.shrunk)} per 90 (U21 ${grp}: ${fmt2(f.groupRate)}). ${ordinal(pct)} percentile after the fairness correction.`;
  }
  if (m === 'big90') {
    return `Shown for context only: the engine estimated zero true-talent variance for this metric, so it carries weight 0. ${ordinal(pct)} percentile.`;
  }
  const d = p.z[m] * Math.sqrt(TAU2[m][p.grp]);
  if (m === 'off90') return `While he is on the pitch his team scores ${fmt2(Math.abs(d))} goals per 90 ${d >= 0 ? 'more' : 'fewer'} than the Elo model expects, relative to the average U21 ${grp.slice(0, -1)} (shrunk for minutes). ${ordinal(pct)} percentile.`;
  if (m === 'def90') return `While he is on the pitch his team concedes ${fmt2(Math.abs(d))} goals per 90 ${d >= 0 ? 'fewer' : 'more'} than the Elo model expects, relative to the average U21 ${grp.slice(0, -1)}. ${ordinal(pct)} percentile.`;
  if (m === 'disc90') return `${fmt2(Math.abs(d))} ${d >= 0 ? 'fewer' : 'more'} card points per 90 than the average U21 ${grp.slice(0, -1)} (yellow = 1, red = 2). ${ordinal(pct)} percentile.`;
  return MEANING[m];
}

// The metric in plain words, for the profile (no method details).
export function plainFact(ctx, i, m) {
  const { base } = ctx;
  const p = base.players[i];
  const who = `an average U21 ${GROUP_PLURAL[p.grp].toLowerCase().slice(0, -1)}`;
  if (m === 'ga90') {
    const f = gaFacts(base, i);
    return `${fmt2(f.rawRate)} goals + assists per 90 minutes (${who}: ${fmt2(f.groupRate)}).`;
  }
  if (m === 'big90') return 'Against equal or stronger opponents. Shown for context only; not part of the score.';
  const d = p.z[m] * Math.sqrt(TAU2[m][p.grp]);
  const a = fmt2(Math.abs(d));
  if (m === 'off90') return `With him on the pitch his team scores ${a} goals per 90 ${d >= 0 ? 'more' : 'fewer'} than expected, compared with ${who}.`;
  if (m === 'def90') return `With him on the pitch his team concedes ${a} goals per 90 ${d >= 0 ? 'fewer' : 'more'} than expected, compared with ${who}.`;
  if (m === 'disc90') return `${a} ${d >= 0 ? 'fewer' : 'more'} cards per 90 than ${who}.`;
  return '';
}

// Short chips: the biggest named reasons why the fair score differs from the raw score.
export function reasonChips(ctx, i, max = 3, { marketValue = true } = {}) {
  const { base, res } = ctx;
  const p = base.players[i];
  const b = breakdown(base, res, i);
  const r = rawBreakdown(base, res, i);
  const out = [];
  const eloDiff = p.teamElo - base.adj.eloMean;
  if (Math.abs(b.elo) >= 1) out.push({ w: Math.abs(b.elo), text: eloDiff < 0 ? `Weaker team (Elo ${signed(eloDiff, 0)}): ${signed(b.elo)} pts` : `Stronger team (Elo ${signed(eloDiff, 0)}): ${signed(b.elo)} pts` });
  if (Math.abs(b.age) >= 1) out.push({ w: Math.abs(b.age), text: `Age: ${signed(b.age)} pts` });
  if (marketValue && r.value <= -1 && p.valueEnd > 0) out.push({ w: Math.abs(r.value), text: `Low market value (${money(p.valueEnd)}) kept him down the list` });
  if (marketValue && r.value >= 1 && res.players[i].rankChange < 0 && p.valueEnd > 0) out.push({ w: r.value, text: `High market value (${money(p.valueEnd)}) lifts him on the list` });
  const best = [...b.parts].filter((x) => x.weight > 0).sort((x, y) => y.perf - x.perf)[0];
  if (best && best.perf >= 2) out.push({ w: best.perf, text: `${SHORT[best.metric]}: ${signed(best.perf)} pts` });
  const worst = [...b.parts].filter((x) => x.weight > 0).sort((x, y) => x.perf - y.perf)[0];
  if (worst && worst.perf <= -2) out.push({ w: Math.abs(worst.perf) * 0.9, text: `${SHORT[worst.metric]}: ${signed(worst.perf)} pts` });
  if (p.minutes < 900) out.push({ w: 0.5, text: `Only ${p.minutes} minutes` });
  if (p.bq >= 3) out.push({ w: 0.4, text: `Born ${['', 'Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][p.bq]}` });
  return out.sort((a, b2) => b2.w - a.w).slice(0, max).map((x) => x.text);
}

// "Why does A rank above B?" — exact contribution differences, in score points.
export function whyBetter(ctx, ia, ib) {
  const { base, res } = ctx;
  const A = base.players[ia];
  const B = base.players[ib];
  const ra = res.players[ia];
  const rb = res.players[ib];
  const ba = breakdown(base, res, ia);
  const bb = breakdown(base, res, ib);
  const sameGroup = A.grp === B.grp;
  const rows = METRICS.map((m, j) => {
    const a = ba.parts[j];
    const b = bb.parts[j];
    return { metric: m, label: LABELS[m], a: a.total, b: b.total, diff: a.total - b.total, aPerf: a.perf, bPerf: b.perf, aCtx: a.age + a.elo, bCtx: b.age + b.elo, wa: a.weight, wb: b.weight };
  });
  const gap = ba.total - bb.total;
  const leader = gap >= 0 ? 'A' : 'B';
  const sorted = [...rows].sort((x, y) => (leader === 'A' ? y.diff - x.diff : x.diff - y.diff));
  const drivers = sorted.filter((r) => (leader === 'A' ? r.diff > 0.25 : r.diff < -0.25)).slice(0, 3);
  const against = sorted.filter((r) => (leader === 'A' ? r.diff < -0.25 : r.diff > 0.25)).reverse().slice(0, 2);
  // Confidence: do the 10th-90th percentile rank ranges overlap?
  const overlap = !(ra.rankHigh < rb.rankLow || rb.rankHigh < ra.rankLow);
  const ctxGap = ba.age + ba.elo - (bb.age + bb.elo);
  const perfGap = ba.perf - bb.perf;
  const rawFlip = Math.sign(ra.rawRank - rb.rawRank) !== Math.sign(ra.fairRank - rb.fairRank);
  return { A, B, ra, rb, ba, bb, rows, gap, leader, drivers, against, overlap, ctxGap, perfGap, sameGroup, rawFlip };
}
