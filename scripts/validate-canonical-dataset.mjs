import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DATASET_VERSION, SCHEMAS } from './dataset-schema.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DATA = join(ROOT, 'server', 'data', 'canonical');
const errors = [];
const warnings = [];

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
  return { header, rows: rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}

const parsed = {};
for (const [name, schema] of Object.entries(SCHEMAS)) {
  const path = join(DATA, name);
  if (!existsSync(path)) { errors.push(`${name}: file is missing`); continue; }
  const { header, rows } = parseCSV(readFileSync(path, 'utf8'));
  parsed[name] = rows;
  const expected = Object.keys(schema.columns);
  if (header.join('|') !== expected.join('|')) errors.push(`${name}: header does not match schema`);
  const seen = new Set();
  rows.forEach((row, index) => {
    const line = index + 2;
    const key = schema.primaryKey.map((k) => row[k]).join('|');
    if (!key || key.includes('undefined')) errors.push(`${name}:${line}: incomplete primary key`);
    if (seen.has(key)) errors.push(`${name}:${line}: duplicate primary key ${key}`);
    seen.add(key);
    for (const [column, rule] of Object.entries(schema.columns)) {
      const value = row[column];
      if (rule.required && String(value ?? '').trim() === '') errors.push(`${name}:${line}: ${column} is required`);
      if (value === '' || value == null) continue;
      if (rule.type === 'integer' && (!Number.isInteger(Number(value)) || !Number.isFinite(Number(value)))) errors.push(`${name}:${line}: ${column} is not an integer`);
      if (rule.type === 'number' && !Number.isFinite(Number(value))) errors.push(`${name}:${line}: ${column} is not numeric`);
      if (['integer', 'number'].includes(rule.type) && Number.isFinite(Number(value))) {
        if (rule.min != null && Number(value) < rule.min) errors.push(`${name}:${line}: ${column} below ${rule.min}`);
        if (rule.max != null && Number(value) > rule.max) errors.push(`${name}:${line}: ${column} above ${rule.max}`);
      }
      if (rule.type === 'boolean' && !['true', 'false'].includes(String(value))) errors.push(`${name}:${line}: ${column} is not boolean`);
      if (rule.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) errors.push(`${name}:${line}: ${column} is not YYYY-MM-DD`);
      if (rule.type === 'enum' && !rule.values.includes(String(value))) errors.push(`${name}:${line}: ${column} has invalid value ${value}`);
    }
    const syntheticColumns = Object.entries(schema.columns).filter(([, rule]) => rule.origin === 'synthetic').map(([k]) => k);
    if (syntheticColumns.length && !row.synthetic_fields) errors.push(`${name}:${line}: synthetic_fields label is missing`);
    if (row.synthetic_fields) {
      const labels = new Set(row.synthetic_fields.split(';'));
      for (const column of syntheticColumns) if (!labels.has(column)) errors.push(`${name}:${line}: synthetic field ${column} is not labeled`);
    }
  });
}

const ids = (file, column) => new Set((parsed[file] || []).map((r) => r[column]));
const playerIds = ids('players.csv', 'player_id');
const teamIds = ids('teams.csv', 'team_id');
const matchIds = ids('matches.csv', 'match_id');
const contextPlayerIds = ids('context_players.csv', 'context_player_id');
const allFootballerIds = new Set([...playerIds, ...contextPlayerIds]);
const checkRef = (file, column, allowed) => {
  for (const [i, row] of (parsed[file] || []).entries()) if (row[column] && !allowed.has(row[column])) errors.push(`${file}:${i + 2}: unknown ${column} ${row[column]}`);
};
for (const file of ['player_matches.csv', 'player_season_stats.csv', 'goalkeeper_stats.csv', 'availability.csv', 'contracts.csv']) checkRef(file, 'player_id', playerIds);
for (const file of ['player_matches.csv', 'player_season_stats.csv', 'goalkeeper_stats.csv', 'contracts.csv']) checkRef(file, 'team_id', teamIds);
checkRef('player_matches.csv', 'opponent_id', teamIds);
checkRef('player_matches.csv', 'match_id', matchIds);
checkRef('matches.csv', 'home_team_id', teamIds);
checkRef('matches.csv', 'away_team_id', teamIds);
checkRef('context_players.csv', 'team_id', teamIds);
for (const file of ['match_lineups.csv', 'shot_events.csv', 'team_match_stats.csv']) checkRef(file, 'match_id', matchIds);
for (const file of ['match_lineups.csv', 'shot_events.csv', 'team_match_stats.csv']) checkRef(file, 'team_id', teamIds);
checkRef('team_match_stats.csv', 'opponent_id', teamIds);
for (const file of ['position_minutes.csv', 'physical_stats.csv']) checkRef(file, 'player_id', playerIds);
for (const [i, row] of (parsed['match_lineups.csv'] || []).entries()) if (!allFootballerIds.has(row.player_id)) errors.push(`match_lineups.csv:${i + 2}: unknown player_id ${row.player_id}`);
for (const [i, row] of (parsed['shot_events.csv'] || []).entries()) if (!allFootballerIds.has(row.player_id)) errors.push(`shot_events.csv:${i + 2}: unknown player_id ${row.player_id}`);

for (const [i, row] of (parsed['matches.csv'] || []).entries()) {
  if (row.home_team_id === row.away_team_id) errors.push(`matches.csv:${i + 2}: team plays itself`);
  if (Math.abs(Number(row.home_possession) + Number(row.away_possession) - 100) > 0.2) errors.push(`matches.csv:${i + 2}: possession does not total 100`);
}
for (const [i, row] of (parsed['player_matches.csv'] || []).entries()) {
  const line = i + 2;
  if (Number(row.passes_completed) > Number(row.passes_attempted)) errors.push(`player_matches.csv:${line}: completed passes exceed attempts`);
  if (Number(row.shots_on_target) > Number(row.shots)) errors.push(`player_matches.csv:${line}: shots on target exceed shots`);
  if (Number(row.successful_dribbles) > Number(row.attempted_dribbles)) errors.push(`player_matches.csv:${line}: successful dribbles exceed attempts`);
  if (Number(row.tackles_won) > Number(row.tackles_attempted)) errors.push(`player_matches.csv:${line}: tackles won exceed attempts`);
  if (Number(row.aerial_duels_won) > Number(row.aerial_duels_attempted)) errors.push(`player_matches.csv:${line}: aerial duels won exceed attempts`);
  if (Number(row.score_state_minutes_winning) + Number(row.score_state_minutes_drawing) + Number(row.score_state_minutes_losing) !== Number(row.minutes)) errors.push(`player_matches.csv:${line}: score-state minutes do not total minutes`);
}

const groupRows = (rows, keyFn) => {
  const out = new Map();
  for (const row of rows) { const key = keyFn(row); if (!out.has(key)) out.set(key, []); out.get(key).push(row); }
  return out;
};
const lineupsByTeamMatch = groupRows(parsed['match_lineups.csv'] || [], (r) => `${r.match_id}|${r.team_id}`);
const lineupIndex = new Map((parsed['match_lineups.csv'] || []).map((r) => [`${r.match_id}|${r.team_id}|${r.player_id}`, r]));
for (const [key, rows] of lineupsByTeamMatch) {
  if (rows.length !== 18) errors.push(`match_lineups.csv: ${key} has ${rows.length} team-sheet players, expected 18`);
  if (rows.filter((r) => r.lineup_status === 'Starter').length !== 11) errors.push(`match_lineups.csv: ${key} does not have exactly 11 starters`);
}
if (lineupsByTeamMatch.size !== (parsed['matches.csv'] || []).length * 2) errors.push('match_lineups.csv: every match must have two complete team sheets');
for (const [i, pm] of (parsed['player_matches.csv'] || []).entries()) {
  const lineup = lineupIndex.get(`${pm.match_id}|${pm.team_id}|${pm.player_id}`);
  if (!lineup) errors.push(`player_matches.csv:${i + 2}: appearance is missing from match_lineups.csv`);
  else if (Number(lineup.minutes) !== Number(pm.minutes)) errors.push(`player_matches.csv:${i + 2}: lineup minutes disagree`);
}

const shotsByTeamMatch = groupRows(parsed['shot_events.csv'] || [], (r) => `${r.match_id}|${r.team_id}`);
const shotsByPlayerMatch = groupRows((parsed['shot_events.csv'] || []).filter((r) => r.player_scope === 'ranked'), (r) => `${r.match_id}|${r.player_id}`);
for (const [i, shot] of (parsed['shot_events.csv'] || []).entries()) {
  const lineup = lineupIndex.get(`${shot.match_id}|${shot.team_id}|${shot.player_id}`);
  if (!lineup) errors.push(`shot_events.csv:${i + 2}: shooter is absent from team sheet`);
  else if (lineup.lineup_status === 'Unused') errors.push(`shot_events.csv:${i + 2}: unused substitute recorded a shot`);
}
for (const [i, pm] of (parsed['player_matches.csv'] || []).entries()) {
  const own = shotsByPlayerMatch.get(`${pm.match_id}|${pm.player_id}`) || [];
  const goals = own.filter((s) => s.outcome === 'Goal').length;
  const onTarget = own.filter((s) => ['Goal', 'Saved'].includes(s.outcome)).length;
  const npxg = own.filter((s) => s.penalty !== 'true').reduce((a, s) => a + Number(s.xg), 0);
  if (own.length !== Number(pm.shots)) errors.push(`player_matches.csv:${i + 2}: shots disagree with shot_events.csv`);
  if (goals !== Number(pm.goals)) errors.push(`player_matches.csv:${i + 2}: goals disagree with shot_events.csv`);
  if (onTarget !== Number(pm.shots_on_target)) errors.push(`player_matches.csv:${i + 2}: shots on target disagree with shot_events.csv`);
  if (Math.abs(npxg - Number(pm.non_penalty_xg)) > 0.002) errors.push(`player_matches.csv:${i + 2}: non-penalty xG disagrees with shot_events.csv`);
}

const teamStatsIndex = new Map((parsed['team_match_stats.csv'] || []).map((r) => [`${r.match_id}|${r.team_id}`, r]));
for (const [i, match] of (parsed['matches.csv'] || []).entries()) {
  for (const [teamId, goalField, xgField] of [[match.home_team_id, 'home_goals', 'expected_home_goals'], [match.away_team_id, 'away_goals', 'expected_away_goals']]) {
    const key = `${match.match_id}|${teamId}`; const own = shotsByTeamMatch.get(key) || []; const goals = own.filter((s) => s.outcome === 'Goal').length;
    const onTarget = own.filter((s) => ['Goal', 'Saved'].includes(s.outcome)).length; const xg = own.reduce((a, s) => a + Number(s.xg), 0); const stat = teamStatsIndex.get(key);
    if (goals !== Number(match[goalField])) errors.push(`matches.csv:${i + 2}: ${goalField} disagrees with goal shot events`);
    if (Math.abs(xg - Number(match[xgField])) > 0.002) errors.push(`matches.csv:${i + 2}: ${xgField} disagrees with shot xG`);
    if (!stat) errors.push(`team_match_stats.csv: missing ${key}`);
    else {
      if (Number(stat.goals) !== goals || Number(stat.shots) !== own.length || Number(stat.shots_on_target) !== onTarget) errors.push(`team_match_stats.csv: event totals disagree for ${key}`);
      if (Math.abs(Number(stat.expected_goals) - xg) > 0.002) errors.push(`team_match_stats.csv: xG disagrees for ${key}`);
    }
  }
}
if (teamStatsIndex.size !== (parsed['matches.csv'] || []).length * 2) errors.push('team_match_stats.csv: every match must have two team rows');

const playerMatchesByPlayer = groupRows(parsed['player_matches.csv'] || [], (r) => r.player_id);
const additiveSeasonFields = ['minutes', 'goals', 'assists', 'non_penalty_xg', 'expected_assists', 'shots', 'shots_on_target', 'key_passes', 'touches_in_box', 'passes_attempted', 'passes_completed', 'progressive_passes', 'passes_into_final_third', 'passes_into_penalty_area', 'progressive_carries', 'successful_dribbles', 'attempted_dribbles', 'dispossessed', 'miscontrols', 'tackles_attempted', 'tackles_won', 'interceptions', 'blocks', 'clearances', 'recoveries', 'pressures', 'successful_pressures', 'aerial_duels_attempted', 'aerial_duels_won', 'fouls_committed', 'fouls_won', 'yellow_cards', 'red_cards'];
for (const [i, season] of (parsed['player_season_stats.csv'] || []).entries()) {
  const rows = playerMatchesByPlayer.get(season.player_id) || [];
  if (rows.length !== Number(season.appearances)) errors.push(`player_season_stats.csv:${i + 2}: appearances do not reconcile`);
  for (const field of additiveSeasonFields) {
    const total = rows.reduce((a, r) => a + Number(r[field] || 0), 0);
    if (Math.abs(total - Number(season[field])) > 0.002) errors.push(`player_season_stats.csv:${i + 2}: ${field} does not reconcile`);
  }
}
const positionByPlayer = groupRows(parsed['position_minutes.csv'] || [], (r) => r.player_id);
for (const season of parsed['player_season_stats.csv'] || []) {
  const parts = positionByPlayer.get(season.player_id) || []; const minutes = parts.reduce((a, r) => a + Number(r.minutes), 0); const share = parts.reduce((a, r) => a + Number(r.minute_share), 0);
  if (minutes !== Number(season.minutes)) errors.push(`position_minutes.csv: ${season.player_id} minutes do not equal season minutes`);
  if (Math.abs(share - 1) > 0.001 * Math.max(1, parts.length)) errors.push(`position_minutes.csv: ${season.player_id} minute shares do not total 1`);
}
if ((parsed['physical_stats.csv'] || []).length !== playerIds.size) errors.push('physical_stats.csv: expected one row per ranked player');

const originalPath = join(ROOT, 'server', 'data', 'hidden_talent_2025_26.csv');
if (existsSync(originalPath)) {
  const original = parseCSV(readFileSync(originalPath, 'utf8')).rows;
  if (original.length !== playerIds.size) errors.push(`players.csv: expected ${original.length} existing players, found ${playerIds.size}`);
  const seasonById = new Map((parsed['player_season_stats.csv'] || []).map((r) => [r.player_id, r]));
  for (const source of original) {
    const generated = seasonById.get(source.player_id);
    if (!generated) { errors.push(`player_season_stats.csv: missing player ${source.player_id}`); continue; }
    for (const field of ['minutes', 'goals', 'assists']) if (Number(generated[field]) !== Number(source[field])) errors.push(`player_season_stats.csv: ${source.player_id} changed source ${field}`);
  }
}

const manifestPath = join(DATA, 'dataset_manifest.json');
if (!existsSync(manifestPath)) errors.push('dataset_manifest.json is missing');
else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.dataset_version !== DATASET_VERSION) errors.push('manifest dataset version does not match schema');
  if (!String(manifest.synthetic_data_warning || '').toLowerCase().includes('synthetic')) errors.push('manifest synthetic warning is missing');
  for (const [name, detail] of Object.entries(manifest.files || {})) if ((parsed[name] || []).length !== detail.rows) errors.push(`manifest row count for ${name} is incorrect`);
}

if ((parsed['goalkeeper_stats.csv'] || []).length < 20) warnings.push('Very small goalkeeper sample remains; use role-specific uncertainty.');

console.log(`Canonical dataset validation: ${errors.length ? 'FAILED' : 'PASSED'}`);
console.log(`Players: ${(parsed['players.csv'] || []).length}; matches: ${(parsed['matches.csv'] || []).length}; player-match rows: ${(parsed['player_matches.csv'] || []).length}`);
for (const warning of warnings) console.log(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors.slice(0, 100)) console.error(`ERROR: ${error}`);
  if (errors.length > 100) console.error(`ERROR: ${errors.length - 100} more errors omitted`);
  process.exit(1);
}

