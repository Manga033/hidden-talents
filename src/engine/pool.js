// Loads the two files the Python engine writes (step6_export.py) and joins them per player:
//   data.json                      -> players with z-scores (raw and fair), potential, flags, audit
//   hidden_talent_2025_26.csv      -> exact age, team Elo, market value, goals, assists, rank intervals
import { GROUP_FROM_NAME, METRICS, POSMAP } from './constants.js';

// RFC 4180 CSV parser (quoted fields, commas and quotes inside names).
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i]])));
}

// Python's json.dump writes NaN for missing values, which is not valid JSON. Read it as null and count it.
export function parseEngineJSON(text) {
  let nan = 0;
  const fixed = text.replace(/:\s*(NaN|-?Infinity)(?=\s*[,}\]])/g, () => {
    nan += 1;
    return ': null';
  });
  const json = JSON.parse(fixed);
  json.__nanFields = nan;
  return json;
}

const num = (v) => (v === undefined || v === '' || v === 'nan' || v === 'NaN' ? null : Number(v));
const bool = (v) => v === 'True' || v === 'true' || v === '1';

export function validate(json, csvRows) {
  if (!json || !Array.isArray(json.players) || !json.players.length) return 'data.json has no "players" list.';
  const p = json.players[0];
  const need = ['id', 'name', 'positionGroup', 'metrics', 'rawRank', 'fairRank'];
  const miss = need.filter((k) => !(k in p));
  if (miss.length) return `data.json players are missing: ${miss.join(', ')}.`;
  if (!Array.isArray(csvRows) || !csvRows.length) return 'The CSV file is empty.';
  const needCsv = ['player_id', 'age', 'grp', 'team_elo', 'minutes', 'goals', 'assists', 'value_end'];
  const missCsv = needCsv.filter((k) => !(k in csvRows[0]));
  if (missCsv.length) return `The CSV is missing columns: ${missCsv.join(', ')}.`;
  return null;
}

export function buildPool(json, csvRows, nationality = {}) {
  const byId = new Map(csvRows.map((r) => [`P${r.player_id}`, r]));
  const players = [];
  const unmatched = [];
  json.players.forEach((p) => {
    const r = byId.get(p.id);
    if (!r) {
      unmatched.push(p.id);
      return;
    }
    const z = {};
    const zfExport = {};
    METRICS.forEach((m) => {
      const x = (p.metrics || []).find((k) => k.key === m);
      z[m] = x ? x.raw : 0;
      zfExport[m] = x ? x.fair : 0;
    });
    const minutes = num(r.minutes);
    const goals = num(r.goals);
    const assists = num(r.assists);
    const grp = r.grp || GROUP_FROM_NAME[p.positionGroup];
    const ageExact = num(r.age);
    const contract = p.releaseWarning ? (p.releaseWarning.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] : null;
    players.push({
      id: p.id,
      pid: r.player_id,
      name: p.name,
      position: p.position || POSMAP[r.sub_position] || 'CM',
      subPosition: r.sub_position || null,
      positionGroup: p.positionGroup,
      grp,
      birthDate: p.birthDate,
      birthQuarter: p.birthQuarter,
      bq: Number(String(p.birthQuarter || '').replace('Q', '')) || num(r.bq),
      age: ageExact,
      // Whole years in the 2025/26 season (age on 1 Jan 2026), as the engine measures it.
      ageShown: Math.floor(ageExact ?? p.age),
      country: nationality[r.player_id] || null,
      foot: p.foot,
      heightCm: p.heightCm,
      team: p.team || r.current_club_name,
      minutes,
      m90: minutes / 90,
      goals,
      assists,
      ga: goals + assists,
      apps: p.seasonStats?.apps ?? null,
      teamElo: num(r.team_elo),
      valueEnd: num(r.value_end),
      z,
      zfExport,
      // Potential comes from the gradient-boosted quantile model in step6 (trained on 2015-2022 seasons).
      potential: p.potential,
      potentialLow: p.potentialLow,
      potentialHigh: p.potentialHigh,
      plannedRelease: !!p.plannedRelease,
      contractEnd: contract,
      exp: {
        rawRank: p.rawRank,
        fairRank: p.fairRank,
        rawScore: p.rawScore,
        fairScore: p.fairScore,
        rankChange: p.rankChange,
        conf: p.confidence?.level ?? r.conf,
        confValue: p.confidence?.value ?? null,
        rankLow: num(r.rlo) ?? p.confidence?.rankLow,
        rankHigh: num(r.rhi) ?? p.confidence?.rankHigh,
        robust: num(r.robust10) ?? p.robustnessTop10,
        hidden: bool(r.hidden) || !!p.hiddenTalent,
        early: bool(r.early) || !!p.earlyPeaker,
        scout: bool(r.scout) || !!p.scoutLive,
        release: !!p.plannedRelease,
        releaseWarning: p.releaseWarning,
        pros: p.pros || [],
        cons: p.cons || [],
        plan: p.developmentPlan || [],
        similar: p.similarPlayers || [],
        fairnessNote: p.fairnessNote,
      },
    });
  });
  return { meta: json.meta || {}, audit: json.audit || {}, players, unmatched, csvRows: csvRows.length };
}
