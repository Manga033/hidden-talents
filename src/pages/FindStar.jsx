import { useMemo, useState } from 'react';
import { CUSTOM_DEFAULT, useScout } from '../store.jsx';
import { Empty, FavButton, Flag, Icon, PageTitle, Panel, Portrait, RankMove, Seg, Tag, tagsOf } from '../components/ui.jsx';
import { GROUP_PLURAL, LABELS, METRICS, PRESETS } from '../engine/constants.js';
import { rankPct } from '../engine/stats.js';

const BLANK = { grp: 'All', pos: [], ageMax: 20, minScore: 0, minPot: 0, minMinutes: 450, bq: [], foot: [], flags: [], conf: [] };
const POS = ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'];
const FLAGS = [['hidden', 'Hidden talent'], ['scout', 'Scout live'], ['early', 'Early peaker']];
const CUSTOM_LABELS = ['Goals + assists', 'Team attacking impact', 'Team defensive impact', 'Discipline'];

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

export default function FindStar() {
  const { players, preset, setPreset, custom, setCustom, busy, balanced, favs, addToCompare, can } = useScout();
  const [q, setQ] = useState('');
  const [f, setF] = useState(BLANK);
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState({ key: 'fairRank', dir: 1 });
  const set = (patch) => setF((c) => ({ ...c, ...patch }));

  // Fit = percentile of the player's weighted fair composite inside his own position group.
  const fit = useMemo(() => {
    const out = {};
    ['GK', 'DEF', 'MID', 'FWD'].forEach((g) => {
      const ps = players.filter((p) => p.grp === g);
      rankPct(ps.map((p) => p.compFair)).forEach((r, k) => (out[ps[k].id] = Math.round(r * 100)));
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
      fairRank: (p) => p.fairRank,
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
        sub="Tell us what your team values. Every fair score, rank and flag updates to match your game model."
        right={<Seg label="List" value={tab} onChange={setTab} options={[['all', 'All players'], ['favs', `Favourites (${favs.length})`]]} />}
      />

      <div className="find-grid">
        <Panel title="What matters to your team" sub="Pick a game model or set your own" right={busy ? <span className="busy-note">Updating…</span> : null}>
          <Seg label="Weight preset" value={preset} onChange={setPreset} options={[['Balanced', 'Balanced'], ['Attacking', 'Attacking'], ['Defensive', 'Defensive'], ['Custom', 'Custom']]} />
          {weightsShown ? (
            <table className="data-table weights-table">
              <thead>
                <tr>
                  <th />
                  {['ga90', 'off90', 'def90', 'disc90'].map((m) => (
                    <th key={m} className="r" title={LABELS[m]}>{{ ga90: 'G+A', off90: 'Att.', def90: 'Def.', disc90: 'Disc.' }[m]}</th>
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
            <Chips label="Must be" options={can('contracts') ? [...FLAGS, ['plannedRelease', 'Contract ends 26/27']] : FLAGS} value={f.flags} onChange={(v) => set({ flags: v })} />
          </div>
        </Panel>
      </div>

      <Panel title={tab === 'favs' ? 'Your favourites' : 'Matching players'} right={<span className="results-count">{rows.length} of {players.length}</span>}>
        {!rows.length ? (
          <Empty title={tab === 'favs' && !favs.length ? 'No favourites yet.' : 'No player matches.'}>{tab === 'favs' && !favs.length ? 'Star a player to keep him here.' : 'Loosen a filter or clear them all.'}</Empty>
        ) : (
          <div className="table-scroll">
            <table className="data-table find-table">
              <thead>
                <tr>
                  <th><span className="sr-only">Favourite</span></th>
                  <Th k="name" def={1}>Player</Th>
                  <Th k="pos" def={1}>Pos</Th>
                  <Th k="age" r def={1}>Age</Th>
                  <Th k="fairRank" r def={1}>Fair #</Th>
                  <Th k="rawRank" r def={1}>Trad. #</Th>
                  <Th k="move" r>Move</Th>
                  {preset !== 'Balanced' && <th className="r">vs Balanced</th>}
                  <Th k="fit" r>Fit</Th>
                  <Th k="minutes" r>Min</Th>
                  <th>Flags</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((p) => {
                  const bRank = balanced?.players[p.i]?.fairRank;
                  return (
                    <tr key={p.id}>
                      <td><FavButton p={p} className="favourite-button inline" /></td>
                      <td>
                        <a href={`#player/${p.id}`} className="who">
                          <Portrait p={p} className="mini-avatar" />
                          <span>
                            <strong>
                              {p.name} <Flag country={p.country} />
                            </strong>
                            <small>{p.team}</small>
                          </span>
                        </a>
                      </td>
                      <td>{p.position}</td>
                      <td className="r num">{p.ageShown}</td>
                      <td className="r num strong">{p.fairRank}</td>
                      <td className="r num">{p.rawRank}</td>
                      <td className="r"><RankMove d={p.rankChange} compact /></td>
                      {preset !== 'Balanced' && <td className="r">{bRank ? <RankMove d={bRank - p.fairRank} compact /> : '–'}</td>}
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
            {rows.length > 150 && <p className="muted-line">Showing the first 150 of {rows.length}. Narrow the filters to see the rest.</p>}
          </div>
        )}
        <p className="attribute-footnote">Fit: how well he matches your game model compared with others in his position (100 = best).</p>
      </Panel>
    </div>
  );
}
