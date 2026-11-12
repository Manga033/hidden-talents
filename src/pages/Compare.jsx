import { useMemo, useState } from 'react';
import { MAX_COMPARE, useScout } from '../store.jsx';
import { Flag, Icon, Panel, PlayerPicker, Portrait, RankMove, Tag, tagsOf } from '../components/ui.jsx';
import { C, Radar, RankInterval } from '../components/charts.jsx';
import { GROUP_NAME, METRICS, SHORT } from '../engine/constants.js';
import { fmt1, fmt2, money, ordinal, signed, whyBetter } from '../engine/explain.js';

const COLORS = [C.wine, C.green, C.gold, C.blue];

function Evidence({ ia, ib }) {
  const { ctx, players } = useScout();
  const w = whyBetter(ctx, ia, ib);
  const L = w.leader === 'A' ? w.A : w.B;
  const T = w.leader === 'A' ? w.B : w.A;
  const lr = w.leader === 'A' ? w.ra : w.rb;
  const tr = w.leader === 'A' ? w.rb : w.ra;
  const gap = Math.abs(w.gap);
  const sgn = w.leader === 'A' ? 1 : -1;
  const N = players.length;
  const base = ctx.base;
  const fact = (m) => {
    if (m === 'ga90') return `${w.A.ga} G+A in ${w.A.minutes.toLocaleString('en')} min vs ${w.B.ga} in ${w.B.minutes.toLocaleString('en')} min`;
    if (m === 'big90') return 'Shown for context; not part of the score';
    return `${ordinal(Math.round(base.pct[ia][m] * 100))} vs ${ordinal(Math.round(base.pct[ib][m] * 100))} percentile in position`;
  };
  return (
    <>
      <p className="verdict big">
        <b>{L.name}</b> is fair #{lr.fairRank}, <b>{T.name}</b> #{tr.fairRank}: a gap of <b>{fmt1(gap)} points</b>. {signed(sgn * w.perfGap)} comes from what they did on the pitch and {signed(sgn * w.ctxGap)} from the strength of their teams.
        {w.rawFlip && ` A traditional list has them the other way round (#${lr.rawRank} vs #${tr.rawRank}).`}
      </p>
      {!w.sameGroup && (
        <div className="notice info">
          <Icon name="info" />
          <div>
            Different positions ({GROUP_NAME[w.A.grp]} vs {GROUP_NAME[w.B.grp]}). Each score shows how far a player stands out from others in his own position.
          </div>
        </div>
      )}
      <div className="table-scroll">
        <table className="data-table receipt-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="r">{w.A.name}</th>
              <th className="r">{w.B.name}</th>
              <th className="r">Difference</th>
              <th>The facts</th>
            </tr>
          </thead>
          <tbody>
            {w.rows.map((r) => (
              <tr key={r.metric} className={r.wa === 0 && r.wb === 0 ? 'dim' : ''}>
                <td>{SHORT[r.metric]}</td>
                <td className="r num">{signed(r.a)}</td>
                <td className="r num">{signed(r.b)}</td>
                <td className={`r num strong ${r.diff > 0.25 ? 'pos' : r.diff < -0.25 ? 'neg' : ''}`}>{signed(r.diff)}</td>
                <td className="fact-cell">{fact(r.metric)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Points above the position average</td>
              <td className="r num strong">{signed(w.ba.total)}</td>
              <td className="r num strong">{signed(w.bb.total)}</td>
              <td className="r num strong">{signed(w.gap)}</td>
              <td>Fair ranks #{w.ra.fairRank} and #{w.rb.fairRank}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="evidence-columns">
        <div>
          <h3>What decides it</h3>
          <ol className="reasons">
            {w.drivers.map((r) => (
              <li key={r.metric}>
                <b>{SHORT[r.metric]}</b>: {fmt1(Math.abs(r.diff))} points for {L.name}.
              </li>
            ))}
            {!w.drivers.length && <li>No single metric separates them by more than a quarter of a point.</li>}
          </ol>
          {w.against.length > 0 && (
            <>
              <h3>In {T.name}'s favour</h3>
              <ol className="reasons">
                {w.against.map((r) => (
                  <li key={r.metric}>
                    <b>{SHORT[r.metric]}</b>: {fmt1(Math.abs(r.diff))} points.
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
        <div>
          <h3>Is the gap real?</h3>
          <div className="interval-pair">
            <span>{w.A.name}</span>
            <RankInterval rank={w.ra.fairRank} low={w.ra.rankLow} high={w.ra.rankHigh} N={N} compact />
            <span>{w.B.name}</span>
            <RankInterval rank={w.rb.fairRank} low={w.rb.rankLow} high={w.rb.rankHigh} N={N} compact color={C.green} />
          </div>
          <p className="small-text">
            {w.overlap
              ? `Their likely rank ranges overlap (#${Math.round(w.ra.rankLow)}–#${Math.round(w.ra.rankHigh)} and #${Math.round(w.rb.rankLow)}–#${Math.round(w.rb.rankHigh)}). The data cannot fully separate them yet — watch both live before deciding.`
              : 'Their likely rank ranges do not overlap: the difference is clear.'}
          </p>
        </div>
      </div>
    </>
  );
}

function Slot({ p, k, onChange, onRemove, canRemove }) {
  if (!p) {
    return (
      <section className="compare-player empty" style={{ borderTopColor: COLORS[k] }}>
        <button type="button" className="add-big" onClick={onChange} aria-label={`Choose player ${k + 1}`}>
          <Icon name="plus" />
        </button>
        <span>Choose player {k + 1}</span>
        {canRemove && (
          <button type="button" className="change-player" onClick={onRemove}>
            Remove slot
          </button>
        )}
      </section>
    );
  }
  return (
    <section className="compare-player" style={{ borderTopColor: COLORS[k] }}>
      <div className="slot-actions">
        <button type="button" className="change-player" onClick={onChange}>
          Change
        </button>
        <button type="button" className="change-player" onClick={onRemove} aria-label={`Remove ${p.name}`}>
          <Icon name="close" />
        </button>
      </div>
      <a className="compare-avatar" href={`#player/${p.id}`} aria-label={`View ${p.name}`}>
        <Portrait p={p} />
      </a>
      <div className="compare-info">
        <h2>
          <a href={`#player/${p.id}`}>{p.name}</a>
        </h2>
        <div className="player-meta">
          <Flag country={p.country} /> {p.position} <span className="dot-divider">·</span> {p.ageShown} yrs
        </div>
        <div className="eyebrow">{p.team}</div>
        <div className="compare-score">
          <b style={{ color: COLORS[k] }}>#{p.fairRank}</b>
          <span>
            fair rank · traditional #{p.rawRank} <RankMove d={p.rankChange} compact />
          </span>
        </div>
        <div className="chips">{tagsOf(p).map((t) => <Tag key={t} label={t} />)}</div>
      </div>
    </section>
  );
}

export default function Compare() {
  const { compare, setCompare, byId, base, can } = useScout();
  const [picking, setPicking] = useState(null);
  const slots = compare.map((id) => (id && byId[id] ? byId[id] : null));
  const chosen = slots.filter(Boolean);
  const [pair, setPair] = useState([0, 1]);

  const setSlot = (k, id) => setCompare(slots.map((p, j) => (j === k ? id : p ? p.id : null)));
  const removeSlot = (k) => {
    const next = slots.map((p) => (p ? p.id : null)).filter((_, j) => j !== k);
    setCompare(next.length < 2 ? [...next, ...Array(2 - next.length).fill(null)] : next);
    setPair([0, 1]);
  };
  const addSlot = () => {
    setCompare([...slots.map((p) => (p ? p.id : null)), null]);
    setPicking(slots.length);
  };
  const colorOf = (p) => COLORS[slots.indexOf(p)];

  const a = chosen[Math.min(pair[0], chosen.length - 1)];
  const b = chosen[Math.min(pair[1], chosen.length - 1)];
  const axes = ['G+A', 'Attack', 'Defence', 'Big games', 'Discipline'];
  const pct = (p) => METRICS.map((m) => base.pct[p.i][m] * 100);

  const rows = useMemo(
    () =>
      [
        { label: 'Fair rank', get: (p) => p.fairRank, lower: true, fmt: (v) => `#${v}` },
        { label: 'Traditional rank', get: (p) => p.rawRank, lower: true, fmt: (v) => `#${v}` },
        { label: 'Minutes played', get: (p) => p.minutes, fmt: (v) => v.toLocaleString('en') },
        { label: 'Goals', get: (p) => p.goals },
        { label: 'Assists', get: (p) => p.assists },
        { label: 'G+A per 90', get: (p) => (p.minutes ? (p.ga / p.minutes) * 90 : 0), fmt: fmt2 },
        { label: 'Team strength (Elo)', get: (p) => Math.round(p.teamElo), neutral: true },
        can('marketValue') && { label: 'Market value', get: (p) => p.valueEnd || 0, fmt: (v) => money(v), neutral: true },
      ].filter(Boolean),
    [can]
  );

  return (
    <div className="fade-in">
      <div className="compare-intro">
        <span className="eyebrow">A DIFFERENT PERSPECTIVE</span>
        <h1>The details make the difference.</h1>
        <p>Choose up to {MAX_COMPARE} players. Every point of the gap is explained.</p>
      </div>

      <div className="compare-selection" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))${slots.length < MAX_COMPARE ? ' 84px' : ''}` }}>
        {slots.map((p, k) => (
          <Slot key={k} p={p} k={k} onChange={() => setPicking(k)} onRemove={() => removeSlot(k)} canRemove={slots.length > 2} />
        ))}
        {slots.length < MAX_COMPARE && (
          <button type="button" className="add-slot" onClick={addSlot} aria-label="Add another player" title="Add another player">
            <Icon name="plus" />
          </button>
        )}
      </div>

      {chosen.length < 2 ? (
        <div className="compare-hint">
          <Icon name="compare" />
          <p>{chosen.length ? 'Choose one more player to see the comparison.' : 'Press + to choose the players you want to compare.'}</p>
        </div>
      ) : (
        <>
          <section className="panel evidence-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">THE EVIDENCE</span>
                <h2>
                  Why {a.fairRank <= b.fairRank ? a.name : b.name} ranks above {a.fairRank <= b.fairRank ? b.name : a.name}
                </h2>
              </div>
              {chosen.length > 2 && (
                <div className="pair-pick">
                  <select value={pair[0]} onChange={(e) => setPair([Number(e.target.value), pair[1]])} aria-label="First player">
                    {chosen.map((p, k) => (
                      <option key={p.id} value={k} disabled={k === pair[1]}>{p.name}</option>
                    ))}
                  </select>
                  <span>vs</span>
                  <select value={pair[1]} onChange={(e) => setPair([pair[0], Number(e.target.value)])} aria-label="Second player">
                    {chosen.map((p, k) => (
                      <option key={p.id} value={k} disabled={k === pair[0]}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {a && b && a.id !== b.id && <Evidence ia={a.i} ib={b.i} />}
          </section>

          <div className="compare-content">
            <Panel title="Side by side" right={<small>BEST VALUE HIGHLIGHTED</small>}>
              <div className="table-scroll">
                <table className="data-table side-table">
                  <thead>
                    <tr>
                      <th />
                      {chosen.map((p) => (
                        <th key={p.id} className="r">
                          <span className="th-dot" style={{ background: colorOf(p) }} />
                          {p.name.split(' ').slice(-1)[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const vals = chosen.map(r.get);
                      const best = r.neutral ? null : r.lower ? Math.min(...vals) : Math.max(...vals);
                      const tie = vals.every((v) => v === vals[0]);
                      return (
                        <tr key={r.label}>
                          <td>{r.label}</td>
                          {vals.map((v, j) => (
                            <td key={j} className={`r num ${!tie && v === best ? 'win' : ''}`}>
                              {r.fmt ? r.fmt(v) : v}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
            <Panel title="Strength in every dimension" right={<small>PERCENTILE IN OWN POSITION</small>}>
              <Radar axes={axes} series={[...chosen].reverse().map((p) => ({ name: p.name, values: pct(p), color: colorOf(p) }))} />
              <div className="radar-legend">
                {chosen.map((p) => (
                  <span key={p.id}>
                    <i style={{ background: colorOf(p) }} />
                    {p.name}
                  </span>
                ))}
              </div>
            </Panel>
          </div>
        </>
      )}

      {picking != null && (
        <PlayerPicker
          exclude={chosen.map((p) => p.id)}
          onClose={() => {
            setPicking(null);
            // A slot that was added and then left empty goes away again.
            if (slots.length > 2 && !slots[slots.length - 1]) setCompare(slots.slice(0, -1).map((p) => (p ? p.id : null)));
          }}
          onPick={(id) => {
            setSlot(picking, id);
            setPicking(null);
          }}
        />
      )}
    </div>
  );
}
