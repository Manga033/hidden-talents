/*
  JavaScript port of the scoring layer of the Hidden Talent engine.

  Python (engine-python/)                     JavaScript (this file)
  ---------------------------------------     -------------------------------------------
  step1_elo.py      team Elo ratings          -> input (team_elo in the CSV)
  step2/3           on-pitch goals, seasons   -> input (z-scores in data.json)
  step4b_shrink.py  K and TAU2                -> constants.js
  engine.adjust     fairness OLS              -> adjust()        (re-estimated here, p-values included)
  engine.composite  weighted z per position   -> composite()
  engine.raw_score  G+A and market value      -> rawScore()
  engine.score_pool ranks                     -> run()
  step6_export      flags, Monte Carlo, plan  -> run()
  step6 GBR potential model                   -> input (potential in data.json; needs 10 seasons of history)

  Everything is deterministic except the Monte Carlo, which uses a fixed seed.
*/
import { ACTIVE, ALPHA, CONF_BANDS, GROUPS, K, LABELS, METRICS, NOSIGNAL, PRESETS, TAU2, WATCH } from './constants.js';
import { clip, mean, median, npRound, ols3, percentile, rankDescFirst, rankPct, rng, std } from './stats.js';

export const score = (z) => clip(npRound(50 + 15 * z), 1, 99);
const groupIdx = (players) => Object.fromEntries(GROUPS.map((g) => [g, players.map((p, i) => (p.grp === g ? i : -1)).filter((i) => i >= 0)]));

/* ---------- engine.adjust: pooled OLS of each z-metric on decimal age and team strength ---------- */
export function adjust(players) {
  const n = players.length;
  const ageMean = mean(players.map((p) => p.age));
  const eloMean = mean(players.map((p) => p.teamElo));
  const ageC = players.map((p) => p.age - ageMean);
  const eloC = players.map((p) => (p.teamElo - eloMean) / 100);
  const X = players.map((_, i) => [1, ageC[i], eloC[i]]);
  const info = {};
  const zf = players.map(() => ({}));
  const corr = players.map(() => ({}));
  METRICS.forEach((m) => {
    const y = players.map((p) => p.z[m]);
    if (std(y) < 1e-9) {
      players.forEach((_, i) => {
        zf[i][m] = y[i];
        corr[i][m] = { age: 0, elo: 0 };
      });
      info[m] = { bAge: 0, bElo: 0, pAge: 1, pElo: 1, keptAge: false, keptElo: false, n };
      return;
    }
    const fit = ols3(X, y);
    const keptAge = fit.p[1] < ALPHA;
    const keptElo = fit.p[2] < ALPHA;
    const ba = keptAge ? fit.beta[1] : 0;
    const be = keptElo ? fit.beta[2] : 0;
    players.forEach((_, i) => {
      corr[i][m] = { age: ba * ageC[i], elo: be * eloC[i] };
      zf[i][m] = y[i] - ba * ageC[i] - be * eloC[i];
    });
    info[m] = {
      bAge: fit.beta[1], bElo: fit.beta[2], seAge: fit.se[1], seElo: fit.se[2],
      tAge: fit.t[1], tElo: fit.t[2], pAge: fit.p[1], pElo: fit.p[2], keptAge, keptElo, n, df: fit.df,
    };
  });
  return { zf, corr, info, ageMean, eloMean, ageC, eloC };
}

/* ---------- weights: engine.composite drops NOSIGNAL metrics and renormalises ---------- */
export function activeWeights(wByGroup) {
  const out = {};
  GROUPS.forEach((g) => {
    const w = METRICS.map((m, j) => (NOSIGNAL.includes(m) ? 0 : wByGroup[g][j]));
    const t = w.reduce((s, x) => s + x, 0) || 1;
    out[g] = w.map((x) => x / t);
  });
  return out;
}
export const presetWeights = (name) => activeWeights(PRESETS[name] || PRESETS.Balanced);

/* ---------- engine.composite ---------- */
// True-talent spread of a weighted sum: each z is in true-talent SD units, so the prior SD is the length of w.
export const wNorm = (w) => Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;

// Weighted sum of shrunk z-scores, centred on the position average and divided by its TRUE-TALENT spread.
// (Dividing by the spread of the shrunk estimates instead would stretch the positions the data measures worst,
//  e.g. goalkeepers and defenders 3.7x vs attackers 1.6x, and let noise reach the top of the overall ranking.)
export function composite(Z, players, W, G) {
  const out = new Array(players.length).fill(0);
  const stats = {};
  GROUPS.forEach((g) => {
    const ix = G[g];
    if (!ix.length) return;
    const c = ix.map((i) => METRICS.reduce((s, m, j) => s + W[g][j] * Z[i][m], 0));
    const mu = mean(c);
    const sd = wNorm(W[g]);
    ix.forEach((i, k) => (out[i] = (c[k] - mu) / sd));
    stats[g] = { mu, sd };
  });
  return { comp: out, stats };
}

/* ---------- engine.raw_score: 50% goals+assists, 50% log market value, per position group ---------- */
export function rawScore(players, G) {
  const out = new Array(players.length).fill(0);
  const parts = new Array(players.length);
  const stats = {};
  GROUPS.forEach((g) => {
    const ix = G[g];
    if (!ix.length) return;
    const ga = ix.map((i) => players[i].ga);
    const vals = ix.map((i) => players[i].valueEnd).filter((v) => v != null && v > 0);
    const med = median(vals);
    const lv = ix.map((i) => Math.log(players[i].valueEnd != null && players[i].valueEnd > 0 ? players[i].valueEnd : med));
    const gaM = mean(ga);
    const gaS = std(ga) > 1e-9 ? std(ga) : 1;
    const lvM = mean(lv);
    const lvS = std(lv) || 1;
    const a = ga.map((x) => (x - gaM) / gaS);
    const v = lv.map((x) => (x - lvM) / lvS);
    const c = a.map((x, k) => 0.5 * x + 0.5 * v[k]);
    const cM = mean(c);
    const cS = std(c) || 1;
    ix.forEach((i, k) => {
      out[i] = (c[k] - cM) / cS;
      parts[i] = { ga: (0.5 * a[k]) / cS, value: (0.5 * v[k]) / cS, gaZ: a[k], valueZ: v[k], valueImputed: !(players[i].valueEnd > 0) };
    });
    stats[g] = { gaMean: gaM, gaSd: gaS, lvMean: lvM, lvSd: lvS, cMean: cM, cSd: cS, medianValue: med };
  });
  return { comp: out, parts, stats };
}

/* ---------- per-90 sampling noise used by the Monte Carlo (step6) ---------- */
export function noiseOf(p) {
  const o = {};
  METRICS.forEach((m) => (o[m] = K[m] ? Math.sqrt(K[m][p.grp] / (p.m90 + K[m][p.grp])) : 0));
  return o;
}

/* ---------- base: everything that does not depend on the weights ---------- */
export function prepare(pool) {
  const players = pool.players;
  const G = groupIdx(players);
  const adj = adjust(players);
  const raw = rawScore(players, G);
  const noise = players.map(noiseOf);
  // Mean of z, fair z and correction per group: used to explain each score relative to the position average.
  const gmean = {};
  GROUPS.forEach((g) => {
    const ix = G[g];
    gmean[g] = {};
    METRICS.forEach((m) => {
      gmean[g][m] = {
        z: mean(ix.map((i) => players[i].z[m])),
        zf: mean(ix.map((i) => adj.zf[i][m])),
        age: mean(ix.map((i) => adj.corr[i][m].age)),
        elo: mean(ix.map((i) => adj.corr[i][m].elo)),
      };
    });
  });
  // Percentile of each fair z inside the position group (pandas rank(pct=True)): used by plan and charts.
  const pct = players.map(() => ({}));
  GROUPS.forEach((g) => {
    const ix = G[g];
    METRICS.forEach((m) => {
      const r = rankPct(ix.map((i) => adj.zf[i][m]));
      ix.forEach((i, k) => (pct[i][m] = r[k]));
    });
  });
  // Group rates for goals + assists (engine.metrics) so the per-90 numbers can be shown in real units.
  const gaRate = {};
  GROUPS.forEach((g) => {
    const ix = G[g];
    const ga = ix.reduce((s, i) => s + players[i].ga, 0);
    const m90 = ix.reduce((s, i) => s + players[i].m90, 0);
    gaRate[g] = m90 ? ga / m90 : 0;
  });
  // Similar players: 100 minus the average percentile gap over the four active metrics, same position group.
  // (Cosine similarity ignores magnitude: a star and a bench player with the same "shape" scored 100%.)
  const similar = new Array(players.length);
  GROUPS.forEach((g) => {
    const ix = G[g];
    ix.forEach((i) => {
      similar[i] = ix
        .filter((b) => b !== i)
        .map((b) => ({ b, gap: ACTIVE.reduce((s, m) => s + Math.abs(pct[i][m] - pct[b][m]), 0) / ACTIVE.length }))
        .sort((x, y) => x.gap - y.gap || x.b - y.b)
        .slice(0, 3)
        .map(({ b, gap }) => ({ index: b, id: players[b].id, similarity: Math.round(100 * (1 - gap)), gap: Math.round(gap * 100) }));
    });
  });
  return { players, G, adj, raw, noise, gmean, pct, gaRate, similar, N: players.length };
}

/* ---------- run: weights -> ranks, scores, flags, confidence, robustness, plan ---------- */
export function run(base, W, { mcRuns = 400, weightRuns = 2000, seed = 42, exportConfidence = null, exportFair = false } = {}) {
  const { players, G, adj, raw, noise, pct, N } = base;
  const fair = composite(adj.zf, players, W, G);
  const unadj = composite(players.map((p) => p.z), players, W, G);
  // The raw (traditional) ranking does not depend on the weights, so it always comes from the Python export.
  const hasExp = players.every((p) => p.exp && p.exp.rawRank);
  const rawRank = hasExp ? players.map((p) => p.exp.rawRank) : rankDescFirst(raw.comp);
  const fairRank = exportFair && hasExp ? players.map((p) => p.exp.fairRank) : rankDescFirst(fair.comp);

  // Confidence: re-score 400 times with per-90 sampling noise, read the 10th-90th percentile of the rank.
  let rankLow;
  let rankHigh;
  let robust;
  if (exportConfidence) {
    rankLow = exportConfidence.map((c) => c.rankLow);
    rankHigh = exportConfidence.map((c) => c.rankHigh);
    robust = exportConfidence.map((c) => c.robust);
  } else {
    const R = rng(seed);
    const base0 = players.map((p, i) => METRICS.reduce((s, m, j) => s + W[p.grp][j] * adj.zf[i][m], 0));
    const mu = {};
    const sd = {};
    GROUPS.forEach((g) => {
      const v = G[g].map((i) => base0[i]);
      mu[g] = mean(v);
      sd[g] = wNorm(W[g]);
    });
    const ranks = players.map(() => new Float64Array(mcRuns));
    const c = new Float64Array(N);
    const order = Array.from({ length: N }, (_, i) => i);
    for (let r = 0; r < mcRuns; r++) {
      for (let i = 0; i < N; i++) {
        const p = players[i];
        let s = 0;
        for (let j = 0; j < METRICS.length; j++) {
          const m = METRICS[j];
          s += W[p.grp][j] * (adj.zf[i][m] + R.normal() * noise[i][m]);
        }
        c[i] = (s - mu[p.grp]) / sd[p.grp];
      }
      order.sort((a, b) => c[b] - c[a]);
      order.forEach((i, k) => (ranks[i][r] = k + 1));
    }
    rankLow = ranks.map((a) => percentile(Array.from(a), 10));
    rankHigh = ranks.map((a) => percentile(Array.from(a), 90));
    // Robustness: 2,000 random weightings of the 4 active metrics, share of runs in the overall top 10.
    const act = METRICS.map((m, j) => (NOSIGNAL.includes(m) ? -1 : j)).filter((j) => j >= 0);
    const top = new Float64Array(N);
    const cc = new Float64Array(N);
    for (let r = 0; r < weightRuns; r++) {
      const Wr = {};
      GROUPS.forEach((g) => {
        const w = new Array(METRICS.length).fill(0);
        const d = R.dirichlet(act.length);
        act.forEach((j, k) => (w[j] = d[k]));
        Wr[g] = w;
      });
      // Each random weighting is centred and scaled with its own position average and true-talent spread.
      const muR = {};
      const sdR = {};
      GROUPS.forEach((g) => {
        muR[g] = METRICS.reduce((s, m, j) => s + Wr[g][j] * base.gmean[g][m].zf, 0);
        sdR[g] = wNorm(Wr[g]);
      });
      for (let i = 0; i < N; i++) {
        const p = players[i];
        let s = 0;
        for (let j = 0; j < METRICS.length; j++) s += Wr[p.grp][j] * adj.zf[i][METRICS[j]];
        cc[i] = (s - muR[p.grp]) / sdR[p.grp];
      }
      order.sort((a, b) => cc[b] - cc[a]);
      for (let k = 0; k < 10; k++) top[order[k]] += 1;
    }
    robust = Array.from(top, (x) => x / weightRuns);
  }
  const width = rankLow.map((lo, i) => (rankHigh[i] - lo) / N);
  // Confidence on an absolute scale: how much of the pool the likely (10th-90th percentile) rank range covers.
  // (The original export used thirds of the pool, so a third of players were "High" by definition.)
  const [t1, t2] = CONF_BANDS;
  const conf = width.map((w) => (w <= t1 ? 'High' : w <= t2 ? 'Medium' : 'Low'));

  const fairScore = exportFair && hasExp ? players.map((p) => p.exp.fairScore) : fair.comp.map(score);
  const rawScoreV = hasExp ? players.map((p) => p.exp.rawScore) : raw.comp.map(score);
  const upside = players.map((p, i) => p.potentialHigh - fairScore[i]);
  const up85 = percentile(upside, 85);

  const out = players.map((p, i) => {
    const rankChange = rawRank[i] - fairRank[i];
    const pf = fairRank[i] / N;
    const pr = rawRank[i] / N;
    const hidden = pf <= 0.12 && rankChange >= 0.1 * N;
    const early = pr <= 0.15 && fairRank[i] - rawRank[i] >= 0.15 * N;
    // Watch live: in the fair top 25% from fewer than 900 minutes (the potential forecast tracks market value, so it is not used here).
    const scout = pf <= WATCH.topShare && p.minutes < WATCH.maxMinutes;
    const releaseWarning = p.plannedRelease && pf <= 0.25;
    // Strengths / weaknesses: fair z beyond +-1 true-talent SD (z is already shrunk, so no second reliability factor).
    const pros = [];
    const cons = [];
    ['ga90', 'off90', 'def90', 'disc90'].forEach((m) => {
      const z = adj.zf[i][m];
      if (z >= 1) pros.push({ metric: m, z });
      if (z <= -1) cons.push({ metric: m, z });
    });
    // Development plan (step6): biggest weighted gaps to the 75th percentile of the position.
    const plan = ACTIVE.map((m) => {
      const j = METRICS.indexOf(m);
      const q = pct[i][m];
      return { gap: Math.max(0, 0.75 - q) * W[p.grp][j], metric: m, p: q };
    })
      .sort((a, b) => b.gap - a.gap || (b.metric > a.metric ? 1 : -1))
      .filter((x) => x.gap > 0)
      .slice(0, 3)
      .map((x) => ({ metric: x.metric, label: LABELS[x.metric], now: npRound(1 + 19 * x.p), target: npRound(1 + 19 * 0.75), weight: W[p.grp][METRICS.indexOf(x.metric)] }));
    const tags = [hidden && 'Hidden Talent', early && 'Early Peaker?', scout && 'Watch Live'].filter(Boolean);
    return {
      i, compFair: fair.comp[i], compUnadj: unadj.comp[i], compRaw: raw.comp[i],
      rawRank: rawRank[i], fairRank: fairRank[i], rankChange, rawScore: rawScoreV[i], fairScore: fairScore[i],
      unadjScore: score(unadj.comp[i]),
      rankLow: rankLow[i], rankHigh: rankHigh[i], conf: conf[i], confValue: clip(1 - width[i], 0, 1), robust: robust[i],
      hidden, early, scout, releaseWarning, upside: upside[i], pros, cons, plan, tags,
    };
  });
  return { W, players: out, fairStats: fair.stats, unadjStats: unadj.stats, thresholds: { conf: [t1, t2], upside85: up85 } };
}

/* ---------- Explanations: every score as an exact sum of named parts ---------- */

// Fair score = 50 + sum over metrics of 15 * w * (fair z - position mean) / sd.
// Each metric part splits into "performance" (raw z) and "context correction" (age, team strength).
export function breakdown(base, result, i) {
  const p = base.players[i];
  const g = p.grp;
  const w = result.W[g];
  const sd = result.fairStats[g].sd;
  const gm = base.gmean[g];
  const parts = METRICS.map((m, j) => {
    const perf = (15 * w[j] * (p.z[m] - gm[m].z)) / sd;
    const age = (-15 * w[j] * (base.adj.corr[i][m].age - gm[m].age)) / sd;
    const elo = (-15 * w[j] * (base.adj.corr[i][m].elo - gm[m].elo)) / sd;
    return { metric: m, weight: w[j], z: p.z[m], zf: base.adj.zf[i][m], perf, age, elo, total: perf + age + elo };
  });
  const total = parts.reduce((s, x) => s + x.total, 0);
  return {
    parts,
    perf: parts.reduce((s, x) => s + x.perf, 0),
    age: parts.reduce((s, x) => s + x.age, 0),
    elo: parts.reduce((s, x) => s + x.elo, 0),
    total,
    unclipped: 50 + total,
    score: result.players[i].fairScore,
  };
}

// Raw score = 50 + 15 * (0.5 * z(G+A) + 0.5 * z(log value)) / sd.
export function rawBreakdown(base, result, i) {
  const r = base.raw.parts[i];
  return { ga: 15 * r.ga, value: 15 * r.value, gaZ: r.gaZ, valueZ: r.valueZ, valueImputed: r.valueImputed, score: result.players[i].rawScore, unclipped: 50 + 15 * (r.ga + r.value) };
}

// Turns a z-score back into the metric's own units (per 90), using the engine's TAU2.
export function realUnits(base, i, m, which = 'z') {
  const p = base.players[i];
  const z = which === 'zf' ? base.adj.zf[i][m] : p.z[m];
  if (!TAU2[m]) return null;
  return z * Math.sqrt(TAU2[m][p.grp]);
}

// Shrunk goals + assists per 90 exactly as engine.metrics computes it.
export function gaFacts(base, i) {
  const p = base.players[i];
  const k = K.ga90[p.grp];
  const mu = base.gaRate[p.grp];
  return { k, groupRate: mu, rawRate: p.m90 ? p.ga / p.m90 : 0, shrunk: (p.ga + k * mu) / (p.m90 + k), weightOwn: p.m90 / (p.m90 + k) };
}
