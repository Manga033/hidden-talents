import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SCHEMAS, SYNTHETIC_SEED } from './dataset-schema.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, 'server', 'data', 'canonical');
const SEASON = '2025/26';

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((x) => x.trim());
  return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}
const readCSV = (name) => parseCSV(readFileSync(join(DATA, name), 'utf8'));
const csvEscape = (v) => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
function writeCSV(name, rows) {
  const columns = Object.keys(SCHEMAS[name].columns);
  writeFileSync(join(DATA, name), [columns.join(','), ...rows.map((r) => columns.map((k) => csvEscape(r[k])).join(','))].join('\n') + '\n');
}
const hashInt = (text) => Number.parseInt(createHash('sha256').update(String(text)).digest('hex').slice(0, 8), 16) >>> 0;
function rngFor(key) { let a = hashInt(`${SYNTHETIC_SEED}:engine-ready:${key}`) || 1; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round = (x, n = 2) => Number(x.toFixed(n));
const pick = (a, r) => a[Math.min(a.length - 1, Math.floor(r() * a.length))];
const syntheticList = (name) => Object.entries(SCHEMAS[name].columns).filter(([, rule]) => rule.origin === 'synthetic').map(([k]) => k).join(';');
const groupBy = (rows, key) => { const out = new Map(); for (const row of rows) { const k = key(row); if (!out.has(k)) out.set(k, []); out.get(k).push(row); } return out; };

const players = readCSV('players.csv');
const teams = readCSV('teams.csv');
const matches = readCSV('matches.csv');
const playerMatches = readCSV('player_matches.csv');
const seasonStats = readCSV('player_season_stats.csv');
const quality = readCSV('data_quality.csv');
const playerById = new Map(players.map((p) => [p.player_id, p]));
const teamById = new Map(teams.map((t) => [t.team_id, t]));
const matchById = new Map(matches.map((m) => [m.match_id, m]));
const appearancesByMatchTeam = groupBy(playerMatches, (p) => `${p.match_id}|${p.team_id}`);

// Context-only senior squad members make every synthetic match lineup complete without
// adding fabricated players to the ranked U21 pool.
const squadTemplate = [
  ...Array(3).fill('GK'), ...Array(8).fill('DEF'), ...Array(8).fill('MID'), ...Array(5).fill('FWD'),
];
const positionFor = { GK: ['GK'], DEF: ['CB', 'CB', 'LB', 'RB'], MID: ['DM', 'CM', 'CM', 'AM'], FWD: ['LW', 'RW', 'ST'] };
const roleFor = { GK: 'Goalkeeper', CB: 'Centre-Back', LB: 'Full-Back', RB: 'Full-Back', DM: 'Holding Midfielder', CM: 'Central Midfielder', AM: 'Creator', LW: 'Winger', RW: 'Winger', ST: 'Forward' };
const contextPlayers = [];
for (const team of teams) {
  const r = rngFor(`squad:${team.team_id}`); const counters = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  squadTemplate.forEach((group, index) => {
    counters[group]++; const position = positionFor[group][(counters[group] - 1) % positionFor[group].length];
    contextPlayers.push({ context_player_id: `C${team.team_id.slice(1)}${String(index + 1).padStart(2, '0')}`, team_id: team.team_id,
      display_name: `Synthetic ${team.team_name} Player ${index + 1}`, age: 19 + Math.floor(r() * 16), position, position_group: group,
      context_only: true, data_origin: 'synthetic', synthetic_fields: syntheticList('context_players.csv') });
  });
}
const contextByTeam = groupBy(contextPlayers, (p) => p.team_id);

const matchLineups = [];
for (const match of matches) {
  for (const teamId of [match.home_team_id, match.away_team_id]) {
    const r = rngFor(`lineup:${match.match_id}:${teamId}`); const observed = appearancesByMatchTeam.get(`${match.match_id}|${teamId}`) || [];
    const observedIds = new Set(observed.map((p) => p.player_id)); const context = [...contextByTeam.get(teamId)];
    const formation = observed[0]?.formation || pick(['4-3-3', '4-2-3-1', '3-4-2-1', '4-4-2'], r);
    const rankedStarters = observed.filter((p) => p.starter === 'true').sort((a, b) => Number(b.minutes) - Number(a.minutes)).slice(0, 11);
    const starterIds = new Set(rankedStarters.map((p) => p.player_id));
    const starterContext = context.filter((p) => p.position_group !== 'GK');
    const rankedHasGk = rankedStarters.some((p) => playerById.get(p.player_id)?.position_group === 'GK');
    const selectedContext = [];
    if (!rankedHasGk && rankedStarters.length < 11) selectedContext.push(context.find((p) => p.position_group === 'GK'));
    for (const candidate of starterContext.sort(() => r() - 0.5)) if (rankedStarters.length + selectedContext.length < 11 && !selectedContext.includes(candidate)) selectedContext.push(candidate);
    for (const p of rankedStarters) matchLineups.push({ match_id: match.match_id, team_id: teamId, player_id: p.player_id, player_scope: 'ranked', lineup_status: 'Starter',
      position: p.position_played, role: p.role_played, minutes: p.minutes, formation, data_origin: 'mixed', synthetic_fields: syntheticList('match_lineups.csv') });
    for (const p of selectedContext) matchLineups.push({ match_id: match.match_id, team_id: teamId, player_id: p.context_player_id, player_scope: 'context', lineup_status: 'Starter',
      position: p.position, role: roleFor[p.position], minutes: 90, formation, data_origin: 'mixed', synthetic_fields: syntheticList('match_lineups.csv') });
    const observedSubs = observed.filter((p) => !starterIds.has(p.player_id));
    for (const p of observedSubs) matchLineups.push({ match_id: match.match_id, team_id: teamId, player_id: p.player_id, player_scope: 'ranked', lineup_status: 'Substitute',
      position: p.position_played, role: p.role_played, minutes: p.minutes, formation, data_origin: 'mixed', synthetic_fields: syntheticList('match_lineups.csv') });
    const used = new Set(selectedContext.map((p) => p.context_player_id));
    const benchNeeded = Math.max(0, 7 - observedSubs.length);
    for (const p of context.filter((x) => !used.has(x.context_player_id)).slice(0, benchNeeded)) matchLineups.push({ match_id: match.match_id, team_id: teamId, player_id: p.context_player_id,
      player_scope: 'context', lineup_status: 'Unused', position: p.position, role: roleFor[p.position], minutes: 0, formation, data_origin: 'mixed', synthetic_fields: syntheticList('match_lineups.csv') });
  }
}

const lineupByMatchTeam = groupBy(matchLineups, (x) => `${x.match_id}|${x.team_id}`);
const shots = [];
const shotXg = (penalty, distance, angle, body, assist, pressure, fastBreak) => {
  if (penalty) return 0.78;
  let logit = -2.45 - 0.105 * (distance - 12) + 0.78 * angle;
  if (body === 'Head') logit -= 0.42;
  if (assist === 'Through ball') logit += 0.38;
  if (assist === 'Cross') logit -= 0.18;
  if (assist === 'Rebound') logit += 0.52;
  if (pressure) logit -= 0.3;
  if (fastBreak) logit += 0.22;
  return clamp(1 / (1 + Math.exp(-logit)), 0.005, 0.72);
};
let shotSequence = 0;
function makeShot({ match, teamId, playerId, scope, goal = false, onTarget = false, penalty = false, r }) {
  const distance = penalty ? 11 : round(clamp(5 + Math.pow(r(), 0.68) * 30, 3, 42), 1);
  const lateral = (r() - 0.5) * Math.min(50, distance * 1.35); const angle = round(clamp(1.9 - distance / 28 - Math.abs(lateral) / 60 + r() * 0.35, 0.08, 2.3), 3);
  const body = penalty ? pick(['Left foot', 'Right foot'], r) : pick(['Left foot', 'Right foot', 'Right foot', 'Head', 'Other'], r);
  const assist = penalty ? 'None' : pick(['None', 'Pass', 'Pass', 'Cross', 'Through ball', 'Set piece', 'Rebound'], r); const pressure = r() < 0.54; const fastBreak = r() < 0.13;
  const xg = round(shotXg(penalty, distance, angle, body, assist, pressure, fastBreak), 3);
  const outcome = goal ? 'Goal' : onTarget ? 'Saved' : pick(['Blocked', 'Off target', 'Off target', 'Woodwork'], r);
  const psxg = goal || onTarget ? round(clamp(xg * (0.85 + r() * 1.2), 0.01, 0.99), 3) : 0;
  shotSequence++;
  return { shot_id: `S${String(shotSequence).padStart(7, '0')}`, match_id: match.match_id, team_id: teamId, player_id: playerId, player_scope: scope,
    minute: 1 + Math.floor(r() * 90), second: Math.floor(r() * 60), x_location: round(120 - distance * (0.75 + r() * 0.18), 1), y_location: round(clamp(40 + lateral, 1, 79), 1),
    distance_m: distance, angle_rad: angle, body_part: body, assist_type: assist, under_pressure: pressure, fast_break: fastBreak, penalty,
    xg, post_shot_xg: psxg, outcome, data_origin: 'synthetic', synthetic_fields: syntheticList('shot_events.csv') };
}

for (const pm of playerMatches) {
  const match = matchById.get(pm.match_id); const r = rngFor(`shots:${pm.match_id}:${pm.player_id}`); const count = Number(pm.shots); const goals = Number(pm.goals); const onTarget = Number(pm.shots_on_target);
  const penalties = Math.min(goals, Number(pm.penalty_goals));
  for (let i = 0; i < count; i++) shots.push(makeShot({ match, teamId: pm.team_id, playerId: pm.player_id, scope: 'ranked', goal: i < goals, onTarget: i < onTarget, penalty: i < penalties, r }));
}

const rankedGoalsByTeamMatch = new Map();
const rankedAssistsByTeamMatch = new Map();
for (const pm of playerMatches) {
  const key = `${pm.match_id}|${pm.team_id}`;
  rankedGoalsByTeamMatch.set(key, (rankedGoalsByTeamMatch.get(key) || 0) + Number(pm.goals));
  rankedAssistsByTeamMatch.set(key, (rankedAssistsByTeamMatch.get(key) || 0) + Number(pm.assists));
}
for (const match of matches) {
  for (const [teamId, originalGoals] of [[match.home_team_id, Number(match.home_goals)], [match.away_team_id, Number(match.away_goals)]]) {
    const key = `${match.match_id}|${teamId}`; const r = rngFor(`context-shots:${key}`); const rankedGoals = rankedGoalsByTeamMatch.get(key) || 0; const rankedAssists = rankedAssistsByTeamMatch.get(key) || 0;
    const targetGoals = Math.max(originalGoals, rankedGoals, rankedAssists); const extraGoals = targetGoals - rankedGoals;
    const lineup = (lineupByMatchTeam.get(key) || []).filter((x) => x.player_scope === 'context' && x.lineup_status !== 'Unused');
    const shooters = lineup.filter((x) => ['FWD', 'MID'].includes((contextPlayers.find((p) => p.context_player_id === x.player_id) || {}).position_group));
    const eligible = shooters.length ? shooters : lineup;
    for (let i = 0; i < extraGoals; i++) { const shooter = pick(eligible, r); shots.push(makeShot({ match, teamId, playerId: shooter.player_id, scope: 'context', goal: true, onTarget: true, r })); }
    const currentShots = shots.filter((s) => s.match_id === match.match_id && s.team_id === teamId).length;
    const targetShots = clamp(7 + Math.floor(r() * 12) + targetGoals * 2, Math.max(targetGoals, currentShots), 32);
    for (let i = currentShots; i < targetShots; i++) { const shooter = pick(eligible, r); const onTarget = r() < 0.31; shots.push(makeShot({ match, teamId, playerId: shooter.player_id, scope: 'context', onTarget, r })); }
    if (teamId === match.home_team_id) match.home_goals = targetGoals; else match.away_goals = targetGoals;
  }
}

const shotsByTeamMatch = groupBy(shots, (s) => `${s.match_id}|${s.team_id}`);
const shotsByRankedAppearance = groupBy(shots.filter((s) => s.player_scope === 'ranked'), (s) => `${s.match_id}|${s.player_id}`);
for (const pm of playerMatches) {
  const own = shotsByRankedAppearance.get(`${pm.match_id}|${pm.player_id}`) || [];
  pm.non_penalty_xg = round(own.filter((s) => s.penalty !== true).reduce((a, s) => a + Number(s.xg), 0), 3);
}

const teamMatchStats = [];
for (const match of matches) {
  for (const [teamId, opponentId, homeAway] of [[match.home_team_id, match.away_team_id, 'H'], [match.away_team_id, match.home_team_id, 'A']]) {
    const r = rngFor(`team-stats:${match.match_id}:${teamId}`); const ownShots = shotsByTeamMatch.get(`${match.match_id}|${teamId}`) || []; const team = teamById.get(teamId);
    const xg = round(ownShots.reduce((a, s) => a + Number(s.xg), 0), 3); const goals = ownShots.filter((s) => s.outcome === 'Goal').length; const sot = ownShots.filter((s) => ['Goal', 'Saved'].includes(s.outcome)).length;
    const possession = Number(homeAway === 'H' ? match.home_possession : match.away_possession); const passA = Math.round(260 + possession * 5.2 + r() * 90); const passC = Math.round(passA * clamp(0.68 + possession / 300 + r() * 0.06, 0.65, 0.94));
    teamMatchStats.push({ match_id: match.match_id, team_id: teamId, opponent_id: opponentId, home_away: homeAway, goals, expected_goals: xg, shots: ownShots.length, shots_on_target: sot,
      possession, passes_attempted: passA, passes_completed: passC, progressive_passes: Math.round(20 + possession * 0.55 + r() * 18), final_third_entries: Math.round(18 + possession * 0.7 + r() * 20),
      penalty_area_entries: Math.round(7 + possession * 0.28 + r() * 10), high_turnovers: Math.round(3 + r() * 12), pressures: Math.round(95 + (100 - possession) * 1.45 + r() * 40),
      ppda: round(clamp(18 - (Number(team.elo_start) - 1400) / 100 + (r() - 0.5) * 5, 4, 30), 2), field_tilt: round(clamp(possession + (r() - 0.5) * 16, 15, 85), 1),
      corners: Math.round(r() * 8 + ownShots.length / 5), event_coverage_pct: 100, data_origin: 'synthetic', synthetic_fields: syntheticList('team_match_stats.csv') });
    if (homeAway === 'H') match.expected_home_goals = xg; else match.expected_away_goals = xg;
  }
}

// Recompute season aggregates affected by shot-level reconciliation from player-match rows.
const pmByPlayer = groupBy(playerMatches, (p) => p.player_id);
const recompute = ['minutes', 'goals', 'assists', 'non_penalty_xg', 'expected_assists', 'shots', 'shots_on_target', 'key_passes', 'touches_in_box', 'passes_attempted', 'passes_completed', 'progressive_passes', 'passes_into_final_third', 'passes_into_penalty_area', 'progressive_carries', 'successful_dribbles', 'attempted_dribbles', 'dispossessed', 'miscontrols', 'tackles_attempted', 'tackles_won', 'interceptions', 'blocks', 'clearances', 'recoveries', 'pressures', 'successful_pressures', 'aerial_duels_attempted', 'aerial_duels_won', 'fouls_committed', 'fouls_won', 'yellow_cards', 'red_cards'];
for (const season of seasonStats) {
  const rows = pmByPlayer.get(season.player_id) || [];
  for (const field of recompute) season[field] = round(rows.reduce((a, x) => a + Number(x[field] || 0), 0), 3);
  season.appearances = rows.length; season.starts = rows.filter((x) => x.starter === 'true').length;
}

const positionMinutes = [];
for (const [playerId, rows] of pmByPlayer) {
  const total = rows.reduce((a, x) => a + Number(x.minutes), 0); const groups = groupBy(rows, (x) => `${x.position_played}|${x.role_played}`);
  for (const [key, part] of groups) { const [position, role] = key.split('|'); const minutes = part.reduce((a, x) => a + Number(x.minutes), 0);
    positionMinutes.push({ player_id: playerId, season: SEASON, position, role, minutes, appearances: part.length, minute_share: round(minutes / total, 4), data_origin: 'mixed', synthetic_fields: syntheticList('position_minutes.csv') }); }
}

const physicalStats = players.map((p) => {
  const r = rngFor(`physical:${p.player_id}`); const season = seasonStats.find((s) => s.player_id === p.player_id); const group = p.position_group;
  const speedBase = group === 'FWD' ? 34 : group === 'DEF' ? 33 : group === 'MID' ? 32.5 : 29; const distanceBase = group === 'MID' ? 11.2 : group === 'FWD' ? 10.4 : group === 'DEF' ? 10.1 : 6.8;
  return { player_id: p.player_id, season: SEASON, minutes: season.minutes, top_speed_kmh: round(clamp(speedBase + (r() - 0.5) * 5, 23, 38), 1), distance_per90_km: round(clamp(distanceBase + (r() - 0.5) * 2, 6, 13.2), 2),
    high_speed_distance_per90_m: round(clamp((group === 'FWD' ? 780 : group === 'DEF' ? 650 : 610) + (r() - 0.5) * 320, 120, 1200), 1),
    sprint_distance_per90_m: round(clamp((group === 'FWD' ? 360 : group === 'DEF' ? 280 : 230) + (r() - 0.5) * 180, 40, 700), 1),
    sprints_per90: round(clamp((group === 'FWD' ? 24 : 17) + (r() - 0.5) * 10, 4, 45), 1), accelerations_per90: round(28 + r() * 24, 1), decelerations_per90: round(25 + r() * 25, 1),
    repeat_sprint_score: round(45 + r() * 45, 1), workload_coverage_pct: 100, data_origin: 'mixed', synthetic_fields: syntheticList('physical_stats.csv') };
});

for (const p of players) {
  for (const [name, real, synthetic] of [['position_minutes.csv', 3, 3], ['physical_stats.csv', 3, 8]]) quality.push({ entity_type: 'player', entity_id: p.player_id, dataset_name: name,
    coverage_percentage: 100, real_field_count: real, synthetic_field_count: synthetic, quality_flag: 'Synthetic', missing_fields: '', notes: 'Deterministic development-only enrichment.', data_origin: 'metadata' });
}

writeCSV('context_players.csv', contextPlayers);
writeCSV('match_lineups.csv', matchLineups);
writeCSV('shot_events.csv', shots);
writeCSV('team_match_stats.csv', teamMatchStats);
writeCSV('position_minutes.csv', positionMinutes);
writeCSV('physical_stats.csv', physicalStats);
writeCSV('matches.csv', matches);
writeCSV('player_matches.csv', playerMatches);
writeCSV('player_season_stats.csv', seasonStats);
writeCSV('data_quality.csv', quality);

const manifest = JSON.parse(readFileSync(join(DATA, 'dataset_manifest.json'), 'utf8'));
const newFiles = { 'context_players.csv': contextPlayers, 'match_lineups.csv': matchLineups, 'shot_events.csv': shots, 'team_match_stats.csv': teamMatchStats, 'position_minutes.csv': positionMinutes, 'physical_stats.csv': physicalStats };
for (const [name, rows] of Object.entries(newFiles)) manifest.files[name] = { rows: rows.length, path: name };
for (const [name, rows] of Object.entries({ 'matches.csv': matches, 'player_matches.csv': playerMatches, 'player_season_stats.csv': seasonStats, 'data_quality.csv': quality })) manifest.files[name] = { rows: rows.length, path: name };
manifest.engine_status = 'Canonical engine-ready dataset; current application ranking engine remains unchanged.';
manifest.reconciliation = 'Match goals equal goal shot events; match xG equals summed shot xG; player season totals equal summed player-match records; position minutes equal season minutes.';
writeFileSync(join(DATA, 'dataset_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(DATA, 'schemas', 'dataset.schema.json'), JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: 'Scoutee canonical dataset', version: manifest.dataset_version, files: SCHEMAS }, null, 2) + '\n');

console.log('Generated engine-ready canonical context');
for (const [name, rows] of Object.entries(newFiles)) console.log(`${name.padEnd(28)} ${rows.length}`);

