import { useMemo, useState } from 'react';
import { useScout } from '../store.jsx';
import { Empty, Icon, PageTitle, Panel } from '../components/ui.jsx';
import { QuarterBars } from '../components/charts.jsx';
import { LABELS, METRICS, RULES, SHORT } from '../engine/constants.js';
import { biasAudit } from '../engine/verify.js';
import { chiSquare, pearson } from '../engine/stats.js';
import { reasonChips } from '../engine/explain.js';

const pFmt = (p) => (p == null ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(3));
const orFmt = (x) => (x == null || !Number.isFinite(x) ? '∞' : `${x.toFixed(2)}×`);

export default function Insights() {
  const { base, res, players, nm, pool, ctx } = useScout();
  const a = pool.audit || {};
  const [n, setN] = useState(20);
  const raw = useMemo(() => biasAudit(base, res, 'rawRank', n), [base, res, n]);
  const fair = useMemo(() => biasAudit(base, res, 'fairRank', n), [base, res, n]);
  const counts = raw.pool;
  const chi = chiSquare([counts.Q1, counts.Q2, counts.Q3, counts.Q4], [0, 0, 0, 0].map(() => players.length / 4));
  const q1q4 = counts.Q1 / Math.max(1, counts.Q4);

  // Proof that the correction works: correlation of each metric with team Elo, before and after.
  const eloCheck = useMemo(() => {
    const elo = base.players.map((p) => p.teamElo);
    return METRICS.map((m) => ({
      m,
      before: pearson(base.players.map((p) => p.z[m]), elo),
      after: pearson(base.adj.zf.map((z) => z[m]), elo),
      info: base.adj.info[m],
    }));
  }, [base]);
  const spearmanRF = useMemo(() => {
    const r = res.players;
    const x = r.map((p) => p.rawRank);
    const y = r.map((p) => p.fairRank);
    return pearson(x, y);
  }, [res]);

  const planned = players.filter((p) => p.plannedRelease).sort((x, y) => x.fairRank - y.fairRank);
  const [keep, setKeep] = useState({});
  const flagged = planned.filter((p) => !keep[p.id] && p.releaseWarning).length;
  const missingValue = base.players.filter((p) => !(p.valueEnd > 0)).length;

  return (
    <div className="fade-in">
      <PageTitle eyebrow="IS THE SELECTION FAIR?" title="Fairness audit." sub="Birth-date bias, team-strength bias and release decisions — each tested, with the test and its p-value shown." />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>1 · Who reaches professional football at all?</h2>
            <p className="panel-sub">Birth quarters of all {players.length} U21 professionals in the pool</p>
          </div>
          <small>CHI-SQUARE VS EVEN SPLIT</small>
        </div>
        <div className="audit-row">
          <div className="tiles two">
            <div className="tile wine">
              <span className="eyebrow">Q1 vs Q4 births in the pool</span>
              <strong>{q1q4.toFixed(1)}×</strong>
              <p>
                {counts.Q1} players born Jan–Mar against {counts.Q4} born Oct–Dec. χ² = {chi.chi.toFixed(1)}, df = 3, p {pFmt(chi.p)}.
              </p>
            </div>
            <div className="tile">
              <span className="eyebrow">What it means</span>
              <p className="tile-body">
                The relative-age effect has already filtered this pool before any scout ranks it: players born early in the year were more often selected in academy football. A late-born player who still made it is less likely to have been carried by being older.
              </p>
            </div>
          </div>
          <div className="quarter-pool">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
              <div key={q}>
                <span className="qbar" style={{ height: `${(counts[q] / counts.Q1) * 100}%` }} />
                <b>{counts[q]}</b>
                <small>{q}</small>
              </div>
            ))}
            <span className="even-line" style={{ bottom: `${(players.length / 4 / counts.Q1) * 100}%` }} title="Even split" />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>2 · Inside the pool: does the ranking favour early births?</h2>
            <p className="panel-sub">Birth quarters of the top {n}, traditional vs fair ranking. Odds of 1.0× mean birth date plays no part.</p>
          </div>
          <label className="inline-select">
            Top
            <select value={n} onChange={(e) => setN(Number(e.target.value))}>
              {[20, 49, 98].map((k) => (
                <option key={k} value={k}>{k}{k === 49 ? ' (10%)' : k === 98 ? ' (20%)' : ''}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="audit-row">
          <div className="tiles two">
            <div className="tile">
              <span className="eyebrow">Traditional: Q1 vs Q4 odds</span>
              <strong>{orFmt(raw.oddsRatio)}</strong>
              <p>Fisher p = {pFmt(raw.p)}. 80% rule: {raw.fourFifths.toFixed(2)}</p>
            </div>
            <div className="tile wine">
              <span className="eyebrow">Fair: Q1 vs Q4 odds</span>
              <strong>{orFmt(fair.oddsRatio)}</strong>
              <p>Fisher p = {pFmt(fair.p)}. 80% rule: {fair.fourFifths.toFixed(2)}</p>
            </div>
            <div className="tile span2">
              <span className="eyebrow">Honest reading</span>
              <p className="tile-body">
                {raw.p >= 0.05 && fair.p >= 0.05
                  ? 'Neither ranking shows a significant birth-quarter tilt inside the pool (both p ≥ 0.05).'
                  : `${raw.p < 0.05 ? `The traditional ranking tilts significantly (p = ${pFmt(raw.p)}).` : 'The traditional ranking shows no significant tilt.'} ${fair.p < 0.05 ? `The fair ranking still tilts (p = ${pFmt(fair.p)}).` : 'The fair ranking shows no significant tilt.'}`}{' '}
                With few picks the 80% rule is unstable — one player moves it a lot — so read it together with the p-value. Over ten seasons (2015–2025, top 10% each season) the Q1:Q4 odds were {(a.baseRate || '').match(/raw ([\d.]+)/)?.[1] || '–'} traditional and {(a.baseRate || '').match(/fair ([\d.]+)/)?.[1] || '–'} fair.
              </p>
            </div>
          </div>
          <QuarterBars pool={raw.pool} raw={raw.top} fair={fair.top} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>3 · Team strength and age: corrected only where the data proves an effect</h2>
            <p className="panel-sub">A player at a strong club gets better numbers partly from his team-mates. The fair score removes that part — but only where the effect is statistically clear.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Depends on team strength?</th>
                <th>Depends on age?</th>
                <th className="r">Link to team strength before</th>
                <th className="r">after</th>
              </tr>
            </thead>
            <tbody>
              {eloCheck.map(({ m, before, after, info }) => (
                <tr key={m}>
                  <td>{LABELS[m]}</td>
                  <td>{info.keptElo ? <span className="pill-on">Yes — corrected</span> : <span className="pill-off">No</span>}</td>
                  <td>{info.keptAge ? <span className="pill-on">Yes — corrected</span> : <span className="pill-off">No</span>}</td>
                  <td className="r num">{before.toFixed(2)}</td>
                  <td className="r num strong">{after.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="attribute-footnote">
          Link = correlation with team Elo (0 = none). After the correction the scores no longer depend on how strong the club is. Traditional and fair rankings agree only {spearmanRF.toFixed(2)} (1 = identical): the fair ranking is a genuinely different view.
        </p>
      </section>

      <Panel
        title="4 · Retain or release check"
        sub={`${planned.length} players have a contract ending 1 Jul 2026 – 30 Jun 2027. Untick a player to mark him as kept.`}
        right={
          <span className={`verdict-pill ${flagged ? 'warn' : 'ok'}`}>
            <Icon name={flagged ? 'alert' : 'check'} />
            {flagged ? `${flagged} release ${flagged === 1 ? 'decision needs' : 'decisions need'} a second look` : 'No risky releases'}
          </span>
        }
      >
        {!planned.length ? (
          <Empty title="No contract ends in the review window." />
        ) : (
          <div className="table-scroll">
            <table className="data-table release">
              <thead>
                <tr>
                  <th>Release?</th>
                  <th>Player</th>
                  <th className="r">Traditional #</th>
                  <th className="r">Fair #</th>
                  <th className="r">Potential</th>
                  <th>System check</th>
                </tr>
              </thead>
              <tbody>
                {planned.map((p) => {
                  const on = !keep[p.id];
                  const warn = on && p.releaseWarning;
                  return (
                    <tr key={p.id} className={warn ? 'flagged' : ''}>
                      <td>
                        <label className="check">
                          <input type="checkbox" checked={on} onChange={(e) => setKeep((k) => ({ ...k, [p.id]: !e.target.checked }))} />
                          {on ? 'Release' : 'Keep'}
                        </label>
                      </td>
                      <td>
                        <a href={`#player/${p.id}`} className="strong-link">{nm(p)}</a> <small className="muted">{p.position} · {p.ageShown}</small>
                      </td>
                      <td className="r num">{p.rawRank}</td>
                      <td className="r num strong">{p.fairRank}</td>
                      <td className="r num">{p.potential}</td>
                      <td>
                        {warn ? (
                          <span className="flag-msg">
                            <Icon name="alert" /> Fair rank in the top 25% — look again.
                            <span className="chips">{reasonChips(ctx, p.i, 2).map((r) => <span key={r} className="reason">{r}</span>)}</span>
                          </span>
                        ) : on ? (
                          <span className="ok-text">No conflict with the data</span>
                        ) : (
                          <span className="muted">Kept</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="attribute-footnote">{RULES.release}</p>
      </Panel>

      <Panel title="5 · Data quality report" sub="What the data covers and where it has gaps">
        <table className="data-table">
          <tbody>
            {(a.dataQuality || []).map((d) => (
              <tr key={d.label}>
                <td className={`dq ${d.status}`}><Icon name={d.status === 'ok' ? 'check' : 'alert'} /></td>
                <td>{d.label}</td>
                <td className="r strong">{d.value}</td>
              </tr>
            ))}
            <tr>
              <td className={`dq ${missingValue ? 'warn' : 'ok'}`}><Icon name={missingValue ? 'alert' : 'check'} /></td>
              <td>Players without a market value</td>
              <td className="r strong">{missingValue}</td>
            </tr>
          </tbody>
        </table>
        <p className="attribute-footnote">Scores use: {METRICS.filter((m) => m !== 'big90').map((m) => SHORT[m]).join(', ')}.</p>
      </Panel>
    </div>
  );
}
