// Checks that the JavaScript port reproduces the Python export, and recomputes the bias audit.
import { GROUPS, K, METRICS, TAU2 } from './constants.js';
import { fisherExact, mean, spearman } from './stats.js';

const pctEq = (a, b) => a.filter((x, i) => x === b[i]).length / a.length;
const maxAbs = (a, b) => Math.max(...a.map((x, i) => Math.abs(x - b[i])));

export function reproducibility(base, res) {
  const P = base.players;
  const R = res.players;
  const zfDiff = Math.max(...P.flatMap((p, i) => METRICS.map((m) => Math.abs(base.adj.zf[i][m] - p.zfExport[m]))));
  // Re-derive the goals + assists z-score from goals, assists and minutes only (engine.metrics + engine.zscores).
  const gaZ = new Array(P.length);
  GROUPS.forEach((g) => {
    const ix = P.map((p, i) => (p.grp === g ? i : -1)).filter((i) => i >= 0);
    const mu = ix.reduce((s, i) => s + P[i].ga, 0) / ix.reduce((s, i) => s + P[i].m90, 0);
    const x = ix.map((i) => (P[i].ga + K.ga90[g] * mu) / (P[i].m90 + K.ga90[g]));
    const xm = mean(x);
    ix.forEach((i, k) => (gaZ[i] = (x[k] - xm) / Math.sqrt(TAU2.ga90[g])));
  });
  const gaZDiff = maxAbs(gaZ, P.map((p) => p.z.ga90));
  const flag = (k, e) => pctEq(R.map((r) => r[k]), P.map((p) => p.exp[e]));
  return {
    players: P.length,
    zFairMaxDiff: +zfDiff.toFixed(4),
    gaZFromRawMaxDiff: +gaZDiff.toFixed(4),
    rawRankExact: +pctEq(R.map((r) => r.rawRank), P.map((p) => p.exp.rawRank)).toFixed(4),
    rawRankMaxDiff: maxAbs(R.map((r) => r.rawRank), P.map((p) => p.exp.rawRank)),
    fairRankExact: +pctEq(R.map((r) => r.fairRank), P.map((p) => p.exp.fairRank)).toFixed(4),
    fairRankMaxDiff: maxAbs(R.map((r) => r.fairRank), P.map((p) => p.exp.fairRank)),
    fairRankSpearman: +spearman(R.map((r) => r.fairRank), P.map((p) => p.exp.fairRank)).toFixed(5),
    rawScoreExact: +pctEq(R.map((r) => r.rawScore), P.map((p) => p.exp.rawScore)).toFixed(4),
    fairScoreExact: +pctEq(R.map((r) => r.fairScore), P.map((p) => p.exp.fairScore)).toFixed(4),
    fairScoreMaxDiff: maxAbs(R.map((r) => r.fairScore), P.map((p) => p.exp.fairScore)),
    hiddenAgree: +flag('hidden', 'hidden').toFixed(4),
    earlyAgree: +flag('early', 'early').toFixed(4),
    scoutAgree: +flag('scout', 'scout').toFixed(4),
    hiddenCount: [R.filter((r) => r.hidden).length, P.filter((p) => p.exp.hidden).length],
    earlyCount: [R.filter((r) => r.early).length, P.filter((p) => p.exp.early).length],
    scoutCount: [R.filter((r) => r.scout).length, P.filter((p) => p.exp.scout).length],
    confAgree: +flag('conf', 'conf').toFixed(4),
    rankLowSpearman: +spearman(R.map((r) => r.rankLow), P.map((p) => p.exp.rankLow)).toFixed(4),
    robustSpearman: +spearman(R.map((r) => r.robust), P.map((p) => p.exp.robust)).toFixed(4),
  };
}

// Birth-quarter bias audit (step6): top-N by rank, Q1 vs Q4 odds ratio, Fisher exact test, 80% rule.
export function biasAudit(base, res, key, n = 20) {
  const P = base.players;
  const N = P.length;
  const order = res.players.map((r, i) => i).sort((a, b) => res.players[a][key] - res.players[b][key]);
  const top = order.slice(0, n);
  const pool = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  P.forEach((p) => (pool[`Q${p.bq}`] += 1));
  const cnt = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
  top.forEach((i) => (cnt[`Q${P[i].bq}`] += 1));
  const t1 = cnt.Q1;
  const t4 = cnt.Q4;
  const fx = fisherExact([[t1, pool.Q1 - t1], [t4, pool.Q4 - t4]]);
  const rates = [1, 2, 3, 4].map((q) => cnt[`Q${q}`] / Math.max(1, pool[`Q${q}`]));
  const ff = Math.max(...rates) > 0 ? Math.min(...rates) / Math.max(...rates) : 0;
  return { n, N, pool, top: cnt, oddsRatio: fx.oddsRatio, p: fx.p, fourFifths: ff, rates };
}
