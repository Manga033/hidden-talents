import { useMemo, useState } from 'react';
import { useScout } from '../store.jsx';
import ModelNotice from '../components/ModelNotice.jsx';
import { Empty, Icon, ModeToggle, PageTitle, PlayerCard } from '../components/ui.jsx';
import { GROUP_PLURAL } from '../engine/constants.js';

const ORDER = ['FWD', 'MID', 'DEF', 'GK'];
const SORTS = [
  ['rank', 'Rank (current view)'],
  ['mover', 'Biggest risers (traditional → fair)'],
  ['young', 'Youngest first'],
  ['confidence', 'Most certain first'],
];
const PAGE = 24;

export default function Players() {
  const { players, mode, can } = useScout();
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('All');
  const [bq, setBq] = useState('all');
  const [flag, setFlag] = useState('all');
  const [sort, setSort] = useState('rank');
  const [adv, setAdv] = useState(false);
  const [minMin, setMinMin] = useState(450);
  const [shown, setShown] = useState({});

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = players.filter(
      (p) =>
        (grp === 'All' || p.grp === grp) &&
        (bq === 'all' || p.birthQuarter === bq) &&
        (flag === 'all' || (flag === 'hidden' && p.hidden) || (flag === 'early' && p.early) || (flag === 'scout' && p.scout) || (flag === 'release' && p.plannedRelease)) &&
        p.minutes >= minMin &&
        (!t || `${p.name} ${p.team} ${p.position} ${p.positionGroup} ${p.country || ''}`.toLowerCase().includes(t))
    );
    const by = {
      rank: (a, b) => (mode === 'fair' ? a.fairRank - b.fairRank : a.rawRank - b.rawRank),
      mover: (a, b) => b.rankChange - a.rankChange,
      young: (a, b) => a.age - b.age,
      confidence: (a, b) => a.rankHigh - a.rankLow - (b.rankHigh - b.rankLow),
    }[sort];
    return out.sort(by);
  }, [players, q, grp, bq, flag, sort, mode, minMin]);

  const reset = () => {
    setQ('');
    setGrp('All');
    setBq('all');
    setFlag('all');
    setSort('rank');
    setMinMin(450);
  };
  const groups = grp === 'All' ? ORDER : [grp];

  return (
    <div className="catalog fade-in">
      <PageTitle
        eyebrow="THE NEXT GENERATION"
        title="Every talent has a story."
        sub={`All ${players.length} U21 professionals with at least 450 minutes in 2025/26. The big number is the ${mode === 'fair' ? 'fair' : 'traditional'} rank.`}
        right={<ModeToggle />}
      />

      <ModelNotice />
      <div className="filter-bar">
        <label className="search-box">
          <Icon name="search" />
          <input type="search" placeholder="Search players, clubs, positions or countries…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" autoComplete="off" />
        </label>
        <label className="filter-select">
          <select value={bq} onChange={(e) => setBq(e.target.value)} aria-label="Birth quarter">
            <option value="all">All birth quarters</option>
            <option value="Q1">Q1 · Jan–Mar</option>
            <option value="Q2">Q2 · Apr–Jun</option>
            <option value="Q3">Q3 · Jul–Sep</option>
            <option value="Q4">Q4 · Oct–Dec</option>
          </select>
          <Icon name="down" />
        </label>
        <label className="filter-select">
          <select value={flag} onChange={(e) => setFlag(e.target.value)} aria-label="Engine flag">
            <option value="all">All flags</option>
            <option value="hidden">Hidden talents</option>
            <option value="early">Early-peaker risk</option>
            <option value="scout">Watch live</option>
            {can('contracts') && <option value="release">Contract ends 2026/27</option>}
          </select>
          <Icon name="down" />
        </label>
        <button type="button" className={`filter-toggle ${adv ? 'active' : ''}`} aria-expanded={adv} onClick={() => setAdv((v) => !v)}>
          <Icon name="filter" />
          More filters
        </button>
      </div>
      {adv && (
        <div className="advanced-filters">
          <label>
            Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map(([v, t]) => (
                <option key={v} value={v}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum minutes <b className="num">{minMin}</b>
            <input type="range" min="450" max="3000" step="50" value={minMin} onChange={(e) => setMinMin(Number(e.target.value))} />
          </label>
          <button type="button" className="text-link" onClick={reset}>
            Reset all
          </button>
        </div>
      )}

      <div className="catalog-toolbar">
        <div className="position-tabs" role="group" aria-label="Position group">
          {['All', ...ORDER].map((g) => (
            <button key={g} type="button" className={`tab-button ${grp === g ? 'active' : ''}`} aria-pressed={grp === g} onClick={() => setGrp(g)}>
              {g === 'All' ? 'All players' : GROUP_PLURAL[g]}
              <span>{g === 'All' ? players.length : players.filter((p) => p.grp === g).length}</span>
            </button>
          ))}
        </div>
        <span className="results-count">{list.length} players in view</span>
      </div>

      {!list.length ? (
        <Empty title="No players in this search." action={<button type="button" className="button button-outline" onClick={reset}>Reset filters</button>}>
          Try a different name, position or flag.
        </Empty>
      ) : (
        groups.map((g) => {
          const items = list.filter((p) => p.grp === g);
          if (!items.length) return null;
          const n = shown[g] || PAGE;
          return (
            <section key={g}>
              <h2 className="group-heading">
                {GROUP_PLURAL[g]} <span>{items.length} players</span>
              </h2>
              <div className="player-grid">
                {items.slice(0, n).map((p) => (
                  <PlayerCard key={p.id} p={p} />
                ))}
              </div>
              {items.length > n && (
                <div className="more-row">
                  <button type="button" className="button button-outline" onClick={() => setShown((s) => ({ ...s, [g]: n + PAGE * 2 }))}>
                    Show more {GROUP_PLURAL[g].toLowerCase()} ({items.length - n} left)
                  </button>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
