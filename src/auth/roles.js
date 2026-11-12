// Who can see what. Shared by the server (which filters the data it sends) and the app (which hides pages).
// The server is the gate: data a role may not see is removed before it leaves the server.

export const PAGES = ['home', 'players', 'player', 'find', 'compare', 'hidden', 'insights', 'favourites'];

export const ROLES = {
  director: {
    label: 'Sporting director',
    pages: PAGES,
    see: { marketValue: true, contracts: true, audit: true },
    canUpload: true,
  },
  scout: {
    label: 'Scout',
    pages: ['home', 'players', 'player', 'find', 'compare', 'hidden', 'favourites'],
    see: { marketValue: true, contracts: false, audit: false },
    canUpload: false,
  },
  coach: {
    label: 'Coach',
    pages: ['home', 'players', 'player', 'compare', 'favourites'],
    see: { marketValue: false, contracts: false, audit: false },
    canUpload: false,
  },
};

export const canSee = (role, what) => !!ROLES[role]?.see[what];
export const canOpen = (role, page) => !!ROLES[role]?.pages.includes(page);

// Removes everything a role may not see. Runs on the server before data is sent.
export function filterForRole(role, json, rows) {
  const r = ROLES[role];
  if (!r) return null;
  const players = json.players.map((p) => {
    const q = { ...p };
    if (!r.see.contracts) {
      q.plannedRelease = false;
      q.releaseWarning = null;
    }
    return q;
  });
  const audit = r.see.audit ? json.audit : {};
  const outRows = rows.map((row) => {
    const o = { ...row };
    if (!r.see.contracts) o.release = 'False';
    if (!r.see.marketValue) o.value_end = '';
    return o;
  });
  return { meta: json.meta, audit, players, rows: outRows };
}
