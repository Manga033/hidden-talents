// Re-runs the JavaScript engine on server/data and compares it with what the Python engine exported.
// Usage: npm run verify
// The files in server/data are written by scripts/export-from-js.mjs (npm run export) or by step6_export.py;
// after either, fair ranks, scores, flags and rank ranges should agree exactly.
import { readFileSync } from 'node:fs';
import { buildPool, parseCSV, parseEngineJSON } from '../src/engine/pool.js';
import { prepare, presetWeights, run } from '../src/engine/engine.js';
import { reproducibility } from '../src/engine/verify.js';

const json = parseEngineJSON(readFileSync(new URL('../server/data/data.json', import.meta.url), 'utf8'));
const csv = parseCSV(readFileSync(new URL('../server/data/hidden_talent_2025_26.csv', import.meta.url), 'utf8'));
const pool = buildPool(json, csv);
const t0 = performance.now();
const base = prepare(pool);
const res = run(base, presetWeights('Balanced'), { seed: 42 });
const t1 = performance.now();
console.log(`players ${pool.players.length}, unmatched ${pool.unmatched.length}, engine ${(t1 - t0).toFixed(0)} ms`);
const rep = reproducibility(base, res);
console.log(JSON.stringify(rep, null, 1));
console.log('OLS corrections:');
for (const [m, x] of Object.entries(base.adj.info)) {
  console.log(m.padEnd(7), 'age b=', x.bAge.toFixed(3), 'p=', x.pAge.toExponential(2), x.keptAge ? 'KEPT' : '    ', '| elo b=', x.bElo.toFixed(3), 'p=', x.pElo.toExponential(2), x.keptElo ? 'KEPT' : '');
}
