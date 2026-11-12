// Every constant here is copied 1:1 from engine-python/engine.py and step1_elo.py.
// Changing a number here without changing the Python engine breaks reproducibility.

export const GROUPS = ['GK', 'DEF', 'MID', 'FWD'];
export const GROUP_NAME = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };
export const GROUP_FROM_NAME = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Forward: 'FWD' };
export const GROUP_PLURAL = { GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };

// engine.POSMAP (Transfermarkt sub_position -> app position)
export const POSMAP = {
  Goalkeeper: 'GK', 'Centre-Back': 'CB', 'Left-Back': 'LB', 'Right-Back': 'RB', 'Defensive Midfield': 'DM',
  'Central Midfield': 'CM', 'Attacking Midfield': 'AM', 'Left Midfield': 'LW', 'Right Midfield': 'RW',
  'Left Winger': 'LW', 'Right Winger': 'RW', 'Centre-Forward': 'ST', 'Second Striker': 'ST',
};

export const METRICS = ['ga90', 'off90', 'def90', 'big90', 'disc90'];
export const LABELS = {
  ga90: 'Goals + assists per 90',
  off90: 'Team attacking impact per 90',
  def90: 'Team defensive impact per 90',
  big90: 'Impact vs stronger opponents per 90',
  disc90: 'Discipline (fewer cards)',
};
export const SHORT = { ga90: 'G+A', off90: 'Attack impact', def90: 'Defence impact', big90: 'Big games', disc90: 'Discipline' };

// What each metric measures, in words a coach understands. Units are from step2/step3.
export const MEANING = {
  ga90: 'Goals plus assists per 90 minutes, pulled towards the position average when minutes are few (empirical-Bayes shrinkage).',
  off90: 'Goals his team scored while he was on the pitch, minus the goals the Elo model expected against that opponent, per 90.',
  def90: 'Goals his team conceded while he was on the pitch, below what the Elo model expected, per 90 (positive = good).',
  big90: 'On-pitch goal difference above expectation, only in matches against equal or stronger opponents.',
  disc90: 'Yellow cards + 2 x red cards per 90, sign flipped so that fewer cards scores higher.',
};

// engine.PRESETS: weights per position group, in METRICS order.
export const PRESETS = {
  Balanced: { FWD: [0.35, 0.25, 0.05, 0.25, 0.1], MID: [0.2, 0.25, 0.2, 0.25, 0.1], DEF: [0.1, 0.1, 0.4, 0.3, 0.1], GK: [0, 0, 0.6, 0.3, 0.1] },
  Attacking: { FWD: [0.45, 0.3, 0.0, 0.2, 0.05], MID: [0.3, 0.35, 0.05, 0.25, 0.05], DEF: [0.15, 0.2, 0.3, 0.3, 0.05], GK: [0, 0, 0.6, 0.3, 0.1] },
  Defensive: { FWD: [0.25, 0.15, 0.2, 0.3, 0.1], MID: [0.1, 0.15, 0.4, 0.25, 0.1], DEF: [0.05, 0.05, 0.55, 0.25, 0.1], GK: [0, 0, 0.6, 0.3, 0.1] },
};

// engine.K: shrinkage strength in 90-minute units, estimated in step4b_shrink.py from 2015-2025.
export const K = {
  ga90: { DEF: 12.4, FWD: 10.8, MID: 5.1, GK: 36.3 },
  off90: { DEF: 65.6, FWD: 110.4, MID: 57.2, GK: 542.7 },
  def90: { DEF: 353.2, FWD: 798.8, MID: 202.3, GK: 130.7 },
  disc90: { DEF: 129.3, FWD: 300.0, MID: 64.6, GK: 53.9 },
};
// engine.TAU2: true-talent variance; z-scores are in units of sqrt(TAU2).
export const TAU2 = {
  ga90: { DEF: 0.006, FWD: 0.035, MID: 0.0281, GK: 0.0001 },
  off90: { DEF: 0.0224, FWD: 0.0149, MID: 0.0249, GK: 0.0035 },
  def90: { DEF: 0.0051, FWD: 0.0022, MID: 0.0085, GK: 0.0131 },
  disc90: { DEF: 0.0021, FWD: 0.0005, MID: 0.0046, GK: 0.0011 },
};
// Big-game impact: estimated true variance is 0 -> weight 0 in the composite, shown as context only.
export const NOSIGNAL = ['big90'];
export const ACTIVE = METRICS.filter((m) => !NOSIGNAL.includes(m));

// Confidence bands: share of the pool covered by the likely rank range. High = under a third, Low = over two thirds.
export const CONF_BANDS = [1 / 3, 2 / 3];
// Watch live: promising on the fair ranking, but from a small sample that one live match can check.
export const WATCH = { topShare: 0.25, maxMinutes: 900 };
// Hidden talent / priced-above-output thresholds (shares of the pool); both also need the gap to exceed the rank range.
export const FLAG_RULES = { hiddenTop: 0.15, earlyTop: 0.15, earlyDrop: 0.15 };

export const ALPHA = 0.05; // engine.adjust: a correction is kept only if p < alpha
export const ELO = { K: 20, HFA: 65, carry: 0.85 }; // step1_elo.py
export const POOL_RULES = { maxAge: 21.0, minMinutes: 450, season: '2025/26' };

// step6_export flag rules, written once so every screen quotes the same definition.
export const RULES = {
  hidden: 'Fair rank in the top 15% of the pool, and the traditional rank lies outside his likely fair range (worse than its 90th percentile), so the gap is bigger than his sampling noise.',
  early: 'Priced above output: in the top 15% of the traditional list (goals, assists, market value), but at least 74 places lower on the fair ranking and above his likely fair range. Not shown at Low confidence. It says nothing about his future, only that price and reputation run ahead of the on-pitch numbers.',
  scout: 'Top 25% of the fair ranking, but from fewer than 900 minutes. Promising numbers from a small sample: one live match tells you the most.',
  release: 'Transfer opportunity: contract ends between 1 Jul 2026 and 30 Jun 2027 and the fair rank is in the top 25% of the pool. A cheap or free target for a buying club; for his own club, a contract to review.',
};
