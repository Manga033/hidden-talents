import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ROLES, canOpen, canSee } from './auth/roles.js';

const Ctx = createContext(null);
export const useScout = () => useContext(Ctx);
export const MAX_COMPARE = 4;
const read = (k, f) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* optional local state */ } };
const ROUTES = ['home', 'players', 'find', 'compare', 'hidden', 'insights', 'favourites'];
function parseHash() { let h = ''; try { h = decodeURIComponent(window.location.hash.replace(/^#/, '')); } catch { /* no address bar */ } const [page, id] = h.split('/'); if (page === 'player' && id) return { page, id }; return { page: ROUTES.includes(page) ? page : 'home' }; }
async function api(path, opts = {}) { const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts }); const body = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(body.error || `Request failed (${r.status})`); e.status = r.status; throw e; } return body; }
const ageQuarter = (d) => { const m = Number(String(d || '').slice(5, 7)); return m ? `Q${Math.ceil(m / 3)}` : 'Unknown'; };

// The only UI adapter for model v3. Pages consume these copied authoritative ranks;
// they never calculate or re-rank players independently.
function normalizePlayer(p, i) {
  const s = p.seasonStats || {}; const q = p.profile || {}; const r = p.recruitment || {};
  const hidden = !!p.flags?.hiddenTalent; const early = !!p.flags?.pricedAboveOutput; const scout = !!p.flags?.watchLive;
  return {
    ...p, i, id: `P${p.playerId}`, pid: p.playerId, grp: p.positionGroup,
    fairRank: p.positionRank, posRank: p.positionRank, rawRank: p.traditionalPositionRank, rawPosRank: p.traditionalPositionRank,
    fairScore: p.score, rawScore: p.traditionalScore, rankChange: p.traditionalPositionRank - p.positionRank,
    rankLow: p.confidence.positionRankLow, rankHigh: p.confidence.positionRankHigh, conf: p.confidence.level, confValue: p.confidence.value,
    hidden, early, scout, tags: [hidden && 'Hidden Talent', early && 'Priced above output', scout && 'Watch Live'].filter(Boolean),
    country: q.nationality, foot: q.preferredFoot, heightCm: q.heightCm, weightKg: q.weightKg, ageShown: Math.floor(p.age),
    birthDate: q.birthDate, birthQuarter: ageQuarter(q.birthDate), bq: Number(ageQuarter(q.birthDate).slice(1)) || 0, apps: s.appearances, starts: s.starts,
    goals: s.goals, assists: s.assists, ga: (s.goals || 0) + (s.assists || 0), minutes: s.minutes || p.minutes, npxg: s.nonPenaltyXg, xA: s.expectedAssists,
    teamElo: p.context.teamElo, valueEnd: r.marketValueEur, contractEnd: r.contractEnd,
    plannedRelease: r.plannedRelease, releaseWarning: r.plannedRelease, bestRole: p.bestRoleModel,
  };
}

export function ScoutProvider({ children }) {
  const [user, setUser] = useState(undefined); const [data, setData] = useState(null); const [error, setError] = useState(null);
  useEffect(() => { api('/api/me').then((b) => setUser(b.user || null)).catch(() => setUser(null)); }, []);
  const signIn = async (username, password) => { const b = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }); setUser(b.user); };
  const signOut = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); setUser(null); setData(null); };
  const role = user?.role; const can = useCallback((what) => canSee(role, what), [role]); const allowed = useCallback((page) => canOpen(role, page), [role]);
  const loadData = useCallback(() => { setError(null); api('/api/data').then(setData).catch((e) => { if (e.status === 401) setUser(null); else setError(e.message); }); }, []);
  useEffect(() => { if (user) loadData(); }, [user, loadData]);
  const players = useMemo(() => (data?.players || []).map(normalizePlayer), [data]);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);
  const [route, setRoute] = useState(parseHash); const [mode, setMode] = useState('fair'); const uKey = (k) => `${k}:${user?.username || 'anon'}`;
  const [favs, setFavs] = useState([]); const [notes, setNotes] = useState({}); const [compare, setCompareRaw] = useState([null, null]);
  useEffect(() => { if (user) { setFavs(read(uKey('ht2-favs'), [])); setNotes(read(uKey('ht2-notes'), {})); setCompareRaw([null, null]); } }, [user]); // eslint-disable-line
  useEffect(() => { const on = () => { setRoute(parseHash()); try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch { /* ignore */ } }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on); }, []);
  const navigate = useCallback((page, id) => { const h = page === 'player' ? `player/${id}` : page; if (window.location.hash !== `#${h}`) window.location.hash = h; }, []);
  const [toastMsg, setToastMsg] = useState(null); const toastTimer = useRef(null);
  const toast = useCallback((m) => { setToastMsg(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToastMsg(null), 3200); }, []);
  const toggleFav = (id) => { const on = favs.includes(id); const next = on ? favs.filter((x) => x !== id) : [...favs, id]; setFavs(next); write(uKey('ht2-favs'), next); toast(on ? `${byId[id]?.name} removed from favourites.` : `${byId[id]?.name} added to your scouting board.`); };
  const setNote = (id, text) => { const next = { ...notes, [id]: text }; setNotes(next); write(uKey('ht2-notes'), next); };
  const setCompare = (c) => setCompareRaw(c.slice(0, MAX_COMPARE));
  const addToCompare = (id) => { const c = [...compare]; if (!c.includes(id)) { const free = c.indexOf(null); if (free >= 0) c[free] = id; else if (c.length < MAX_COMPARE) c.push(id); else c[c.length - 1] = id; } setCompare(c); navigate('compare'); };
  const value = { user, role, roleLabel: ROLES[role]?.label, can, allowed, signIn, signOut, ready: players.length > 0, error,
    updated: data?.updated, meta: data?.meta, summary: data?.summary, players, byId, route, navigate, mode, setMode,
    favs, toggleFav, notes, setNote, compare, setCompare, addToCompare, toastMsg, toast, busy: false,
    pool: { meta: { ageGroup: 'U21' } }, nm: (p) => p.name,
    sc: (p) => (mode === 'fair' ? p.fairScore : p.rawScore), rk: (p) => (mode === 'fair' ? p.fairRank : p.rawRank) };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
