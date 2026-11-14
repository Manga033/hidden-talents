// Scoutee server: login, role-based data, and the web app.
//   node server/index.mjs --dev   development (Vite with hot reload)
//   node server/index.mjs         production (serves dist/ after `npm run build`)
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieHeader, login, readCookie, verify } from './auth.mjs';
import { ROLES } from '../src/auth/roles.js';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT || 5191);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'server', 'data');
const CANONICAL = join(DATA, 'canonical');
const MODEL = join(DATA, 'model-v3');
const FILES = {
  model: join(MODEL, 'engine_v3.json'), players: join(CANONICAL, 'players.csv'), season: join(CANONICAL, 'player_season_stats.csv'),
  contracts: join(CANONICAL, 'contracts.csv'), manifest: join(CANONICAL, 'dataset_manifest.json'),
};

function parseCSV(text) {
  const rows = []; let row = [], field = '', quoted = false;
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

/* ---------- data, cached until the files change ---------- */
let cache = null;
function loadData() {
  const stamp = Object.values(FILES).map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0)).join('|');
  if (cache?.stamp === stamp) return cache;
  for (const file of Object.values(FILES)) if (!existsSync(file)) throw new Error(`Required v3 data file is missing: ${file}`);
  const model = JSON.parse(readFileSync(FILES.model, 'utf8'));
  const profile = new Map(parseCSV(readFileSync(FILES.players, 'utf8')).map((r) => [r.player_id, r]));
  const season = new Map(parseCSV(readFileSync(FILES.season, 'utf8')).map((r) => [r.player_id, r]));
  const contracts = new Map(parseCSV(readFileSync(FILES.contracts, 'utf8')).map((r) => [r.player_id, r]));
  const manifest = JSON.parse(readFileSync(FILES.manifest, 'utf8'));
  const players = model.players.map((p) => {
    const q = profile.get(p.playerId) || {}; const s = season.get(p.playerId) || {}; const c = contracts.get(p.playerId) || {};
    const contractEnd = c.contract_end || null;
    const plannedRelease = !!contractEnd && contractEnd >= '2026-07-01' && contractEnd <= '2027-06-30';
    return { ...p, profile: { birthDate: q.date_of_birth || null, nationality: q.nationality || null, countryOfBirth: q.country_of_birth || null,
      heightCm: Number(q.height_cm) || null, weightKg: Number(q.weight_kg) || null, preferredFoot: q.preferred_foot || 'Unknown', weakFootRating: Number(q.weak_foot_rating) || null,
      secondaryRole: q.secondary_role || null, academy: q.academy || null, youthInternationalLevel: q.youth_international_level || null },
      seasonStats: { appearances: Number(s.appearances) || 0, starts: Number(s.starts) || 0, minutes: Number(s.minutes) || 0, goals: Number(s.goals) || 0, assists: Number(s.assists) || 0,
        nonPenaltyXg: Number(s.non_penalty_xg) || 0, expectedAssists: Number(s.expected_assists) || 0, shots: Number(s.shots) || 0, passesCompleted: Number(s.passes_completed) || 0,
        progressivePasses: Number(s.progressive_passes) || 0, progressiveCarries: Number(s.progressive_carries) || 0, tacklesWon: Number(s.tackles_won) || 0,
        interceptions: Number(s.interceptions) || 0, aerialDuelsWon: Number(s.aerial_duels_won) || 0 },
      recruitment: { marketValueEur: Number(c.estimated_transfer_value_eur) || null, estimatedWageEurYear: Number(c.estimated_wage_eur_year) || null,
        releaseClauseEur: Number(c.release_clause_eur) || null, contractEnd, loanStatus: c.loan_status || null, agent: c.agent || null,
        homegrownStatus: c.homegrown_status || null, workPermitRisk: c.work_permit_risk || null, plannedRelease } };
  });
  cache = { stamp, meta: { ...model.meta, datasetManifest: manifest.dataset_version }, summary: model.summary, players, updated: statSync(FILES.model).mtime.toISOString() };
  return cache;
}

function filterForRole(role, data) {
  const permissions = ROLES[role];
  if (!permissions) return null;
  const players = data.players.map((p) => {
    const q = structuredClone(p);
    if (!permissions.see.marketValue) { q.recruitment.marketValueEur = null; q.recruitment.estimatedWageEurYear = null; q.recruitment.releaseClauseEur = null; }
    if (!permissions.see.contracts) q.recruitment = { ...q.recruitment, contractEnd: null, loanStatus: null, agent: null, homegrownStatus: null, workPermitRisk: null, plannedRelease: false };
    return q;
  });
  return { meta: data.meta, summary: data.summary, players, updated: data.updated };
}

/* ---------- small helpers ---------- */
const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};
function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const isJson = (req) => String(req.headers['content-type'] || '').startsWith('application/json');

// Simple brute-force protection: 8 failed logins per IP per 10 minutes.
const fails = new Map();
const tooMany = (ip) => {
  const f = fails.get(ip);
  return f && f.n >= 8 && Date.now() - f.t < 10 * 60 * 1000;
};
const failed = (ip) => {
  const f = fails.get(ip);
  fails.set(ip, f && Date.now() - f.t < 10 * 60 * 1000 ? { n: f.n + 1, t: f.t } : { n: 1, t: Date.now() });
};

/* ---------- API ---------- */
async function api(req, res) {
  const url = new URL(req.url, 'http://x');
  const secure = req.headers['x-forwarded-proto'] === 'https';
  const user = verify(readCookie(req));
  const ip = req.socket.remoteAddress;

  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (!isJson(req)) return send(res, 415, { error: 'JSON expected' });
    if (tooMany(ip)) return send(res, 429, { error: 'Too many attempts. Try again in a few minutes.' });
    let body = {};
    try {
      body = JSON.parse(await readBody(req, 10_000));
    } catch {
      return send(res, 400, { error: 'Bad request' });
    }
    const out = login(body.username, body.password);
    if (!out) {
      failed(ip);
      return send(res, 401, { error: 'Wrong username or password.' });
    }
    fails.delete(ip);
    return send(res, 200, { user: out.user }, { 'Set-Cookie': cookieHeader(out.token, secure) });
  }
  if (url.pathname === '/api/logout' && req.method === 'POST') return send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(null) });

  // "Am I signed in?" is answered without an error status, so the sign-in page loads quietly.
  if (url.pathname === '/api/me' && req.method === 'GET') return send(res, 200, { user: user || null });

  if (!user) return send(res, 401, { error: 'Please sign in.' });

  if (url.pathname === '/api/data' && req.method === 'GET') {
    const d = loadData();
    return send(res, 200, filterForRole(user.role, d));
  }
  return send(res, 404, { error: 'Not found' });
}

/* ---------- web app ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};
function serveStatic(req, res) {
  const dist = join(ROOT, 'dist');
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(dist, path));
  if (!file.startsWith(dist)) return send(res, 403, { error: 'Forbidden' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  if (!existsSync(file)) return send(res, 500, { error: 'Run `npm run build` first.' });
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', ...SECURITY, 'Cache-Control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable' });
  res.end(readFileSync(file));
}

let vite = null;
if (DEV) {
  const { createServer } = await import('vite');
  vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      api(req, res).catch((e) => send(res, 500, { error: e.message }));
      return;
    }
    if (vite) vite.middlewares(req, res);
    else serveStatic(req, res);
  })
  .listen(PORT, () => console.log(`Scoutee ${DEV ? '(dev)' : ''} on http://localhost:${PORT}`));
