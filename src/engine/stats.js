// Small numeric toolkit that matches numpy / pandas / scipy behaviour where the engine depends on it.

export const sum = (a) => a.reduce((s, x) => s + x, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : 0);
// numpy std (ddof = 0), the default in the Python engine.
export const std = (a, ddof = 0) => {
  if (a.length - ddof <= 0) return 0;
  const m = mean(a);
  return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - ddof));
};
export const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  if (!n) return NaN;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

// numpy.round: round half to even.
export function npRound(x) {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}
export const clip = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// numpy.percentile with the default linear interpolation.
export function percentile(a, q) {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return NaN;
  const pos = ((s.length - 1) * q) / 100;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

// pandas rank(pct=True), average method for ties.
export function rankPct(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const out = new Array(a.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k][1]] = r / a.length;
    i = j + 1;
  }
  return out;
}

// pandas rank(ascending=False, method='first'): 1 = highest; ties keep input order.
export function rankDescFirst(a) {
  const order = a.map((v, i) => i).sort((x, y) => a[y] - a[x] || x - y);
  const r = new Array(a.length);
  order.forEach((i, k) => (r[i] = k + 1));
  return r;
}

/* ---------- Student t distribution (for the OLS p-values in engine.adjust) ---------- */
function logGamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const t = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let s = 1.000000000190015;
  for (let j = 0; j < 6; j++) s += c[j] / ++y;
  return -t + Math.log((2.5066282746310005 * s) / x);
}
function betacf(a, b, x) {
  const MAXIT = 300;
  const EPS = 3e-14;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function incBeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
// Two-sided p-value for a t statistic: 2 * (1 - t.cdf(|t|, df)).
export function tTwoSidedP(t, df) {
  const x = df / (df + t * t);
  return incBeta(df / 2, 0.5, x);
}

/* ---------- OLS with intercept + 2 predictors (engine.adjust) ---------- */
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m.flat();
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
// X: rows [1, x1, x2]. Returns beta, standard errors, t and two-sided p (df = n - 3).
export function ols3(X, y) {
  const n = y.length;
  const XtX = [0, 1, 2].map((r) => [0, 1, 2].map((c) => sum(X.map((row) => row[r] * row[c]))));
  const Xty = [0, 1, 2].map((r) => sum(X.map((row, k) => row[r] * y[k])));
  const Inv = inv3(XtX);
  const beta = Inv.map((row) => sum(row.map((v, k) => v * Xty[k])));
  const resid = y.map((v, k) => v - sum(X[k].map((x, j) => x * beta[j])));
  const s2 = sum(resid.map((r) => r * r)) / (n - 3);
  const se = [0, 1, 2].map((j) => Math.sqrt(s2 * Inv[j][j]));
  const t = beta.map((b, j) => b / se[j]);
  const p = t.map((tt) => tTwoSidedP(Math.abs(tt), n - 3));
  return { beta, se, t, p, df: n - 3 };
}

/* ---------- Correlation ---------- */
export function pearson(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}
// scipy.stats.spearmanr (average ranks for ties).
export const spearman = (x, y) => pearson(rankPct(x), rankPct(y));

/* ---------- Fisher exact test, two-sided (scipy default) ---------- */
function logFact(n) {
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}
export function fisherExact([[a, b], [c, d]]) {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = r1 + r2;
  const lf = (k) => logFact(k);
  const base = lf(r1) + lf(r2) + lf(c1) + lf(n - c1) - lf(n);
  const prob = (x) => Math.exp(base - lf(x) - lf(r1 - x) - lf(c1 - x) - lf(r2 - c1 + x));
  const pObs = prob(a);
  let p = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) {
    const px = prob(x);
    if (px <= pObs * (1 + 1e-7)) p += px;
  }
  const or = b * c === 0 ? (a * d === 0 ? NaN : Infinity) : (a * d) / (b * c);
  return { oddsRatio: or, p: Math.min(1, p) };
}

/* ---------- Seeded random numbers (Monte Carlo + Dirichlet weights) ---------- */
export function rng(seed = 42) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = () => {
    if (spare != null) {
      const v = spare;
      spare = null;
      return v;
    }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
  // Dirichlet(1,...,1) = normalised Exponential(1) draws.
  const dirichlet = (k) => {
    const g = Array.from({ length: k }, () => -Math.log(1 - next()));
    const t = sum(g);
    return g.map((x) => x / t);
  };
  return { next, normal, dirichlet };
}

/* ---------- Chi-square goodness of fit (birth quarters against an even split) ---------- */
function gammaPLower(a, x) {
  // Regularised lower incomplete gamma P(a, x) by series / continued fraction.
  if (x <= 0) return 0;
  const gln = logGamma(a);
  if (x < a + 1) {
    let ap = a;
    let s = 1 / a;
    let del = s;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      s += del;
      if (Math.abs(del) < Math.abs(s) * 1e-14) break;
    }
    return s * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a;
  let c = 1e300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}
export function chiSquare(observed, expected) {
  const chi = observed.reduce((s, o, i) => s + (o - expected[i]) ** 2 / expected[i], 0);
  const df = observed.length - 1;
  return { chi, df, p: 1 - gammaPLower(df / 2, chi / 2) };
}
