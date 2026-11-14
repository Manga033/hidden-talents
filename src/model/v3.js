export const GROUP_PLURAL = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };
export const GROUP_NAME = { GK: 'goalkeeper', DEF: 'defender', MID: 'midfielder', FWD: 'forward' };
export const GROUP_FROM_NAME = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD' };
export const CATEGORY_LABELS = { scoring: 'Scoring', creation: 'Chance creation', progression: 'Progression', retention: 'Ball retention', defending: 'Defending', pressing: 'Pressing', aerial: 'Aerial play', physical: 'Physical', availability: 'Availability' };
export const RULES = { hidden: 'High fair position rank and clearly better than the traditional position rank, outside likely rank noise.', early: 'High traditional position rank but materially lower fair position rank, outside likely rank noise.', scout: 'Promising model signal with uncertainty that should be checked through live scouting.', release: 'Contract currently recorded as ending during the 2026/27 recruitment window.' };
export const money = (v) => !v ? 'Not available' : new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 }).format(v);
export function supportReasons(p, n = 3) { return (p.strengths || []).slice(0, n).map((x) => `${CATEGORY_LABELS[x.category] || x.category} ${x.score}/100`); }
export const signed = (v, digits = 0) => `${v > 0 ? '+' : ''}${Number(v).toFixed(digits)}`;
