import { useMemo, useState } from 'react';
import { useScout } from '../store.jsx';
import ModelNotice from '../components/ModelNotice.jsx';
import { FavButton, Flag, Icon, ModeToggle, Portrait, RankMove, Tag, tagsOf } from '../components/ui.jsx';
import { FORMATIONS, pickXI, toPct } from '../lib/xi.js';
import { reasonChips } from '../engine/explain.js';

const NAMES = Object.keys(FORMATIONS);

function LineupCard({ slot, isNew }) {
  const p = slot.player;
  const { x, y } = toPct(slot.u, slot.w);
  const parts = p.name.split(' ');
  const last = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
  return (
    <article className={`lineup-slot ${isNew ? 'is-new' : ''}`} style={{ '--x': x, '--y': y, zIndex: Math.round(y) }}>
      <div className="lineup-shadow" />
      <a className="lineup-card" href={`#player/${p.id}`} aria-label={`${p.name}, ${slot.label || slot.pos}, ${p.country || ''}. View player profile`}>
        <div className="lineup-card-inner">
          <span className="lineup-card-geometry" />
          <span className="lineup-position">{slot.label || slot.pos}</span>
          <span className="lineup-card-brand">HT</span>
          <Portrait p={p} className="lineup-face" />
          <div className="lineup-card-shade" />
          <div className="lineup-identity">
            <strong>{last}</strong>
            <span className="lineup-card-footer">
              <Flag country={p.country} />
              <span>{p.ageShown} YRS</span>
            </span>
          </div>
        </div>
      </a>
      {isNew && <span className="lineup-ribbon">{p.hidden ? `▲${p.rankChange} HIDDEN` : 'NEW IN FAIR XI'}</span>}
      <FavButton p={p} className="lineup-save" />
    </article>
  );
}

export default function Home() {
  const { players, mode, setMode, nm, ctx, pool, allowed } = useScout();
  const statLink = allowed('hidden');
  const Stat = ({ children }) => (statLink ? <a className="metric" href="#hidden">{children}</a> : <div className="metric">{children}</div>);
  const [fi, setFi] = useState(0);
  const formation = NAMES[fi];
  const rawXI = useMemo(() => pickXI(players, 'rawRank', formation), [players, formation]);
  const fairXI = useMemo(() => pickXI(players, 'fairRank', formation), [players, formation]);
  const xi = mode === 'fair' ? fairXI : rawXI;
  const rawIds = new Set(rawXI.map((s) => s.player?.id));
  const fairIds = new Set(fairXI.map((s) => s.player?.id));

  // Pair every newcomer in the fair XI with the player he replaces (same slot first).
  const swaps = useMemo(() => {
    return fairXI
      .map((s, k) => ({ slot: s, in: s.player, out: rawXI[k].player }))
      .filter((x) => x.in && !rawIds.has(x.in.id))
      .map((x) => ({ ...x, out: x.out && !fairIds.has(x.out.id) ? x.out : rawXI.map((s) => s.player).find((p) => p && !fairIds.has(p.id) && p.grp === x.in.grp) }));
  }, [fairXI, rawXI]); // eslint-disable-line react-hooks/exhaustive-deps

  const N = players.length;
  const hidden = players.filter((p) => p.hidden).length;
  const early = players.filter((p) => p.early).length;
  const scout = players.filter((p) => p.scout).length;
  const step = (d) => setFi((i) => (i + d + NAMES.length) % NAMES.length);
  const q34 = (arr) => arr.filter((s) => s.player && s.player.bq >= 3).length;

  return (
    <div className="xi-home fade-in">
      <div className="broadcast-page-heading">
        <div>
          <h1>
            The Hidden XI<span>.</span>
          </h1>
          <p>
            {mode === 'fair'
              ? `The best ${formation} from ${N} U21 professionals, judged on what they do on the pitch — with the strength of their team taken into account.`
              : 'The traditional pick: goals, assists and market value — what a standard scouting list rewards.'}
          </p>
        </div>
        <div className="broadcast-heading-actions">
          <ModeToggle />
          <span className="formation-switch">
            <button type="button" className="icon-button" onClick={() => step(-1)} aria-label="Previous formation">
              <Icon name="chevron-left" />
            </button>
            <span className="broadcast-formation" aria-live="polite">{formation}</span>
            <button type="button" className="icon-button" onClick={() => step(1)} aria-label="Next formation">
              <Icon name="chevron" />
            </button>
          </span>
          <a className="text-link" href="#players">
            All players <Icon name="arrow" />
          </a>
        </div>
      </div>

      <ModelNotice />
      <section className="broadcast-stage" aria-label={`Eleven player cards in a ${formation} formation on a half-pitch`}>
        <div className="broadcast-scroll">
          <div className="lineup-pitch">
            <img className="pitch-markings" src="assets/pitch-white-red.svg" alt="" aria-hidden="true" />
            <div className="lineup-cards">
              {xi.map((s, k) => (s.player ? <LineupCard key={`${k}-${s.player.id}`} slot={s} isNew={mode === 'fair' && !rawIds.has(s.player.id)} /> : null))}
            </div>
          </div>
        </div>
        <div className="broadcast-caption">
          <span>
            BEST XI <i>·</i> {pool.meta.ageGroup || 'U21'} <i>·</i> 2025 / 26 <i>·</i> {mode === 'fair' ? 'FAIR RANK' : 'RAW RANK'}
          </span>
          <span className="desktop-pitch-hint">Select a player to see why he is in the XI.</span>
        </div>
      </section>

      <div className="metrics-strip">
        <div className="metric">
          <Icon name="people" />
          <div>
            <strong>{N}</strong>
            <span>U21 players, ≥450 min, 2025/26</span>
          </div>
        </div>
        <Stat>
          <Icon name="trend" />
          <div>
            <strong>{hidden}</strong>
            <span>Hidden talents found</span>
          </div>
        </Stat>
        <Stat>
          <Icon name="alert" />
          <div>
            <strong>{early}</strong>
            <span>Early-peaker risks</span>
          </div>
        </Stat>
        <Stat>
          <Icon name="eye" />
          <div>
            <strong>{scout}</strong>
            <span>Worth watching live</span>
          </div>
        </Stat>
      </div>

      <div className="dashboard-columns">
        <section>
          <div className="section-heading">
            <div className="heading-label">
              <div>
                <h2>{swaps.length} {swaps.length === 1 ? 'change' : 'changes'} against the traditional pick</h2>
                <p>Who comes in, who goes out, and the main reasons why.</p>
              </div>
            </div>
            {mode === 'raw' && (
              <button type="button" className="button" onClick={() => setMode('fair')}>
                Show fair XI
              </button>
            )}
          </div>
          {swaps.length === 0 ? (
            <p className="muted-line">The fair ranking picks the same eleven for this formation.</p>
          ) : (
            <div className="swap-list">
              {swaps.map((s) => (
                <a key={s.in.id} className="swap-row" href={`#player/${s.in.id}`}>
                  <span className="swap-pos">{s.slot.label || s.slot.pos}</span>
                  <span className="swap-names">
                    {s.out && <s>{nm(s.out)}</s>}
                    {s.out && <Icon name="arrow" />}
                    <b>{nm(s.in)}</b>
                    <small>
                      traditional #{s.in.rawRank} → fair #{s.in.fairRank} <RankMove d={s.in.rankChange} compact />
                      {s.out ? ` · replaces ${s.out.name} (traditional #${s.out.rawRank} → fair #${s.out.fairRank})` : ''}
                    </small>
                  </span>
                  <span className="chips">
                    {reasonChips(ctx, s.in.i).map((r) => (
                      <span key={r} className="reason">{r}</span>
                    ))}
                  </span>
                </a>
              ))}
            </div>
          )}
          <p className="footnote">
            Born July–December: {q34(rawXI)} of 11 in the traditional XI, {q34(fairXI)} of 11 in the fair XI.
          </p>
        </section>

        <aside className="dashboard-aside">
          <section className="board-panel">
            <div className="board-title">
              <h3>Starting XI</h3>
              <Icon name="list" />
            </div>
            <p>{mode === 'fair' ? 'Fair' : 'Traditional'} rank</p>
            <table className="mini-table">
              <tbody>
                {xi.map((s, k) =>
                  s.player ? (
                    <tr key={k}>
                      <td className="pos">{s.label || s.pos}</td>
                      <td>
                        <a href={`#player/${s.player.id}`}>{nm(s.player)}</a>
                        <span className="chips">{tagsOf(s.player).slice(0, 1).map((t) => <Tag key={t} label={t} />)}</span>
                      </td>
                      <td className="num">#{mode === 'fair' ? s.player.fairRank : s.player.rawRank}</td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </section>
        </aside>
      </div>
    </div>
  );
}
