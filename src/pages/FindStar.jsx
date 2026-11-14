import { useEffect, useMemo, useState } from 'react';
import { useScout } from '../store.jsx';
import { Empty, FavButton, Flag, Icon, PageTitle, Panel, Portrait, RankMove, Seg, Tag, tagsOf } from '../components/ui.jsx';
import { CATEGORY_LABELS, GROUP_PLURAL } from '../model/v3.js';

const BLANK = { grp: 'All', pos: [], ageMax: 20, minScore: 0, minPot: 0, minMinutes: 450, bq: [], foot: [], flags: [], conf: [] };
const POS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
const FLAGS = [['hidden', 'Hidden talent'], ['scout', 'Watch live'], ['early', 'Priced above output']];
const METRICS = ['scoring', 'creation', 'progression', 'retention', 'defending'];
const LABELS = CATEGORY_LABELS;
const CUSTOM_DEFAULT = [30, 25, 30, 15];
const PRESETS = {
  Balanced: { FWD: [30,25,15,10,20], MID: [10,25,25,15,25], DEF: [5,10,20,20,45], GK: [5,10,10,15,60] },
  Attacking: { FWD: [40,30,15,10,5], MID: [20,30,25,15,10], DEF: [10,20,25,15,30], GK: [5,10,10,15,60] },
  Defensive: { FWD: [20,20,15,15,30], MID: [5,15,20,20,40], DEF: [0,10,15,20,55], GK: [0,5,10,15,70] },
};
const CUSTOM_LABELS = ['Scoring', 'Creation', 'Progression', 'Defending'];

function Chips({ label, options, value, onChange }) {
  const toggle = (x) => onChange(value.includes(x) ? value.filter((y) => y !== x) : [...value, x]);
  return (
    <div className="fgroup">
      <span className="flabel">{label}</span>
      <div className="chips" role="group" aria-label={label}>
        {options.map((o) => {
          const [v, t] = Array.isArray(o) ? o : [o, o];
          return (
            <button key={v} type="button" className="toggle-chip" aria-pressed={value.includes(v)} onClick={() => toggle(v)}>
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function Range({ label, min, max, step, value, onChange, fmt = (v) => v }) {
  return (
    <label className="fgroup">
      <span className="flabel">
        {label} <b className="num">{fmt(value)}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function PlayerName({ p }) {
  const words = p.name.trim().split(/\s+/);
  const last = words.pop();
  return <>{words.length ? `${words.join(' ')} ` : ''}<span className="name-tail">{last}<Flag country={p.country} /></span></>;
}

function Pager({ page, pages, total, perPage, onPage }) {
  // Page numbers around the current page, with the first and last always visible.
  const nums = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter((n) => n >= 0 && n < pages).sort((a, b) => a - b);
  const go = (n) => {
    onPage(n);
    document.querySelector('.find-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">
        {page * perPage + 1}–{Math.min(total, (page + 1) * perPage)} of {total}
      </span>
      <div className="pager-buttons">
        <button type="button" onClick={() => go(page - 1)} disabled={page === 0} aria-label="Previous page">
          <Icon name="chevron-left" />
        </button>
        {nums.map((n, k) => (
          <span key={n} className="pager-num">
            {k > 0 && n - nums[k - 1] > 1 && <span className="pager-gap">…</span>}
            <button type="button" aria-current={n === page ? 'page' : undefined} onClick={() => go(n)}>
              {n + 1}
            </button>
          </span>
        ))}
        <button type="button" onClick={() => go(page + 1)} disabled={page === pages - 1} aria-label="Next page">
          <Icon name="chevron" />
        </button>
      </div>
    </nav>
  );
}

export default function FindStar() {
  const { players, favs, addToCompare, can } = useScout();
  const [preset, setPreset] = useState('Balanced');
  const [custom, setCustom] = useState(CUSTOM_DEFAULT);
  const busy = false;
  const [q, setQ] = useState('');
  const [f, setF] = useState(BLANK);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState({ key: 'fairRank', dir: 1 });
  const [page, setPage] = useState(0);
  const PER_PAGE = 20;
  const set = (patch) => setF((c) => ({ ...c, ...patch }));

  // Fit = percentile of the player's weighted fair composite inside his own position group.
  const fit = useMemo(() => {
    const out = {};
    ['GK', 'DEF', 'MID', 'FWD'].forEach((g) => {
      const ps = players.filter((p) => p.grp === g);
      ps.forEach((p) => (out[p.id] = Math.round(100 * (p.positionCount - p.fairRank) / Math.max(1, p.positionCount - 1))));
    });
    return out;
  }, [players]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = players.filter((p) => {
      if (tab === 'favs' && !favs.includes(p.id)) return false;
      if (t && !`${p.name} ${p.team} ${p.position} ${p.country || ''}`.toLowerCase().includes(t)) return false;
      if (f.grp !== 'All' && p.grp !== f.grp) return false;
      if (f.pos.length && !f.pos.includes(p.position)) return false;
      if (p.ageShown > f.ageMax) return false;
      if (p.minutes < f.minMinutes) return false;
      if (f.bq.length && !f.bq.includes(p.birthQuarter)) return false;
      if (f.foot.length && !f.foot.includes(p.foot)) return false;
      if (f.conf.length && !f.conf.includes(p.conf)) return false;
      if (f.flags.some((k) => !p[k])) return false;
      return true;
    });
    const get = {
      name: (p) => p.name,
      pos: (p) => p.position,
      age: (p) => p.age,
      fairRank: (p) => -p.fairScore,
      posRank: (p) => p.posRank,
      rawRank: (p) => p.rawRank,
      fit: (p) => fit[p.id],
      minutes: (p) => p.minutes,
      move: (p) => p.rankChange,
    }[sort.key];
    return list.sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
    });
  }, [players, q, f, tab, sort, fit, favs]);

  // Back to the first page whenever the list itself changes.
  useEffect(() => setPage(0), [q, f, tab, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PER_PAGE, current * PER_PAGE + PER_PAGE);

  const active = f.pos.length + f.bq.length + f.foot.length + f.flags.length + f.conf.length + (f.grp !== 'All') + (f.ageMax < 20) + (f.minMinutes > 450);
  const Th = ({ k, children, r, def = -1 }) => (
    <th className={r ? 'r' : ''} aria-sort={sort.key === k ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-btn" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? -s.dir : def }))}>
        {children}
        {sort.key === k && <Icon name={sort.dir > 0 ? 'up' : 'down'} />}
      </button>
    </th>
  );
  const weightsShown = preset === 'Custom' ? null : PRESETS[preset];

  return (
    <div className="fade-in">
      <PageTitle
        eyebrow="YOUR GAME MODEL"
        title="Find your star."
        sub="Search the fixed v3 role model. The same official rank is used on every page."
        right={<Seg label="List" value={tab} onChange={setTab} options={[['all', 'All players'], ['favs', `Favourites (${favs.length})`]]} />}
      />

      <div className="find-grid">
        <Panel title="What matters to your team" sub="Explore priorities without changing the official v3 rank" right={busy ? <span className="busy-note">Updating…</span> : null}>
          <Seg label="Weight preset" value={preset} onChange={setPreset} options={[['Balanced', 'Balanced'], ['Attacking', 'Attacking'], ['Defensive', 'Defensive'], ['Custom', 'Custom']]} />
          <p className="weights-note">
            <Icon name="info" /> These controls explain recruitment priorities. The official v3 role ranking stays fixed so every page always shows the same number.
          </p>
          {weightsShown ? (
            <table className="data-table weights-table">
              <thead>
                <tr>
                  <th />
                  {['scoring', 'creation', 'progression', 'defending'].map((m) => (
                    <th key={m} className="r" title={LABELS[m]}>{({ scoring: 'Scoring', creation: 'Creation', progression: 'Progression', defending: 'Defending' })[m]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {['FWD', 'MID', 'DEF', 'GK'].map((g) => {
                  const w = weightsShown[g];
                  const tot = METRICS.reduce((s, m, j) => s + (m === 'big90' ? 0 : w[j]), 0);
                  return (
                    <tr key={g}>
                      <td>{GROUP_PLURAL[g]}</td>
                      {[0, 1, 2, 4].map((j) => (
                        <td key={j} className="r num">{Math.round((w[j] / tot) * 100)}%</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="stack sliders">
              {CUSTOM_LABELS.map((label, k) => (
                <label key={label} className="prio">
                  <span>{label}</span>
                  <input type="range" min="0" max="100" step="5" value={custom[k]} onChange={(e) => setCustom(custom.map((x, j) => (j === k ? Number(e.target.value) : x)))} />
                  <b className="num">{Math.round((custom[k] / (custom.reduce((s, x) => s + x, 0) || 1)) * 100)}%</b>
                </label>
              ))}
              <button type="button" className="text-link" onClick={() => setCustom(CUSTOM_DEFAULT)}>
                Reset custom weights
              </button>
            </div>
          )}
        </Panel>

        <Panel title="Filters" right={active ? <button type="button" className="text-link" onClick={() => setF(BLANK)}>Clear {active}</button> : null}>
          <div className="filters">
            <label className="search-box bordered">
              <Icon name="search" />
              <input type="search" placeholder="Name, club or position" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
            </label>
            <Chips label="Position" options={POS} value={f.pos} onChange={(v) => set({ pos: v })} />
            <Range label="Maximum age" min={16} max={20} step={1} value={f.ageMax} onChange={(v) => set({ ageMax: v })} fmt={(v) => (v >= 20 ? 'any' : `${v}`)} />
            <Range label="Minimum minutes" min={450} max={3000} step={50} value={f.minMinutes} onChange={(v) => set({ minMinutes: v })} />
            <Chips label="Birth quarter" options={['Q1', 'Q2', 'Q3', 'Q4']} value={f.bq} onChange={(v) => set({ bq: v })} />
            <Chips label="Foot" options={['Left', 'Right', 'Both']} value={f.foot} onChange={(v) => set({ foot: v })} />
            <Chips label="Confidence" options={['High', 'Medium', 'Low']} value={f.conf} onChange={(v) => set({ conf: v })} />
            <Chips label="Must be" options={can('contracts') ? [...FLAGS, ['plannedRelease', 'Transfer opportunity window']] : FLAGS} value={f.flags} onChange={(v) => set({ flags: v })} />
          </div>
        </Panel>
      </div>

      <Panel className="find-results" title={tab === 'favs' ? 'Your favourites' : 'Matching players'} right={<span className="results-count">{rows.length} of {players.length}</span>}>
        {!rows.length ? (
          <Empty title={tab === 'favs' && !favs.length ? 'No favourites yet.' : 'No player matches.'}>{tab === 'favs' && !favs.length ? 'Star a player to keep him here.' : 'Loosen a filter or clear them all.'}</Empty>
        ) : (
          <div className="table-scroll">
            <table className="data-table find-table">
              <colgroup>
                <col className="col-favourite" />
                <col className="col-player" />
                <col className="col-position" />
                <col className="col-age" />
                <col className="col-fair" />
                <col className="col-traditional" />
                <col className="col-move" />
                <col className="col-fit" />
                <col className="col-minutes" />
                <col className="col-flags" />
                <col className="col-actions" />
              </colgroup>
              <thead>
                <tr>
                  <th><span className="sr-only">Favourite</span></th>
                  <Th k="name" def={1}>Player</Th>
                  <Th k="pos" def={1}>Position</Th>
                  <Th k="age" r def={1}>Age</Th>
                  <Th k="fairRank" r def={1}>Fair</Th>
                  <Th k="rawRank" r def={1}>Traditional</Th>
                  <Th k="move" r>Move</Th>
                  <Th k="fit" r>Fit</Th>
                  <Th k="minutes" r>Min</Th>
                  <th>Flags</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  return (
                    <tr key={p.id}>
                      <td><FavButton p={p} className="favourite-button inline" /></td>
                      <td>
                        <a href={`#player/${p.id}`} className="who">
                          <Portrait p={p} className="mini-avatar" />
                          <span>
                            <strong>
                              <PlayerName p={p} />
                            </strong>
                            <small>{p.team}</small>
                          </span>
                        </a>
                      </td>
                      <td>{p.position}</td>
                      <td className="r num">{p.ageShown}</td>
                      <td className="r num strong" title={`${p.fairRank} of ${p.positionCount} in his position group`}>{p.fairRank}</td>
                      <td className="r num">{p.rawRank}</td>
                      <td className="r"><RankMove d={p.rankChange} compact /></td>
                      <td className="r">
                        <span className="fit">
                          <span className="fit-bar"><span style={{ width: `${fit[p.id]}%` }} /></span>
                          <b className="num">{fit[p.id]}</b>
                        </span>
                      </td>
                      <td className="r num">{p.minutes.toLocaleString('en')}</td>
                      <td><span className="chips">{tagsOf(p).slice(0, 2).map((t) => <Tag key={t} label={t} />)}</span></td>
                      <td className="r">
                        <button type="button" className="mini-button" onClick={() => addToCompare(p.id)}>
                          <Icon name="plus" /> Compare
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {pages > 1 && <Pager page={current} pages={pages} total={rows.length} perPage={PER_PAGE} onPage={setPage} />}
          </div>
        )}
        <p className="attribute-footnote">Fit: how well he matches your game model compared with others in his position (100 = best).</p>
      </Panel>
    </div>
  );
}
