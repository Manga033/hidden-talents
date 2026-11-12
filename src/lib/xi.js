// Best XI on the template's white half-pitch (public/assets/pitch-white-red.svg, 1800 x 1000).
// One affine map places every card: u = depth (0 halfway line, 1 own goal line), w = across (0 far touchline, 1 near).
// The corners come from the SVG boundary path: M80,420 L1260,100 L1740,660 L560,980.
const O = [80, 420];
const U = [1180, -320];
const V = [480, 560];
export function toPct(u, w) {
  const x = O[0] + u * U[0] + w * V[0];
  const y = O[1] + u * U[1] + w * V[1];
  return { x: x / 18, y: y / 10 };
}

// The team attacks towards the halfway line (left). Its right side is the far touchline.
export const FORMATIONS = {
  '4-3-3': [
    { pos: 'GK', u: 0.94, w: 0.5 },
    { pos: 'RB', u: 0.68, w: 0.05 }, { pos: 'CB', u: 0.68, w: 0.35 }, { pos: 'CB', u: 0.68, w: 0.65 }, { pos: 'LB', u: 0.68, w: 0.95 },
    { pos: 'CM', u: 0.41, w: 0.15, alt: ['AM', 'DM'] }, { pos: 'DM', u: 0.41, w: 0.5, alt: ['CM'] }, { pos: 'CM', u: 0.41, w: 0.85, alt: ['AM', 'DM'] },
    { pos: 'RW', u: 0.14, w: 0.15 }, { pos: 'ST', u: 0.14, w: 0.5 }, { pos: 'LW', u: 0.14, w: 0.85 },
  ],
  '4-2-3-1': [
    { pos: 'GK', u: 0.94, w: 0.5 },
    { pos: 'RB', u: 0.72, w: 0.05 }, { pos: 'CB', u: 0.72, w: 0.35 }, { pos: 'CB', u: 0.72, w: 0.65 }, { pos: 'LB', u: 0.72, w: 0.95 },
    { pos: 'DM', u: 0.5, w: 0.32, alt: ['CM'] }, { pos: 'CM', u: 0.5, w: 0.68, alt: ['DM'] },
    { pos: 'RW', u: 0.28, w: 0.1 }, { pos: 'AM', u: 0.28, w: 0.5, alt: ['CM'] }, { pos: 'LW', u: 0.28, w: 0.9 },
    { pos: 'ST', u: 0.07, w: 0.5 },
  ],
  '3-5-2': [
    { pos: 'GK', u: 0.94, w: 0.5 },
    { pos: 'CB', u: 0.7, w: 0.2 }, { pos: 'CB', u: 0.7, w: 0.5 }, { pos: 'CB', u: 0.7, w: 0.8 },
    { pos: 'RB', u: 0.45, w: 0.02, label: 'RWB' }, { pos: 'CM', u: 0.42, w: 0.3, alt: ['AM', 'DM'] }, { pos: 'DM', u: 0.48, w: 0.5, alt: ['CM'] },
    { pos: 'CM', u: 0.42, w: 0.7, alt: ['AM', 'DM'] }, { pos: 'LB', u: 0.45, w: 0.98, label: 'LWB' },
    { pos: 'ST', u: 0.13, w: 0.32 }, { pos: 'ST', u: 0.13, w: 0.68 },
  ],
};

const POS_GROUP = { GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', DM: 'MID', CM: 'MID', AM: 'MID', LW: 'FWD', RW: 'FWD', ST: 'FWD' };

// Best available player per slot by the chosen rank; nobody twice. Same rule for raw and fair.
export function pickXI(players, key, formation) {
  const order = [...players].sort((a, b) => a[key] - b[key]);
  const used = new Set();
  return FORMATIONS[formation].map((slot) => {
    let pick = null;
    for (const pos of [slot.pos, ...(slot.alt || [])]) {
      pick = order.find((p) => p.position === pos && !used.has(p.id));
      if (pick) break;
    }
    if (!pick) pick = order.find((p) => p.grp === POS_GROUP[slot.pos] && !used.has(p.id)) || null;
    if (pick) used.add(pick.id);
    return { ...slot, player: pick };
  });
}
