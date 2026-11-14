// Who can see what. Shared by the server (which filters the data it sends) and the app (which hides pages).
// The server is the gate: data a role may not see is removed before it leaves the server.

export const PAGES = ['home', 'players', 'player', 'find', 'compare', 'hidden', 'insights', 'favourites'];

export const ROLES = {
  director: {
    label: 'Sporting director',
    pages: PAGES,
    see: { marketValue: true, contracts: true, audit: true },
  },
  scout: {
    label: 'Scout',
    pages: ['home', 'players', 'player', 'find', 'compare', 'hidden', 'favourites'],
    see: { marketValue: true, contracts: false, audit: false },
  },
  coach: {
    label: 'Coach',
    pages: ['home', 'players', 'player', 'compare', 'favourites'],
    see: { marketValue: false, contracts: false, audit: false },
  },
};

export const canSee = (role, what) => !!ROLES[role]?.see[what];
export const canOpen = (role, page) => !!ROLES[role]?.pages.includes(page);
