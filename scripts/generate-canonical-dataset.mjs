import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DATASET_VERSION, SCHEMAS, SYNTHETIC_SEED } from './dataset-schema.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const INPUT = join(ROOT, 'server', 'data');
const OUTPUT = join(INPUT, 'canonical');
const SCHEMA_DIR = join(OUTPUT, 'schemas');
const SEASON = '2025/26';
const REFERENCE_DATE = '2026-01-01';

mkdirSync(SCHEMA_DIR, { recursive: true });

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((x) => x.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function writeCSV(name, rows) {
  const columns = Object.keys(SCHEMAS[name].columns);
  const body = [columns.join(','), ...rows.map((r) => columns.map((k) => csvEscape(r[k])).join(','))].join('\n') + '\n';
  writeFileSync(join(OUTPUT, name), body);
}

const hashInt = (text) => Number.parseInt(createHash('sha256').update(String(text)).digest('hex').slice(0, 8), 16) >>> 0;
function rngFor(key) {
  let a = (hashInt(`${SYNTHETIC_SEED}:${key}`) || 1) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x, n = 2) => Number(x.toFixed(n));
const pick = (a, r) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
const syntheticList = (schemaName) => Object.entries(SCHEMAS[schemaName].columns).filter(([, x]) => x.origin === 'synthetic').map(([k]) => k).join(';');
const teamId = (name) => `T${createHash('sha1').update(name).digest('hex').slice(0, 10).toUpperCase()}`;
const poisson = (lambda, r) => {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= r(); } while (p > L && k < 20);
  return k - 1;
};
const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

const baseline = parseCSV(readFileSync(join(INPUT, 'hidden_talent_2025_26.csv'), 'utf8'));
const nationality = new Map(parseCSV(readFileSync(join(INPUT, 'nationality_2025_26.csv'), 'utf8')).map((r) => [r.player_id, r]));
const engineJson = JSON.parse(readFileSync(join(INPUT, 'data.json'), 'utf8').replace(/:\s*(NaN|-?Infinity)(?=\s*[,}\]])/g, ': null'));
const jsonPlayers = new Map(engineJson.players.map((p) => [String(p.id).replace(/^P/, ''), p]));

const roleMap = {
  GK: ['Sweeper Keeper', 'Shot Stopper'], CB: ['Ball-Playing Centre-Back', 'Stopper'], LB: ['Attacking Full-Back', 'Defensive Full-Back'], RB: ['Attacking Full-Back', 'Defensive Full-Back'],
  DM: ['Holding Midfielder', 'Deep-Lying Playmaker'], CM: ['Box-to-Box Midfielder', 'Deep-Lying Playmaker'], AM: ['Advanced Playmaker', 'Shadow Striker'],
  LW: ['Inside Forward', 'Wide Playmaker'], RW: ['Inside Forward', 'Wide Playmaker'], ST: ['Complete Forward', 'Pressing Forward'],
};
const fallbackPosition = { GK: 'GK', DEF: 'CB', MID: 'CM', FWD: 'ST' };
const posMap = { Goalkeeper: 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', 'Defensive Midfield': 'DM', 'Central Midfield': 'CM', 'Attacking Midfield': 'AM', 'Left Midfield': 'LW', 'Right Midfield': 'RW', 'Left Winger': 'LW', 'Right Winger': 'RW', 'Centre-Forward': 'ST', 'Second Striker': 'ST' };
const countries = ['England', 'Spain', 'Germany', 'Italy', 'France', 'Portugal', 'Netherlands', 'Belgium', 'Croatia', 'Bosnia and Herzegovina', 'Austria', 'Switzerland', 'Denmark', 'Serbia'];

const players = baseline.map((b) => {
  const jp = jsonPlayers.get(b.player_id) || {};
  const nat = nationality.get(b.player_id) || {};
  const r = rngFor(`player:${b.player_id}`);
  const position = jp.position || posMap[b.sub_position] || fallbackPosition[b.grp] || 'CM';
  const roles = roleMap[position] || roleMap[fallbackPosition[b.grp]];
  const age = Number(b.age);
  const birthDate = jp.birthDate || addDays(REFERENCE_DATE, -Math.round(age * 365.25));
  const existingHeight = Number(jp.heightCm);
  const heightBase = b.grp === 'GK' ? 192 : b.grp === 'DEF' ? 185 : b.grp === 'FWD' ? 181 : 178;
  const height = existingHeight >= 150 ? existingHeight : Math.round(clamp(heightBase + (r() - 0.5) * 16, 158, 204));
  const footRaw = String(jp.foot || 'Unknown').toLowerCase();
  const foot = footRaw === 'left' ? 'Left' : footRaw === 'right' ? 'Right' : footRaw === 'both' ? 'Both' : 'Unknown';
  const name = b.name;
  const teamName = b.current_club_name || 'Unattached';
  return {
    player_id: b.player_id, name, date_of_birth: birthDate, age_on_reference_date: round(age, 3),
    nationality: nat.country_of_citizenship || jp.country || 'Unknown', country_of_birth: nat.country_of_birth || pick(countries, r),
    height_cm: height, weight_kg: Math.round(clamp(height - 108 + (r() - 0.5) * 12, 55, 100)), preferred_foot: foot,
    weak_foot_rating: 2 + Math.floor(r() * 4), primary_position: position, position_group: b.grp,
    primary_role: roles[0], secondary_role: roles[1], current_team_id: teamId(teamName), current_team_name: teamName,
    senior_debut_date: addDays(birthDate, Math.round((16.5 + r() * 2.5) * 365.25)), academy: `${teamName} Academy`,
    youth_international_level: pick(['None', 'U17', 'U19', 'U21', 'Senior'], r), data_origin: 'mixed', synthetic_fields: syntheticList('players.csv'),
  };
});

const teamGroups = new Map();
for (const b of baseline) {
  const name = b.current_club_name || 'Unattached';
  if (!teamGroups.has(name)) teamGroups.set(name, []);
  teamGroups.get(name).push(Number(b.team_elo) || 1500);
}
const teams = [...teamGroups].sort(([a], [b]) => a.localeCompare(b)).map(([name, elos], i) => {
  const r = rngFor(`team:${name}`); const elo = elos.reduce((a, x) => a + x, 0) / elos.length; const league = i % 14;
  return { team_id: teamId(name), team_name: name, league_id: `SL${String(league + 1).padStart(2, '0')}`, league_name: `Synthetic League ${league + 1}`,
    country: countries[league], elo_start: round(elo, 2), attack_strength: round(clamp(1 + (elo - 1500) / 650 + (r() - 0.5) * 0.18, 0.55, 1.85), 3),
    defence_strength: round(clamp(1 - (elo - 1500) / 800 + (r() - 0.5) * 0.16, 0.55, 1.65), 3),
    average_possession: round(clamp(50 + (elo - 1500) / 25 + (r() - 0.5) * 5, 35, 68), 1), data_origin: 'mixed', synthetic_fields: syntheticList('teams.csv') };
});
const teamById = new Map(teams.map((t) => [t.team_id, t]));

const matches = [];
const matchesByTeam = new Map(teams.map((t) => [t.team_id, []]));
for (const [, leagueTeams] of Map.groupBy(teams, (t) => t.league_id)) {
  const n = leagueTeams.length;
  for (let i = 0; i < n; i++) {
    for (let roundNo = 0; roundNo < 26; roundNo++) {
      const home = leagueTeams[i]; const away = leagueTeams[(i + roundNo + 1) % n];
      if (!away || away.team_id === home.team_id) continue;
      const matchId = `M${home.team_id.slice(1, 6)}${away.team_id.slice(1, 6)}${String(roundNo + 1).padStart(2, '0')}`;
      const r = rngFor(`match:${matchId}`);
      const eloDiff = home.elo_start + 65 - away.elo_start;
      const homeXg = clamp(1.32 * home.attack_strength / away.defence_strength * Math.exp(eloDiff / 900), 0.25, 4.5);
      const awayXg = clamp(1.12 * away.attack_strength / home.defence_strength * Math.exp(-eloDiff / 1000), 0.2, 4.2);
      const hp = clamp((home.average_possession + (100 - away.average_possession)) / 2 + (r() - 0.5) * 6, 25, 75);
      const row = { match_id: matchId, date: addDays('2025-08-01', (roundNo * 8 + i * 2) % 300), season: SEASON, competition_id: home.league_id,
        home_team_id: home.team_id, away_team_id: away.team_id, home_elo_pre: home.elo_start, away_elo_pre: away.elo_start,
        expected_home_goals: round(homeXg), expected_away_goals: round(awayXg), home_goals: poisson(homeXg, r), away_goals: poisson(awayXg, r),
        home_possession: round(hp, 1), away_possession: round(100 - hp, 1), home_red_cards: r() < 0.035 ? 1 : 0, away_red_cards: r() < 0.035 ? 1 : 0,
        event_coverage_pct: 100, lineup_coverage_pct: 100, data_origin: 'synthetic', synthetic_fields: syntheticList('matches.csv') };
      matches.push(row); matchesByTeam.get(home.team_id).push(row); matchesByTeam.get(away.team_id).push(row);
    }
  }
}

const baselineByPlayer = new Map(baseline.map((b) => [b.player_id, b]));
const rateByGroup = {
  GK: { pass: 28, prog: 1, carry: 0.2, dribble: 0.05, tackle: 0.05, interception: 0.15, clear: 0.4, pressure: 1.0, aerial: 0.1, box: 0.05, shot: 0.02 },
  DEF: { pass: 55, prog: 5.5, carry: 1.8, dribble: 0.5, tackle: 2.2, interception: 1.7, clear: 4.0, pressure: 11, aerial: 4.5, box: 1.2, shot: 0.7 },
  MID: { pass: 52, prog: 6.5, carry: 3.0, dribble: 1.5, tackle: 1.8, interception: 1.1, clear: 0.8, pressure: 15, aerial: 1.8, box: 3.2, shot: 1.5 },
  FWD: { pass: 28, prog: 3.2, carry: 4.2, dribble: 2.2, tackle: 0.7, interception: 0.35, clear: 0.25, pressure: 13, aerial: 3.0, box: 7.5, shot: 2.8 },
};
const formations = ['4-3-3', '4-2-3-1', '3-4-2-1', '4-4-2'];
const playerMatches = [];

function distributeCount(total, weights, r) {
  const out = Array(weights.length).fill(0); const sum = weights.reduce((a, x) => a + x, 0) || 1;
  for (let k = 0; k < total; k++) {
    let x = r() * sum;
    for (let i = 0; i < weights.length; i++) { x -= weights[i]; if (x <= 0) { out[i]++; break; } }
  }
  return out;
}

for (const p of players) {
  const b = baselineByPlayer.get(p.player_id); const r = rngFor(`appearances:${p.player_id}`); const totalMinutes = Number(b.minutes);
  const available = [...(matchesByTeam.get(p.current_team_id) || [])].sort((a, x) => a.date.localeCompare(x.date));
  const exportedApps = Number(jsonPlayers.get(p.player_id)?.seasonStats?.apps) || 0;
  const apps = Math.floor(clamp(Math.max(Math.ceil(totalMinutes / 90), exportedApps || Math.ceil(totalMinutes / 72)), 1, Math.min(available.length, totalMinutes)));
  const selected = available.slice(0, apps);
  // Start every recorded appearance at one minute, then distribute the remaining minutes into
  // available 1..90 minute slots. This preserves the exact source total without zero/negative rows.
  const mins = Array(apps).fill(1); let remaining = totalMinutes - apps;
  while (remaining > 0) {
    const candidates = mins.map((m, i) => (m < 90 ? i : -1)).filter((i) => i >= 0);
    if (!candidates.length) throw new Error(`Cannot distribute ${totalMinutes} minutes over ${apps} appearances for ${p.player_id}`);
    const slot = candidates[Math.floor(r() * candidates.length)];
    const chunk = Math.min(remaining, 90 - mins[slot], 1 + Math.floor(r() * 15));
    mins[slot] += chunk; remaining -= chunk;
  }
  const weights = mins.map((m) => Math.max(0.1, m / 90 * (0.6 + r())));
  const goals = distributeCount(Number(b.goals), weights, r); const assists = distributeCount(Number(b.assists), weights, r); const base = rateByGroup[p.position_group];
  for (let i = 0; i < apps; i++) {
    const m = selected[i]; const min = mins[i]; const f = min / 90; const isHome = m.home_team_id === p.current_team_id; const opponent = isHome ? m.away_team_id : m.home_team_id;
    const stat = (rate, spread = 0.5, cap = 999) => Math.min(cap, Math.max(0, Math.round(rate * f * (1 - spread / 2 + r() * spread))));
    const pa = stat(base.pass, 0.35, 180); const pc = Math.min(pa, Math.round(pa * clamp(0.72 + r() * 0.2 + (p.position_group === 'DEF' ? 0.04 : 0), 0.55, 0.97)));
    const shots = Math.max(goals[i], stat(base.shot + goals[i] * 0.8, 0.7, 15)); const sot = Math.max(goals[i], Math.min(shots, stat(shots * 0.42 + goals[i] * 0.5, 0.5, 12)));
    const drA = stat(base.dribble * 1.5, 0.7, 25); const drW = Math.min(drA, stat(drA * 0.55, 0.5, 20)); const tacA = stat(base.tackle * 1.25, 0.6, 20); const tacW = Math.min(tacA, stat(tacA * 0.62, 0.4, 20));
    const pressures = stat(base.pressure, 0.55, 60); const aerialA = stat(base.aerial, 0.65, 30);
    const win = Math.round(min * r() * 0.45); const lose = Math.round((min - win) * r() * 0.45); const draw = min - win - lose;
    playerMatches.push({ match_id: m.match_id, player_id: p.player_id, team_id: p.current_team_id, opponent_id: opponent, minutes: min, starter: min >= 60,
      position_played: p.primary_position, role_played: r() < 0.82 ? p.primary_role : p.secondary_role, formation: pick(formations, r), home_away: isHome ? 'H' : 'A',
      score_state_minutes_winning: win, score_state_minutes_drawing: draw, score_state_minutes_losing: lose, goals: goals[i], assists: assists[i], penalty_goals: goals[i] && r() < 0.12 ? 1 : 0,
      shots, shots_on_target: sot, non_penalty_xg: round(clamp(shots * (0.09 + r() * 0.08) + goals[i] * 0.12, 0, 6)), expected_assists: round(clamp(assists[i] * 0.5 + stat(1.2, 1) * 0.08, 0, 4)),
      key_passes: stat((p.position_group === 'MID' ? 1.8 : p.position_group === 'FWD' ? 1.2 : 0.7) + assists[i], 0.8, 15), touches_in_box: stat(base.box, 0.65, 35),
      passes_attempted: pa, passes_completed: pc, progressive_passes: stat(base.prog, 0.55, 35), passes_into_final_third: stat(base.prog * 1.15, 0.6, 40),
      passes_into_penalty_area: stat(base.prog * 0.45, 0.75, 25), progressive_carries: stat(base.carry, 0.7, 30), successful_dribbles: drW, attempted_dribbles: drA,
      dispossessed: stat(p.position_group === 'FWD' ? 1.8 : 0.9, 0.8, 15), miscontrols: stat(p.position_group === 'FWD' ? 2.1 : 1.0, 0.8, 15),
      tackles_attempted: tacA, tackles_won: tacW, interceptions: stat(base.interception, 0.6, 15), blocks: stat(p.position_group === 'DEF' ? 1.1 : 0.35, 0.7, 15),
      clearances: stat(base.clear, 0.6, 30), recoveries: stat(p.position_group === 'MID' ? 7 : 5, 0.55, 30), pressures, successful_pressures: Math.min(pressures, stat(pressures * 0.31, 0.5, 50)),
      aerial_duels_attempted: aerialA, aerial_duels_won: Math.min(aerialA, stat(aerialA * 0.53, 0.5, 30)), fouls_committed: stat(p.position_group === 'DEF' ? 1.1 : 0.75, 0.8, 8),
      fouls_won: stat(p.position_group === 'FWD' ? 1.4 : 0.8, 0.8, 8), yellow_cards: r() < 0.1 * f ? 1 : 0, red_cards: r() < 0.008 * f ? 1 : 0,
      event_coverage_pct: 100, data_origin: 'mixed', synthetic_fields: syntheticList('player_matches.csv') });
  }
}

const sumFields = Object.keys(SCHEMAS['player_season_stats.csv'].columns).filter((k) => SCHEMAS['player_season_stats.csv'].columns[k].type === 'integer' || SCHEMAS['player_season_stats.csv'].columns[k].type === 'number');
const seasonStats = [];
for (const p of players) {
  const rows = playerMatches.filter((x) => x.player_id === p.player_id); const b = baselineByPlayer.get(p.player_id); const out = { player_id: p.player_id, season: SEASON, team_id: p.current_team_id, appearances: rows.length, starts: rows.filter((x) => x.starter).length };
  for (const field of sumFields) if (!(field in out)) out[field] = round(rows.reduce((a, x) => a + (Number(x[field]) || 0), 0));
  out.minutes = Number(b.minutes); out.goals = Number(b.goals); out.assists = Number(b.assists); out.event_coverage_pct = 100; out.data_origin = 'mixed'; out.synthetic_fields = syntheticList('player_season_stats.csv');
  seasonStats.push(out);
}

const goalkeeperStats = players.filter((p) => p.position_group === 'GK').map((p) => {
  const r = rngFor(`gk:${p.player_id}`); const minutes = Number(baselineByPlayer.get(p.player_id).minutes); const m90 = minutes / 90;
  const faced = Math.round(m90 * (3.2 + r() * 1.8)); const psxg = faced * (0.25 + r() * 0.08); const conceded = Math.round(clamp(psxg + (r() - 0.5) * Math.sqrt(Math.max(1, faced)) * 1.4, 0, faced)); const saves = Math.max(0, faced - conceded);
  const crosses = Math.round(m90 * (8 + r() * 4)); const passA = Math.round(m90 * (25 + r() * 12)); const passC = Math.round(passA * (0.72 + r() * 0.16)); const longA = Math.round(passA * (0.3 + r() * 0.3));
  return { player_id: p.player_id, season: SEASON, team_id: p.current_team_id, minutes, shots_on_target_faced: faced, goals_conceded: conceded, post_shot_xg: round(psxg), saves,
    save_percentage: faced ? round(100 * saves / faced, 1) : 0, post_shot_xg_minus_goals: round(psxg - conceded), crosses_faced: crosses, crosses_claimed: Math.round(crosses * (0.05 + r() * 0.08)),
    sweeper_actions: Math.round(m90 * (0.45 + r() * 0.8)), passes_attempted: passA, passes_completed: passC, long_passes_attempted: longA, long_passes_completed: Math.round(longA * (0.38 + r() * 0.25)),
    event_coverage_pct: 100, data_origin: 'mixed', synthetic_fields: syntheticList('goalkeeper_stats.csv') };
});

const availability = [];
for (const p of players) {
  const r = rngFor(`availability:${p.player_id}`); const events = r() < 0.42 ? 1 + (r() < 0.15 ? 1 : 0) : 0;
  for (let i = 0; i < events; i++) {
    const status = pick(['Injury', 'Injury', 'Illness', 'Suspension'], r); const days = status === 'Illness' ? 3 + Math.floor(r() * 10) : status === 'Suspension' ? 7 + Math.floor(r() * 15) : 7 + Math.floor(r() * 70); const start = addDays('2025-08-01', Math.floor(r() * 260));
    availability.push({ availability_id: `A${p.player_id}-${i + 1}`, player_id: p.player_id, start_date: start, end_date: addDays(start, days), status,
      reason: status === 'Injury' ? pick(['Hamstring', 'Ankle', 'Knee', 'Muscle fatigue', 'Adductor'], r) : status, days_unavailable: days, matches_missed: Math.round(days / 7),
      data_origin: 'synthetic', synthetic_fields: syntheticList('availability.csv') });
  }
}

const contracts = players.map((p) => {
  const r = rngFor(`contract:${p.player_id}`); const b = baselineByPlayer.get(p.player_id); const jp = jsonPlayers.get(p.player_id) || {}; const match = String(jp.releaseWarning || '').match(/\d{4}-\d{2}-\d{2}/);
  const value = Math.max(0, Math.round(Number(b.value_end) || 0)); const end = match?.[0] || `${2027 + Math.floor(r() * 4)}-06-30`; const wage = Math.round(clamp(18000 + Math.pow(Math.max(value, 100000) / 1000000, 0.72) * 120000 + r() * 70000, 15000, 8000000) / 1000) * 1000;
  return { player_id: p.player_id, team_id: p.current_team_id, contract_start: `${2023 + Math.floor(r() * 3)}-07-01`, contract_end: end, loan_status: pick(['Permanent', 'Permanent', 'Permanent', 'On loan', 'Loaned out'], r),
    estimated_wage_eur_year: wage, estimated_transfer_value_eur: value, release_clause_eur: Math.round(value * (1.25 + r() * 1.5) / 10000) * 10000,
    agent: `Synthetic Agency ${1 + Math.floor(r() * 40)}`, homegrown_status: pick(['Club trained', 'Association trained', 'No', 'Unknown'], r), work_permit_risk: pick(['Low', 'Low', 'Medium', 'High'], r),
    data_origin: 'mixed', synthetic_fields: syntheticList('contracts.csv') };
});

const quality = [];
for (const p of players) {
  for (const [name, real, synthetic] of [['players.csv', 10, 9], ['player_matches.csv', 6, 39], ['player_season_stats.csv', 7, 31], ['contracts.csv', 3, 9]]) {
    quality.push({ entity_type: 'player', entity_id: p.player_id, dataset_name: name, coverage_percentage: 100, real_field_count: real, synthetic_field_count: synthetic,
      quality_flag: 'Synthetic', missing_fields: '', notes: 'Development-only synthetic enrichment; do not present as observed scouting data.', data_origin: 'metadata' });
  }
}
for (const g of goalkeeperStats) quality.push({ entity_type: 'player', entity_id: g.player_id, dataset_name: 'goalkeeper_stats.csv', coverage_percentage: 100, real_field_count: 2, synthetic_field_count: 15, quality_flag: 'Synthetic', missing_fields: '', notes: 'Synthetic goalkeeper event model.', data_origin: 'metadata' });

const outputs = { 'players.csv': players, 'teams.csv': teams, 'matches.csv': matches, 'player_matches.csv': playerMatches, 'player_season_stats.csv': seasonStats, 'goalkeeper_stats.csv': goalkeeperStats, 'availability.csv': availability, 'contracts.csv': contracts, 'data_quality.csv': quality };
for (const [name, rows] of Object.entries(outputs)) writeCSV(name, rows);

const schemaDoc = { $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Scoutee canonical dataset', version: DATASET_VERSION, files: SCHEMAS };
writeFileSync(join(SCHEMA_DIR, 'dataset.schema.json'), JSON.stringify(schemaDoc, null, 2) + '\n');
const manifest = {
  dataset_version: DATASET_VERSION, season: SEASON, reference_date: REFERENCE_DATE, generated_at: '2026-11-14T00:00:00Z', deterministic_seed: SYNTHETIC_SEED,
  source: 'Existing Scoutee 2025/26 output used for player identity, minutes, goals, assists, club, age, position, Elo and market value.',
  synthetic_data_warning: 'All fields marked synthetic are generated development data. They are not observed football facts and must not be represented as real.',
  engine_status: 'Canonical dataset foundation only; current ranking engine remains unchanged.',
  files: Object.fromEntries(Object.entries(outputs).map(([name, rows]) => [name, { rows: rows.length, path: name }])),
};
writeFileSync(join(OUTPUT, 'dataset_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`Generated canonical dataset ${DATASET_VERSION}`);
for (const [name, rows] of Object.entries(outputs)) console.log(`${name.padEnd(28)} ${rows.length}`);

