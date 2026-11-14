import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, 'server', 'data', 'canonical');
const OUT = join(ROOT, 'server', 'data', 'model-v3');
const VERSION = '3.0.0-individual-role-model';
const SEED = 20261114;
mkdirSync(OUT, { recursive: true });
const datasetManifestText = readFileSync(join(DATA, 'dataset_manifest.json'), 'utf8');
const RESULT_ID = createHash('sha256').update(`${VERSION}\n${datasetManifestText}`).digest('hex').slice(0, 16);

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((x) => x.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
const readCSV = (name) => parseCSV(readFileSync(join(DATA, name), 'utf8'));
const num = (x, fallback = 0) => Number.isFinite(Number(x)) ? Number(x) : fallback;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x, n = 3) => Number(x.toFixed(n));
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };
const percentile = (a, p) => { const s = [...a].sort((x, y) => x - y); if (!s.length) return null; const x = (s.length - 1) * p; const lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
const groupBy = (rows, fn) => { const out = new Map(); for (const row of rows) { const key = fn(row); if (!out.has(key)) out.set(key, []); out.get(key).push(row); } return out; };
const hashInt = (text) => Number.parseInt(createHash('sha256').update(String(text)).digest('hex').slice(0, 8), 16) >>> 0;
function rngFor(key) { let a = hashInt(`${SEED}:${key}`) || 1; let spare = null; const next = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; const normal = () => { if (spare != null) { const z = spare; spare = null; return z; } const u = Math.max(next(), 1e-12), v = next(); const m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); }; return { next, normal }; }

const players = readCSV('players.csv');
const seasons = readCSV('player_season_stats.csv');
const physical = new Map(readCSV('physical_stats.csv').map((r) => [r.player_id, r]));
const goalkeepers = new Map(readCSV('goalkeeper_stats.csv').map((r) => [r.player_id, r]));
const contracts = new Map(readCSV('contracts.csv').map((r) => [r.player_id, r]));
const appearances = readCSV('player_matches.csv');
const teamStats = new Map(readCSV('team_match_stats.csv').map((r) => [`${r.match_id}|${r.team_id}`, r]));
const teams = new Map(readCSV('teams.csv').map((r) => [r.team_id, r]));
const availability = groupBy(readCSV('availability.csv'), (r) => r.player_id);
const seasonById = new Map(seasons.map((r) => [r.player_id, r]));
const appsByPlayer = groupBy(appearances, (r) => r.player_id);

const playerRows = players.map((p) => {
  const s = seasonById.get(p.player_id); const ph = physical.get(p.player_id); const gk = goalkeepers.get(p.player_id); const apps = appsByPlayer.get(p.player_id) || [];
  const minutes = num(s.minutes); const m90 = minutes / 90; const avgPossession = apps.length ? apps.reduce((a, x) => a + num(x.minutes) * num(teamStats.get(`${x.match_id}|${x.team_id}`)?.possession, 50), 0) / minutes : 50;
  const outOfPossessionFactor = clamp(50 / Math.max(20, 100 - avgPossession), 0.65, 1.65);
  const daysUnavailable = (availability.get(p.player_id) || []).reduce((a, x) => a + num(x.days_unavailable), 0);
  const attempts = Math.max(1, num(s.passes_attempted)); const dribbles = Math.max(1, num(s.attempted_dribbles)); const tackles = Math.max(1, num(s.tackles_attempted)); const pressures = Math.max(1, num(s.pressures)); const aerials = Math.max(1, num(s.aerial_duels_attempted));
  const per90 = (field) => num(s[field]) / Math.max(1, m90);
  return {
    id: p.player_id, name: p.name, age: num(p.age_on_reference_date), position: p.primary_position, group: p.position_group, role: p.primary_role, teamId: p.current_team_id,
    team: p.current_team_name, teamElo: num(teams.get(p.current_team_id)?.elo_start, 1500), minutes, m90, coverage: num(s.event_coverage_pct, 100) / 100, possession: avgPossession,
    daysUnavailable, goals: num(s.goals), assists: num(s.assists), marketValue: num(contracts.get(p.player_id)?.estimated_transfer_value_eur), synthetic: true,
    values: {
      npxg90: per90('non_penalty_xg'), finishing90: (num(s.goals) - num(s.non_penalty_xg)) / Math.max(1, m90), shots90: per90('shots'), sot90: per90('shots_on_target'), box90: per90('touches_in_box'),
      xa90: per90('expected_assists'), keyPass90: per90('key_passes'), assistOverXa90: (num(s.assists) - num(s.expected_assists)) / Math.max(1, m90),
      progPass90: per90('progressive_passes'), finalThird90: per90('passes_into_final_third'), boxPass90: per90('passes_into_penalty_area'), progCarry90: per90('progressive_carries'),
      passCompletion: num(s.passes_completed) / attempts, dribbleSuccess: num(s.successful_dribbles) / dribbles, losses90: -(per90('dispossessed') + per90('miscontrols')),
      tackleWin: num(s.tackles_won) / tackles, tacklesWonAdj90: per90('tackles_won') * outOfPossessionFactor, interceptionsAdj90: per90('interceptions') * outOfPossessionFactor,
      blocksAdj90: per90('blocks') * outOfPossessionFactor, clearancesAdj90: per90('clearances') * outOfPossessionFactor, recoveriesAdj90: per90('recoveries') * outOfPossessionFactor,
      pressuresAdj90: per90('pressures') * outOfPossessionFactor, pressureSuccess: num(s.successful_pressures) / pressures, aerialWonAdj90: per90('aerial_duels_won') * outOfPossessionFactor,
      aerialSuccess: num(s.aerial_duels_won) / aerials, discipline90: -(per90('yellow_cards') + 2 * per90('red_cards')),
      topSpeed: num(ph?.top_speed_kmh), distance90: num(ph?.distance_per90_km), hsr90: num(ph?.high_speed_distance_per90_m), sprint90: num(ph?.sprints_per90), repeatSprint: num(ph?.repeat_sprint_score),
      availability: clamp(1 - daysUnavailable / 180, 0, 1),
      gkShotStop90: gk ? num(gk.post_shot_xg_minus_goals) / Math.max(1, m90) : 0, gkSavePct: gk ? num(gk.save_percentage) / 100 : 0,
      gkClaimPct: gk ? num(gk.crosses_claimed) / Math.max(1, num(gk.crosses_faced)) : 0, gkSweep90: gk ? num(gk.sweeper_actions) / Math.max(1, m90) : 0,
      gkPassPct: gk ? num(gk.passes_completed) / Math.max(1, num(gk.passes_attempted)) : 0, gkLongPct: gk ? num(gk.long_passes_completed) / Math.max(1, num(gk.long_passes_attempted)) : 0,
    },
  };
});

const OUTFIELD_CATEGORIES = {
  scoring: ['npxg90', 'finishing90', 'sot90', 'box90'],
  creation: ['xa90', 'keyPass90', 'assistOverXa90'],
  progression: ['progPass90', 'finalThird90', 'boxPass90', 'progCarry90'],
  retention: ['passCompletion', 'dribbleSuccess', 'losses90'],
  defending: ['tacklesWonAdj90', 'tackleWin', 'interceptionsAdj90', 'blocksAdj90', 'clearancesAdj90', 'recoveriesAdj90'],
  pressing: ['pressuresAdj90', 'pressureSuccess', 'discipline90'],
  aerial: ['aerialWonAdj90', 'aerialSuccess'],
  physical: ['topSpeed', 'distance90', 'hsr90', 'sprint90', 'repeatSprint'],
  availability: ['availability'],
};
const GK_CATEGORIES = {
  shot_stopping: ['gkShotStop90', 'gkSavePct'], distribution: ['gkPassPct', 'gkLongPct'], command: ['gkClaimPct'], sweeping: ['gkSweep90'],
  physical: ['topSpeed', 'repeatSprint'], availability: ['availability'],
};
const SHRINK_MINUTES = { scoring: 900, creation: 900, progression: 600, retention: 600, defending: 900, pressing: 750, aerial: 800, physical: 500, availability: 300, shot_stopping: 1500, distribution: 900, command: 1300, sweeping: 1000 };

const WEIGHTS = {
  GK: { shot_stopping: .42, distribution: .18, command: .14, sweeping: .10, physical: .06, availability: .10 },
  CB: { scoring: .01, creation: .02, progression: .15, retention: .10, defending: .28, pressing: .09, aerial: .19, physical: .09, availability: .07 },
  FB: { scoring: .03, creation: .12, progression: .20, retention: .10, defending: .20, pressing: .14, aerial: .04, physical: .11, availability: .06 },
  DM: { scoring: .03, creation: .08, progression: .20, retention: .16, defending: .20, pressing: .14, aerial: .06, physical: .07, availability: .06 },
  CM: { scoring: .06, creation: .15, progression: .20, retention: .15, defending: .11, pressing: .13, aerial: .04, physical: .09, availability: .07 },
  AM: { scoring: .15, creation: .22, progression: .17, retention: .13, defending: .03, pressing: .11, aerial: .02, physical: .09, availability: .08 },
  W: { scoring: .20, creation: .17, progression: .17, retention: .13, defending: .03, pressing: .12, aerial: .02, physical: .10, availability: .06 },
  ST: { scoring: .31, creation: .12, progression: .06, retention: .09, defending: .02, pressing: .15, aerial: .11, physical: .08, availability: .06 },
};
const roleKey = (p) => p.group === 'GK' ? 'GK' : p.position === 'CB' ? 'CB' : ['LB', 'RB'].includes(p.position) ? 'FB' : p.position === 'DM' ? 'DM' : p.position === 'CM' ? 'CM' : p.position === 'AM' ? 'AM' : ['LW', 'RW'].includes(p.position) ? 'W' : 'ST';
const categoryDefinitions = (p) => p.group === 'GK' ? GK_CATEGORIES : OUTFIELD_CATEGORIES;

// Standardize every component inside its position group. Winsorization prevents one synthetic extreme
// from defining the full scale, while category shrinkage controls small samples.
const byGroup = groupBy(playerRows, (p) => p.group);
const componentZ = new Map(playerRows.map((p) => [p.id, {}]));
for (const [, group] of byGroup) {
  const featureNames = new Set(group.flatMap((p) => Object.values(categoryDefinitions(p)).flat()));
  for (const feature of featureNames) {
    const values = group.map((p) => p.values[feature]); const lo = percentile(values, .02), hi = percentile(values, .98); const clipped = values.map((x) => clamp(x, lo, hi)); const m = mean(clipped), sd = std(clipped);
    group.forEach((p, i) => { componentZ.get(p.id)[feature] = clamp((clipped[i] - m) / sd, -3, 3); });
  }
}

for (const p of playerRows) {
  p.categories = {}; p.reliability = {};
  for (const [category, features] of Object.entries(categoryDefinitions(p))) {
    const raw = mean(features.map((f) => componentZ.get(p.id)[f] || 0));
    const reliability = clamp((p.minutes / (p.minutes + SHRINK_MINUTES[category])) * p.coverage, 0, 1);
    p.categories[category] = raw * reliability; p.reliability[category] = reliability;
  }
  p.weights = WEIGHTS[roleKey(p)];
}

function covariance(rows, categories) {
  const means = Object.fromEntries(categories.map((c) => [c, mean(rows.map((p) => p.categories[c] || 0))]));
  return categories.map((a) => categories.map((b) => mean(rows.map((p) => ((p.categories[a] || 0) - means[a]) * ((p.categories[b] || 0) - means[b])))));
}
const modelByGroup = {};
for (const [groupName, group] of byGroup) {
  const categories = Object.keys(group[0].weights); const cov = covariance(group, categories);
  modelByGroup[groupName] = { categories, cov };
  for (const p of group) {
    const w = categories.map((c) => p.weights[c] || 0); let variance = 0;
    for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) variance += w[i] * cov[i][j] * w[j];
    const raw = categories.reduce((a, c) => a + (p.weights[c] || 0) * (p.categories[c] || 0), 0);
    p.compositeSd = Math.sqrt(Math.max(variance, .04));
    p.performanceZ = raw / p.compositeSd;
  }
  // Conservative non-causal context adjustment: remove only 35% of the remaining linear Elo association,
  // capped at 0.35 standard deviations. Individual opportunity metrics were already possession-adjusted.
  const elo = group.map((p) => (p.teamElo - mean(group.map((x) => x.teamElo))) / 100); const z = group.map((p) => p.performanceZ); const beta = mean(elo.map((x, i) => x * (z[i] - mean(z)))) / (mean(elo.map((x) => x * x)) + .35);
  group.forEach((p, i) => { p.contextCorrectionZ = clamp(.35 * beta * elo[i], -.35, .35); p.fairZ = p.performanceZ - p.contextCorrectionZ; p.score = Math.round(clamp(50 + 12 * p.fairZ, 1, 99)); });
}

const rankDescending = (rows, value) => [...rows].sort((a, b) => value(b) - value(a) || a.id.localeCompare(b.id));
for (const [, group] of byGroup) rankDescending(group, (p) => p.fairZ).forEach((p, i, a) => { p.positionRank = i + 1; p.positionCount = a.length; });
rankDescending(playerRows, (p) => p.fairZ).forEach((p, i) => { p.overallRankExperimental = i + 1; });

// Correlated Monte Carlo uncertainty. The group category covariance supplies the correlation structure;
// each player's effective minutes controls how much of that uncertainty remains.
function cholesky(matrix) {
  const n = matrix.length, L = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let sum = 0; for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
    if (i === j) L[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 1e-6));
    else L[i][j] = (matrix[i][j] - sum) / L[j][j];
  }
  return L;
}
const MC_RUNS = 300; const rankDraws = new Map(playerRows.map((p) => [p.id, []])); const scoreDraws = new Map(playerRows.map((p) => [p.id, []]));
for (const [groupName, group] of byGroup) {
  const { categories, cov } = modelByGroup[groupName];
  const corr = cov.map((row, i) => row.map((x, j) => x / Math.sqrt(Math.max(cov[i][i] * cov[j][j], 1e-8)))); const L = cholesky(corr); const R = rngFor(`mc:${groupName}`);
  for (let run = 0; run < MC_RUNS; run++) {
    const draw = group.map((p) => {
      const normals = categories.map(() => R.normal()); const correlated = L.map((row) => row.reduce((a, x, j) => a + x * normals[j], 0));
      let weighted = 0; const w = categories.map((c) => p.weights[c] || 0);
      for (let j = 0; j < categories.length; j++) weighted += w[j] * ((p.categories[categories[j]] || 0) + correlated[j] * Math.sqrt(1 - (p.reliability[categories[j]] || 0)) * .48);
      let variance = 0; for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) variance += w[i] * cov[i][j] * w[j];
      const z = weighted / Math.sqrt(Math.max(variance, .04)) - p.contextCorrectionZ;
      scoreDraws.get(p.id).push(clamp(50 + 12 * z, 1, 99)); return { p, z };
    });
    draw.sort((a, b) => b.z - a.z || a.p.id.localeCompare(b.p.id)).forEach((x, i) => rankDraws.get(x.p.id).push(i + 1));
  }
}
for (const p of playerRows) {
  const ranks = rankDraws.get(p.id), scores = scoreDraws.get(p.id); p.rankLow = Math.round(percentile(ranks, .10)); p.rankHigh = Math.round(percentile(ranks, .90));
  p.scoreLow = Math.round(percentile(scores, .10)); p.scoreHigh = Math.round(percentile(scores, .90)); const width = (p.rankHigh - p.rankLow) / p.positionCount;
  p.confidence = p.coverage >= .9 && p.minutes >= 900 && width <= .28 ? 'High' : p.coverage >= .75 && p.minutes >= 600 && width <= .58 ? 'Medium' : 'Low';
  p.confidenceValue = round(clamp((1 - width) * Math.min(1, p.minutes / 1500) * p.coverage, 0, 1), 3);
}

const categoryScore = (x) => Math.round(clamp(50 + 12 * x, 1, 99));

// A deliberately simple market-and-visible-output baseline, calculated inside each position
// group so a goalkeeper is never compared directly with a forward. It is a comparison axis,
// not part of the v3 ability score.
for (const [, group] of byGroup) {
  const ga = group.map((p) => p.goals + p.assists); const lv = group.map((p) => Math.log(Math.max(25000, p.marketValue || 25000)));
  const gaMean = mean(ga), gaSd = std(ga), lvMean = mean(lv), lvSd = std(lv);
  group.forEach((p, i) => { p.traditionalZ = .5 * ((ga[i] - gaMean) / gaSd) + .5 * ((lv[i] - lvMean) / lvSd); p.traditionalScore = Math.round(clamp(50 + 12 * p.traditionalZ, 1, 99)); });
  rankDescending(group, (p) => p.traditionalZ).forEach((p, i) => { p.traditionalPositionRank = i + 1; });
}

const validRoleKeys = { GK: ['GK'], DEF: ['CB', 'FB'], MID: ['DM', 'CM', 'AM'], FWD: ['W', 'ST'] };
function scoreWithRole(p, key) {
  const weights = WEIGHTS[key]; const model = modelByGroup[p.group]; const w = model.categories.map((c) => weights[c] || 0); let variance = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) variance += w[i] * model.cov[i][j] * w[j];
  const raw = model.categories.reduce((a, c) => a + (weights[c] || 0) * (p.categories[c] || 0), 0);
  return { key, z: raw / Math.sqrt(Math.max(variance, .04)) - p.contextCorrectionZ, score: Math.round(clamp(50 + 12 * (raw / Math.sqrt(Math.max(variance, .04)) - p.contextCorrectionZ), 1, 99)) };
}

for (const p of playerRows) {
  const top = Math.max(1, Math.ceil(.15 * p.positionCount)); const drop = Math.max(1, Math.ceil(.15 * p.positionCount));
  p.hiddenTalent = p.positionRank <= top && p.traditionalPositionRank > p.rankHigh;
  p.pricedAboveOutput = p.traditionalPositionRank <= top && p.positionRank - p.traditionalPositionRank >= drop && p.traditionalPositionRank < p.rankLow && p.confidence !== 'Low';
  p.watchLive = p.positionRank <= Math.ceil(.25 * p.positionCount) && p.minutes < 900;
  p.roleFits = validRoleKeys[p.group].map((key) => scoreWithRole(p, key)).sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  p.categoryContributions = Object.keys(p.weights).map((category) => ({ category, points: 12 * (p.weights[category] || 0) * (p.categories[category] || 0) / p.compositeSd,
    weight: p.weights[category] || 0, categoryScore: categoryScore(p.categories[category] || 0), reliability: p.reliability[category] || 0 }));
  p.contextPoints = -12 * p.contextCorrectionZ;
  p.totalUnrounded = 50 + p.categoryContributions.reduce((a, x) => a + x.points, 0) + p.contextPoints;
  p.strengths = [...p.categoryContributions].filter((x) => x.categoryScore >= 58).sort((a, b) => b.points - a.points).slice(0, 3);
  p.weaknesses = [...p.categoryContributions].filter((x) => x.categoryScore <= 42).sort((a, b) => a.points - b.points).slice(0, 3);
}

const outputPlayers = rankDescending(playerRows, (p) => p.fairZ).map((p) => ({
  playerId: p.id, name: p.name, age: p.age, team: p.team, position: p.position, positionGroup: p.group, role: p.role, minutes: p.minutes,
  score: p.score, performanceScore: Math.round(clamp(50 + 12 * p.performanceZ, 1, 99)), contextAdjustmentPoints: round(-12 * p.contextCorrectionZ, 2),
  positionRank: p.positionRank, positionCount: p.positionCount, overallRankExperimental: p.overallRankExperimental,
  traditionalScore: p.traditionalScore, traditionalPositionRank: p.traditionalPositionRank,
  ranks: {
    authoritative: { type: 'position', value: p.positionRank, count: p.positionCount, modelVersion: VERSION },
    position: { value: p.positionRank, count: p.positionCount }, traditionalPosition: { value: p.traditionalPositionRank, count: p.positionCount },
    overallExperimental: { value: p.overallRankExperimental, count: playerRows.length },
    percentile: { fair: round(1 - (p.positionRank - 1) / Math.max(1, p.positionCount - 1), 4), traditional: round(1 - (p.traditionalPositionRank - 1) / Math.max(1, p.positionCount - 1), 4) },
  },
  confidence: { level: p.confidence, value: p.confidenceValue, scoreLow: p.scoreLow, scoreHigh: p.scoreHigh, positionRankLow: p.rankLow, positionRankHigh: p.rankHigh },
  categories: Object.fromEntries(Object.entries(p.categories).map(([k, v]) => [k, { score: categoryScore(v), z: round(v), reliability: round(p.reliability[k]), weight: p.weights[k] }])),
  context: { teamElo: round(p.teamElo, 1), averagePossession: round(p.possession, 1), daysUnavailable: p.daysUnavailable, eventCoveragePct: round(p.coverage * 100, 1) },
  flags: { hiddenTalent: p.hiddenTalent, pricedAboveOutput: p.pricedAboveOutput, watchLive: p.watchLive },
  explanation: {
    baseline: 50, categoryContributions: p.categoryContributions.map((x) => ({ category: x.category, points: round(x.points, 6), weight: round(x.weight, 3), categoryScore: x.categoryScore, reliability: round(x.reliability, 3) })),
    contextPoints: round(p.contextPoints, 6), totalUnrounded: round(p.totalUnrounded, 6), roundedScore: p.score,
  },
  strengths: p.strengths.map((x) => ({ category: x.category, score: x.categoryScore, points: round(x.points, 2) })),
  weaknesses: p.weaknesses.map((x) => ({ category: x.category, score: x.categoryScore, points: round(x.points, 2) })),
  roleFit: p.roleFits.map((x) => ({ roleModel: x.key, score: x.score })), bestRoleModel: p.roleFits[0].key,
  dataOrigin: 'synthetic-development', modelVersion: VERSION,
}));

const confidenceCounts = Object.fromEntries(['High', 'Medium', 'Low'].map((x) => [x, outputPlayers.filter((p) => p.confidence.level === x).length]));
const flagCounts = { hiddenTalent: outputPlayers.filter((p) => p.flags.hiddenTalent).length, pricedAboveOutput: outputPlayers.filter((p) => p.flags.pricedAboveOutput).length, watchLive: outputPlayers.filter((p) => p.flags.watchLive).length };
const groupSummary = Object.fromEntries([...byGroup].map(([g, rows]) => [g, { players: rows.length, highConfidence: rows.filter((p) => p.confidence === 'High').length, medianRankWidth: round(percentile(rows.map((p) => p.rankHigh - p.rankLow), .5), 1) }]));
const result = {
  meta: { modelVersion: VERSION, resultId: RESULT_ID, datasetVersion: '3.0.0-synthetic-foundation', generatedAt: '2026-11-14T00:00:00Z', syntheticData: true,
    warning: 'Development model built from generated synthetic event data. Scores are not real scouting conclusions.',
    primaryRank: 'positionRank', overallRankStatus: 'experimental', uncertaintyRuns: MC_RUNS,
    methodology: ['Shot-level xG', 'Individual event categories', 'Possession-adjusted defensive opportunity', 'Role-specific weights', 'Empirical-Bayes minute shrinkage', 'Covariance-aware score scaling', 'Correlated Monte Carlo rank intervals', 'Conservative partial club-context adjustment'] },
  summary: { players: outputPlayers.length, confidence: confidenceCounts, flags: flagCounts, groups: groupSummary }, players: outputPlayers,
};
writeFileSync(join(OUT, 'engine_v3.json'), JSON.stringify(result, null, 2) + '\n');

const canonicalRankings = {
  modelVersion: VERSION, resultId: RESULT_ID, primaryRank: 'position', generatedAt: result.meta.generatedAt, syntheticData: true,
  summary: result.summary,
  players: outputPlayers.map((p) => ({ playerId: p.playerId, name: p.name, score: p.score, traditionalScore: p.traditionalScore, ranks: p.ranks,
    confidence: p.confidence, flags: p.flags, bestRoleModel: p.bestRoleModel })),
};
writeFileSync(join(OUT, 'canonical_rankings.json'), JSON.stringify(canonicalRankings, null, 2) + '\n');

const categoryColumns = ['scoring', 'creation', 'progression', 'retention', 'defending', 'pressing', 'aerial', 'physical', 'availability', 'shot_stopping', 'distribution', 'command', 'sweeping'];
const csvColumns = ['player_id', 'name', 'team', 'position', 'position_group', 'role', 'minutes', 'score', 'performance_score', 'context_adjustment_points', 'position_rank', 'position_count', 'traditional_score', 'traditional_position_rank', 'overall_rank_experimental', 'confidence', 'confidence_value', 'score_low', 'score_high', 'position_rank_low', 'position_rank_high', 'hidden_talent', 'priced_above_output', 'watch_live', 'best_role_model', ...categoryColumns, 'data_origin', 'model_version'];
const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
const csvRows = outputPlayers.map((p) => {
  const row = { player_id: p.playerId, name: p.name, team: p.team, position: p.position, position_group: p.positionGroup, role: p.role, minutes: p.minutes, score: p.score,
    performance_score: p.performanceScore, context_adjustment_points: p.contextAdjustmentPoints, position_rank: p.positionRank, position_count: p.positionCount,
    traditional_score: p.traditionalScore, traditional_position_rank: p.traditionalPositionRank, overall_rank_experimental: p.overallRankExperimental,
    confidence: p.confidence.level, confidence_value: p.confidence.value, score_low: p.confidence.scoreLow, score_high: p.confidence.scoreHigh,
    position_rank_low: p.confidence.positionRankLow, position_rank_high: p.confidence.positionRankHigh, hidden_talent: p.flags.hiddenTalent,
    priced_above_output: p.flags.pricedAboveOutput, watch_live: p.flags.watchLive, best_role_model: p.bestRoleModel, data_origin: p.dataOrigin, model_version: p.modelVersion };
  for (const category of categoryColumns) row[category] = p.categories[category]?.score ?? '';
  return row;
});
writeFileSync(join(OUT, 'engine_v3_players.csv'), [csvColumns.join(','), ...csvRows.map((r) => csvColumns.map((c) => esc(r[c])).join(','))].join('\n') + '\n');

const seen = new Set(); const validationErrors = [];
for (const p of outputPlayers) {
  if (seen.has(p.playerId)) validationErrors.push(`duplicate ${p.playerId}`); seen.add(p.playerId);
  if (!Number.isFinite(p.score) || p.score < 1 || p.score > 99) validationErrors.push(`invalid score ${p.playerId}`);
  if (p.positionRank < 1 || p.positionRank > p.positionCount) validationErrors.push(`invalid position rank ${p.playerId}`);
  if (p.confidence.positionRankLow > p.confidence.positionRankHigh) validationErrors.push(`invalid rank interval ${p.playerId}`);
}
for (const [g, rows] of byGroup) {
  const ranks = new Set(rows.map((p) => p.positionRank)); if (ranks.size !== rows.length) validationErrors.push(`${g} position ranks are not unique`);
}
const report = { modelVersion: VERSION, passed: validationErrors.length === 0, errors: validationErrors, summary: result.summary,
  notes: ['Position rank is authoritative.', 'Overall rank remains experimental because positions have different evidence quality.', 'No market value is used in the ability score.', 'All v3 inputs are synthetic development data.'] };
writeFileSync(join(OUT, 'model_report.json'), JSON.stringify(report, null, 2) + '\n');
if (validationErrors.length) { console.error(validationErrors.join('\n')); process.exit(1); }
console.log(`Engine v3 built: ${outputPlayers.length} players`);
console.log(`Confidence: ${JSON.stringify(confidenceCounts)}`);
console.log(`Groups: ${JSON.stringify(groupSummary)}`);

