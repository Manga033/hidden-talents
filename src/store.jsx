import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildPool } from './engine/pool.js';
import { activeWeights, prepare, presetWeights, run } from './engine/engine.js';
import { PRESETS } from './engine/constants.js';
import { ROLES, canOpen, canSee } from './auth/roles.js';

/*
  Shared state for every screen:
  - the signed-in user and what their role may see
  - the engine output for that role (from the server) and the engine run on it
  - scoring priorities, Raw / Fair view, favourites, compare slots, scout notes, the route
*/
const Ctx = createContext(null);
export const useScout = () => useContext(Ctx);

const read = (k, f) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : f;
  } catch {
    return f;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked or full: the app still works for this visit */
  }
};

const ROUTES = ['home', 'players', 'find', 'compare', 'hidden', 'insights', 'favourites'];
function parseHash() {
  let h = '';
  try {
    h = decodeURIComponent(window.location.hash.replace(/^#/, ''));
  } catch {
    /* no address bar */
  }
  const [page, id] = h.split('/');
  if (page === 'player' && id) return { page: 'player', id };
  return { page: ROUTES.includes(page) ? page : 'home' };
}

// Custom weights are one vector [G+A, attack, defence, discipline] for outfield groups; keepers keep their preset.
export const CUSTOM_DEFAULT = [30, 25, 30, 15];
function customToGroups(v) {
  const w = (a) => [a[0], a[1], a[2], 0, a[3]];
  return { FWD: w(v), MID: w(v), DEF: w(v), GK: PRESETS.Balanced.GK };
}
export const MAX_COMPARE = 4;

async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(body.error || `Request failed (${r.status})`);
    e.status = r.status;
    throw e;
  }
  return body;
}

export function ScoutProvider({ children }) {
  /* ---------- session ---------- */
  const [user, setUser] = useState(undefined); // undefined = checking, null = signed out
  useEffect(() => {
    api('/api/me')
      .then((b) => setUser(b.user || null))
      .catch(() => setUser(null));
  }, []);
  const signIn = async (username, password) => {
    const b = await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    setUser(b.user);
  };
  const signOut = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
    setData(null);
  };
  const role = user?.role;
  const can = useCallback((what) => canSee(role, what), [role]);
  const allowed = useCallback((page) => canOpen(role, page), [role]);

  /* ---------- data for this role ---------- */
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const loadData = useCallback(() => {
    setError(null);
    api('/api/data')
      .then(setData)
      .catch((e) => {
        if (e.status === 401) setUser(null);
        else setError(e.message);
      });
  }, []);
  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  const pool = useMemo(() => (data ? buildPool(data, data.rows, data.nationality) : null), [data]);
  const base = useMemo(() => (pool ? prepare(pool) : null), [pool]);

  /* ---------- scoring priorities ---------- */
  // The game model starts at the club default on every visit, so no page silently uses old weights.
  const [preset, setPresetRaw] = useState('Balanced');
  const [custom, setCustomRaw] = useState(() => read('ht2-custom', CUSTOM_DEFAULT));
  const setPreset = (p) => setPresetRaw(p);
  const setCustom = (v) => {
    setCustomRaw(v);
    write('ht2-custom', v);
  };
  // Pages without the weight controls always use the club's default (Balanced) view.
  const effectivePreset = allowed('find') ? preset : 'Balanced';
  const weightKey = effectivePreset === 'Custom' ? `Custom:${custom.join(',')}` : effectivePreset;
  const W = useMemo(() => (effectivePreset === 'Custom' ? activeWeights(customToGroups(custom)) : presetWeights(effectivePreset)), [effectivePreset, weightKey]); // eslint-disable-line

  // Engine runs are cached per weighting. Balanced shows the engine's official ranks and scores.
  const cache = useMemo(() => new Map(), [base]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!base) return;
    const hit = cache.get(weightKey);
    if (hit) {
      setRes(hit);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      const balanced =
        cache.get('Balanced') ||
        run(base, presetWeights('Balanced'), {
          exportFair: true,
          exportConfidence: base.players.map((p) => ({ rankLow: p.exp.rankLow, rankHigh: p.exp.rankHigh, robust: p.exp.robust })),
        });
      cache.set('Balanced', balanced);
      const r = weightKey === 'Balanced' ? balanced : run(base, W, { seed: 42 });
      cache.set(weightKey, r);
      setRes(r);
      setBusy(false);
    }, 20);
    return () => clearTimeout(t);
  }, [base, cache, weightKey, W]);
  const balanced = res ? cache.get('Balanced') : null;

  /* ---------- view state ---------- */
  const [route, setRoute] = useState(parseHash);
  const [mode, setMode] = useState('fair');
  const uKey = (k) => `${k}:${user?.username || 'anon'}`;
  const [favs, setFavs] = useState([]);
  const [notes, setNotes] = useState({});
  const [compare, setCompareRaw] = useState([null, null]);
  useEffect(() => {
    if (!user) return;
    setFavs(read(uKey('ht2-favs'), []));
    setNotes(read(uKey('ht2-notes'), {}));
    setCompareRaw([null, null]);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const [toastMsg, setToastMsg] = useState(null);

  useEffect(() => {
    const on = () => {
      setRoute(parseHash());
      try {
        window.scrollTo({ top: 0, behavior: 'instant' });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((page, id) => {
    const h = page === 'player' ? `player/${id}` : page;
    if (window.location.hash !== `#${h}`) window.location.hash = h;
  }, []);

  const toastTimer = useRef(null);
  const toast = useCallback((m) => {
    setToastMsg(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const players = useMemo(() => {
    if (!base || !res) return [];
    return base.players.map((p, i) => ({ ...p, ...res.players[i], i, team: p.team || 'Club not recorded' }));
  }, [base, res]);
  const byId = useMemo(() => Object.fromEntries(players.map((p) => [p.id, p])), [players]);

  const toggleFav = (id) => {
    const on = favs.includes(id);
    const next = on ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    write(uKey('ht2-favs'), next);
    toast(on ? `${byId[id]?.name} removed from favourites.` : `${byId[id]?.name} added to your scouting board.`);
  };
  const setNote = (id, text) => {
    const next = { ...notes, [id]: text };
    setNotes(next);
    write(uKey('ht2-notes'), next);
  };
  const setCompare = (c) => setCompareRaw(c.slice(0, MAX_COMPARE));
  // From a card or profile: put the player in the first free slot (or add a slot), then open Compare.
  const addToCompare = (id) => {
    let c = compare.includes(id) ? compare : [...compare];
    if (!compare.includes(id)) {
      const free = c.indexOf(null);
      if (free >= 0) c[free] = id;
      else if (c.length < MAX_COMPARE) c.push(id);
      else c[c.length - 1] = id;
    }
    setCompare(c);
    navigate('compare');
  };

  const uploadData = async (jsonText, csvText) => {
    await api('/api/dataset', { method: 'POST', body: JSON.stringify({ json: jsonText, csv: csvText }) });
    setRes(null);
    loadData();
  };

  const value = {
    user,
    role,
    roleLabel: ROLES[role]?.label,
    can,
    allowed,
    signIn,
    signOut,
    ready: !!(base && res && players.length),
    error,
    updated: data?.updated,
    pool,
    base,
    res,
    balanced,
    ctx: base && res ? { base, res } : null,
    players,
    byId,
    preset: effectivePreset,
    setPreset,
    custom,
    setCustom,
    W,
    busy,
    route,
    navigate,
    mode,
    setMode,
    favs,
    toggleFav,
    notes,
    setNote,
    compare,
    setCompare,
    addToCompare,
    toastMsg,
    toast,
    uploadData,
    nm: (p) => p.name,
    sc: (p) => (mode === 'fair' ? p.fairScore : p.rawScore),
    rk: (p) => (mode === 'fair' ? p.fairRank : p.rawRank),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
