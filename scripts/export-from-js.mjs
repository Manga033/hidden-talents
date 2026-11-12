// Writes the current engine's results back into server/data so the files match what the app shows.
// The app's JavaScript engine is a line-by-line port of engine-python (steps 5-11); this keeps the exported
// data.json and CSV in step with it after an engine change, without re-running the 1.5 GB Python pipeline.
// Usage: npm run export   (then npm run verify should report exact agreement)
import { readFileSync, writeFileSync } from 'node:fs';
import { buildPool, parseCSV, parseEngineJSON } from '../src/engine/pool.js';
import { prepare, presetWeights, run } from '../src/engine/engine.js';
import { biasAudit } from '../src/engine/verify.js';
import { spearman } from '../src/engine/stats.js';

const jsonPath = new URL('../server/data/data.json', import.meta.url);
const csvPath = new URL('../server/data/hidden_talent_2025_26.csv', import.meta.url);
const csvText = readFileSync(csvPath, 'utf8');
const json = parseEngineJSON(readFileSync(jsonPath, 'utf8'));
const rows = parseCSV(csvText);
const pool = buildPool(json, rows);
const base = prepare(pool);
const res = run(base, presetWeights('Balanced'), { seed: 42 });
const N = base.players.length;
const byId = new Map(base.players.map((p, i) => [p.id, i]));
const stars = (s) => Math.min(5, Math.max(0.5, Math.round((s / 20) * 2) / 2));

json.players.forEach((p) => {
  const r = res.players[byId.get(p.id)];
  p.fairRank = r.fairRank;
  p.fairScore = r.fairScore;
  p.currentAbility = r.fairScore;
  p.caStars = stars(r.fairScore);
  p.rankChange = r.rankChange;
  p.positionRank = r.posRank;
  p.positionCount = r.posN;
  p.confidence = { level: r.conf, value: Math.round(r.confValue * 100) / 100, rankLow: Math.round(r.rankLow), rankHigh: Math.round(r.rankHigh) };
  p.robustnessTop10 = Math.round(r.robust * 1000) / 1000;
  p.hiddenTalent = r.hidden;
  p.earlyPeaker = r.early;
  p.scoutLive = r.scout;
  p.tags = r.tags;
  if (p.releaseWarning) p.releaseWarning = p.releaseWarning.replace(/fair rank is #\d+/, `fair rank is #${r.fairRank}`).replace('Review before letting go.', 'Transfer opportunity / contract to review.');
  p.fairnessNote = Math.abs(r.rankChange) >= 10
    ? p.fairnessNote.replace(/rank moves \d+→\d+/, `rank moves ${r.rawRank}→${r.fairRank}`)
    : 'Fair and raw rank are close; context correction changed little.';
});
// Player order is kept: the Monte Carlo draws follow it, so re-sorting would change the rank ranges on re-run.

// Bias audit of the top 20 on both lists, from the current ranks.
const a = json.audit;
const raw20 = biasAudit(base, res, 'rawRank', 20);
const fair20 = biasAudit(base, res, 'fairRank', 20);
a.rawTop20 = raw20.top;
a.fairTop20 = fair20.top;
const r2 = (x, d = 100) => (Number.isFinite(x) ? Math.round(x * d) / d : null);
a.oddsRatioRaw = r2(raw20.oddsRatio);
a.oddsRatioFair = r2(fair20.oddsRatio);
a.fisherPRaw = r2(raw20.p, 1000);
a.fisherPFair = r2(fair20.p, 1000);
a.fourFifthsRaw = r2(raw20.fourFifths);
a.fourFifthsFair = r2(fair20.fourFifths);
a.spearmanRawFair = Math.round(spearman(res.players.map((x) => x.rawRank), res.players.map((x) => x.fairRank)) * 1000) / 1000;
a.hiddenTalentCount = res.players.filter((x) => x.hidden).length;
a.earlyPeakerCount = res.players.filter((x) => x.early).length;
json.meta.engine = 'JavaScript engine (src/engine), true-talent scale; exported by scripts/export-from-js.mjs';
delete json.__nanFields;
writeFileSync(jsonPath, JSON.stringify(json, null, 1));

// CSV: same columns and order, engine columns replaced.
const head = csvText.split(/\r?\n/)[0].split(',');
const byPid = new Map(base.players.map((p, i) => [String(p.pid), i]));
const py = (b) => (b ? 'True' : 'False');
const esc = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const out = rows.map((r) => {
  const x = res.players[byPid.get(String(r.player_id))];
  return {
    ...r,
    fairRank: x.fairRank, rankChange: x.rankChange, fairScore: x.fairScore, conf: x.conf,
    rlo: x.rankLow, rhi: x.rankHigh, robust10: x.robust, hidden: py(x.hidden), early: py(x.early), scout: py(x.scout),
  };
}).sort((m, n) => m.fairRank - n.fairRank);
writeFileSync(csvPath, [head.join(','), ...out.map((r) => head.map((h) => esc(r[h])).join(','))].join('\n') + '\n');
console.log(`exported ${N} players: hidden ${a.hiddenTalentCount}, priced above output ${a.earlyPeakerCount}`);
