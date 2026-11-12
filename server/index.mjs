// Scoutee server: login, role-based data, and the web app.
//   node server/index.mjs --dev   development (Vite with hot reload)
//   node server/index.mjs         production (serves dist/ after `npm run build`)
import http from 'node:http';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cookieHeader, login, readCookie, verify } from './auth.mjs';
import { filterForRole, ROLES } from '../src/auth/roles.js';
import { parseCSV, parseEngineJSON, validate } from '../src/engine/pool.js';

const DEV = process.argv.includes('--dev');
const PORT = Number(process.env.PORT || 5191);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(ROOT, 'server', 'data');
const FILES = { json: join(DATA, 'data.json'), csv: join(DATA, 'hidden_talent_2025_26.csv'), nat: join(DATA, 'nationality_2025_26.csv') };

/* ---------- data, cached until the files change ---------- */
let cache = null;
function loadData() {
  const stamp = Object.values(FILES).map((f) => (existsSync(f) ? statSync(f).mtimeMs : 0)).join('|');
  if (cache?.stamp === stamp) return cache;
  const json = parseEngineJSON(readFileSync(FILES.json, 'utf8'));
  const rows = parseCSV(readFileSync(FILES.csv, 'utf8'));
  const nat = existsSync(FILES.nat) ? Object.fromEntries(parseCSV(readFileSync(FILES.nat, 'utf8')).map((r) => [r.player_id, r.country_of_citizenship])) : {};
  cache = { stamp, json, rows, nat, updated: statSync(FILES.json).mtime.toISOString() };
  return cache;
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
    const out = filterForRole(user.role, d.json, d.rows);
    return send(res, 200, { ...out, nationality: d.nat, updated: d.updated });
  }

  if (url.pathname === '/api/dataset' && req.method === 'POST') {
    if (!ROLES[user.role].canUpload) return send(res, 403, { error: 'Your role cannot replace the data.' });
    if (!isJson(req)) return send(res, 415, { error: 'JSON expected' });
    try {
      const body = JSON.parse(await readBody(req));
      const json = parseEngineJSON(String(body.json || ''));
      const rows = parseCSV(String(body.csv || ''));
      const err = validate(json, rows);
      if (err) return send(res, 422, { error: err });
      const backup = join(DATA, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
      mkdirSync(backup, { recursive: true });
      copyFileSync(FILES.json, join(backup, 'data.json'));
      copyFileSync(FILES.csv, join(backup, 'hidden_talent_2025_26.csv'));
      writeFileSync(FILES.json, String(body.json));
      writeFileSync(FILES.csv, String(body.csv));
      return send(res, 200, { ok: true, players: json.players.length });
    } catch (e) {
      return send(res, 400, { error: `Could not read the files: ${e.message}` });
    }
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
