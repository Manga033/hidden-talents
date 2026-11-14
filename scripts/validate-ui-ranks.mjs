import { readFileSync } from 'node:fs';

const model = JSON.parse(readFileSync(new URL('../server/data/model-v3/engine_v3.json', import.meta.url), 'utf8'));
const canonical = JSON.parse(readFileSync(new URL('../server/data/model-v3/canonical_rankings.json', import.meta.url), 'utf8'));
const expected = new Map(canonical.players.map((p) => [p.playerId, p]));
const errors = [];
const groupRanks = new Map();

for (const p of model.players) {
  const c = expected.get(p.playerId);
  if (!c) { errors.push(`${p.playerId}: missing canonical ranking`); continue; }
  const authoritative = c.ranks.authoritative;
  if (p.positionRank !== authoritative.value || p.positionCount !== authoritative.count) errors.push(`${p.playerId}: engine rank differs from canonical rank`);
  if (p.positionRank !== p.ranks.position.value || p.positionRank !== p.ranks.authoritative.value) errors.push(`${p.playerId}: duplicate rank fields disagree`);
  if (p.traditionalPositionRank !== p.ranks.traditionalPosition.value) errors.push(`${p.playerId}: traditional rank fields disagree`);
  if (p.score !== c.score || p.traditionalScore !== c.traditionalScore) errors.push(`${p.playerId}: score fields disagree`);
  if (p.confidence.level !== c.confidence.level || p.confidence.value !== c.confidence.value) errors.push(`${p.playerId}: confidence fields disagree`);
  if (JSON.stringify(p.flags) !== JSON.stringify(c.flags)) errors.push(`${p.playerId}: player flags disagree`);
  const key = `${p.positionGroup}:${p.positionRank}`;
  if (groupRanks.has(key)) errors.push(`${key}: duplicate fair position rank`);
  groupRanks.set(key, p.playerId);
}

if (expected.size !== model.players.length) errors.push(`Player count differs: canonical ${expected.size}, engine ${model.players.length}`);
if (errors.length) { console.error(`UI rank consistency: FAILED\n${errors.slice(0, 20).join('\n')}`); process.exit(1); }
console.log(`UI rank consistency: PASSED (${model.players.length} players; one canonical fair and traditional position rank per player)`);
