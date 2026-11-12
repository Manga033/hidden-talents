// Password hashing (scrypt) and signed session cookies (HMAC-SHA256). Node built-ins only.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROLES } from '../src/auth/roles.js';

const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
const USERS = dir('./users.json');
const DEMO = dir('./demo-users.json');
const SECRET_FILE = dir('./.session-secret');
export const COOKIE = 'ht_session';
const TTL_MS = 8 * 60 * 60 * 1000; // one working day

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function checkPassword(password, user) {
  const a = Buffer.from(scryptSync(password, user.salt, 64).toString('hex'), 'hex');
  const b = Buffer.from(user.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// users.json holds only hashes. On the first start it is created from demo-users.json.
export function loadUsers() {
  if (!existsSync(USERS)) {
    const demo = existsSync(DEMO) ? JSON.parse(readFileSync(DEMO, 'utf8')) : [];
    const users = demo.map((u) => ({ username: u.username, name: u.name, role: u.role, ...hashPassword(u.password) }));
    writeFileSync(USERS, JSON.stringify(users, null, 2));
  }
  return JSON.parse(readFileSync(USERS, 'utf8')).filter((u) => ROLES[u.role]);
}
export function saveUsers(users) {
  writeFileSync(USERS, JSON.stringify(users, null, 2));
}

const secret = (() => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (!existsSync(SECRET_FILE)) writeFileSync(SECRET_FILE, randomBytes(32).toString('hex'));
  return readFileSync(SECRET_FILE, 'utf8').trim();
})();

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => createHmac('sha256', secret).update(data).digest('base64url');

export function login(username, password) {
  const user = loadUsers().find((u) => u.username === String(username || '').trim().toLowerCase());
  if (!user || !checkPassword(String(password || ''), user)) return null;
  const payload = b64(JSON.stringify({ u: user.username, n: user.name, r: user.role, exp: Date.now() + TTL_MS }));
  return { token: `${payload}.${sign(payload)}`, user: { username: user.username, name: user.name, role: user.role } };
}

export function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = sign(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!s.exp || s.exp < Date.now() || !ROLES[s.r]) return null;
    // The account must still exist with the same role.
    const u = loadUsers().find((x) => x.username === s.u);
    if (!u || u.role !== s.r) return null;
    return { username: u.username, name: u.name, role: u.role };
  } catch {
    return null;
  }
}

export function cookieHeader(token, secure) {
  const base = `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`;
  return token ? `${base}; Max-Age=${TTL_MS / 1000}${secure ? '; Secure' : ''}` : `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}
export function readCookie(req) {
  const c = req.headers.cookie || '';
  const m = c.split(';').map((x) => x.trim()).find((x) => x.startsWith(`${COOKIE}=`));
  return m ? m.slice(COOKIE.length + 1) : null;
}
