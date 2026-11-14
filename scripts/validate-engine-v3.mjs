import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const MODEL = join(ROOT, 'server', 'data', 'model-v3');
const CANONICAL = join(ROOT, 'server', 'data', 'canonical');
const errors = [];

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

const result = JSON.parse(readFileSync(join(MODEL, 'engine_v3.json'), 'utf8'));
const canonicalRankings = JSON.parse(readFileSync(join(MODEL, 'canonical_rankings.json'), 'utf8'));
const csv = parseCSV(readFileSync(join(MODEL, 'engine_v3_players.csv'), 'utf8'));
const canonicalPlayers = parseCSV(readFileSync(join(CANONICAL, 'players.csv'), 'utf8'));
const jsonById = new Map(result.players.map((p) => [p.playerId, p]));
const csvById = new Map(csv.map((p) => [p.player_id, p]));
const canonicalIds = new Set(canonicalPlayers.map((p) => p.player_id));
const rankingById = new Map(canonicalRankings.players.map((p) => [p.playerId, p]));

if (result.players.length !== canonicalPlayers.length) errors.push(`JSON has ${result.players.length} players; expected ${canonicalPlayers.length}`);
if (csv.length !== canonicalPlayers.length) errors.push(`CSV has ${csv.length} players; expected ${canonicalPlayers.length}`);
if (jsonById.size !== result.players.length) errors.push('JSON contains duplicate player IDs');
if (csvById.size !== csv.length) errors.push('CSV contains duplicate player IDs');

for (const id of canonicalIds) {
  const j = jsonById.get(id), c = csvById.get(id);
  if (!j) { errors.push(`JSON missing ${id}`); continue; }
  if (!c) { errors.push(`CSV missing ${id}`); continue; }
  const ranking = rankingById.get(id);
  if (!ranking) errors.push(`canonical_rankings.json missing ${id}`);
  const checks = [
    ['score', j.score, c.score], ['position rank', j.positionRank, c.position_rank], ['position count', j.positionCount, c.position_count],
    ['traditional score', j.traditionalScore, c.traditional_score], ['traditional position rank', j.traditionalPositionRank, c.traditional_position_rank],
    ['overall rank', j.overallRankExperimental, c.overall_rank_experimental], ['confidence', j.confidence.level, c.confidence],
    ['rank low', j.confidence.positionRankLow, c.position_rank_low], ['rank high', j.confidence.positionRankHigh, c.position_rank_high],
  ];
  for (const [label, a, b] of checks) if (String(a) !== String(b)) errors.push(`${id}: JSON/CSV ${label} mismatch (${a} vs ${b})`);
  if (String(j.flags.hiddenTalent) !== c.hidden_talent || String(j.flags.pricedAboveOutput) !== c.priced_above_output || String(j.flags.watchLive) !== c.watch_live) errors.push(`${id}: JSON/CSV flag mismatch`);
  if (ranking) {
    if (ranking.score !== j.score || ranking.traditionalScore !== j.traditionalScore) errors.push(`${id}: canonical ranking score mismatch`);
    if (JSON.stringify(ranking.ranks) !== JSON.stringify(j.ranks)) errors.push(`${id}: canonical rank object mismatch`);
    if (JSON.stringify(ranking.flags) !== JSON.stringify(j.flags)) errors.push(`${id}: canonical flag mismatch`);
  }
  const explained = j.explanation.baseline + j.explanation.categoryContributions.reduce((a, x) => a + x.points, 0) + j.explanation.contextPoints;
  if (Math.abs(explained - j.explanation.totalUnrounded) > .015) errors.push(`${id}: explanation contributions do not sum to total`);
  if (Math.round(Math.max(1, Math.min(99, j.explanation.totalUnrounded))) !== j.score) errors.push(`${id}: explanation does not round to score`);
  if (j.modelVersion !== result.meta.modelVersion) errors.push(`${id}: model version mismatch`);
  if (!j.dataOrigin.includes('synthetic')) errors.push(`${id}: synthetic origin label missing`);
}

const byGroup = new Map();
for (const p of result.players) { if (!byGroup.has(p.positionGroup)) byGroup.set(p.positionGroup, []); byGroup.get(p.positionGroup).push(p); }
for (const [group, players] of byGroup) {
  const ranks = players.map((p) => p.positionRank).sort((a, b) => a - b);
  const traditionalRanks = players.map((p) => p.traditionalPositionRank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) errors.push(`${group}: position ranks are not the sequence 1..${players.length}`);
  for (let i = 0; i < traditionalRanks.length; i++) if (traditionalRanks[i] !== i + 1) errors.push(`${group}: traditional position ranks are not the sequence 1..${players.length}`);
  for (const p of players) {
    if (p.positionCount !== players.length) errors.push(`${p.playerId}: incorrect position count`);
    if (p.confidence.positionRankLow < 1 || p.confidence.positionRankHigh > players.length) errors.push(`${p.playerId}: rank interval outside position pool`);
  }
}
const overall = result.players.map((p) => p.overallRankExperimental).sort((a, b) => a - b);
for (let i = 0; i < overall.length; i++) if (overall[i] !== i + 1) errors.push('Overall experimental ranks are not a unique sequence');

const summaryConfidence = Object.fromEntries(['High', 'Medium', 'Low'].map((level) => [level, result.players.filter((p) => p.confidence.level === level).length]));
for (const level of Object.keys(summaryConfidence)) if (summaryConfidence[level] !== result.summary.confidence[level]) errors.push(`Summary ${level} count is incorrect`);
const summaryFlags = { hiddenTalent: result.players.filter((p) => p.flags.hiddenTalent).length, pricedAboveOutput: result.players.filter((p) => p.flags.pricedAboveOutput).length, watchLive: result.players.filter((p) => p.flags.watchLive).length };
for (const flag of Object.keys(summaryFlags)) if (summaryFlags[flag] !== result.summary.flags[flag] || summaryFlags[flag] !== canonicalRankings.summary.flags[flag]) errors.push(`Summary ${flag} count is incorrect`);
if (canonicalRankings.modelVersion !== result.meta.modelVersion || canonicalRankings.resultId !== result.meta.resultId) errors.push('Canonical rankings metadata does not match engine result');

console.log(`Engine v3 validation: ${errors.length ? 'FAILED' : 'PASSED'}`);
console.log(`Players: ${result.players.length}; model: ${result.meta.modelVersion}; confidence: ${JSON.stringify(summaryConfidence)}`);
console.log(`Flags: ${JSON.stringify(summaryFlags)}; result: ${result.meta.resultId}`);
if (errors.length) { for (const error of errors.slice(0, 100)) console.error(`ERROR: ${error}`); process.exit(1); }

