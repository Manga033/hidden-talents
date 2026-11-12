import { useMemo } from 'react';
import { useScout } from '../store.jsx';
import { Empty, Icon, PageTitle } from '../components/ui.jsx';
import { LABELS, METRICS } from '../engine/constants.js';
import { biasAudit } from '../engine/verify.js';
import { chiSquare, pearson } from '../engine/stats.js';
import { reasonChips } from '../engine/explain.js';

const pFmt = (p) => (p == null ? '–' : p < 0.001 ? '< 0.001' : p.toFixed(2));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (s) => {
  if (!s) return 'Jul 2026 – Jun 2027';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export default function Insights() {
  const { base, res, players, ctx } = useScout();

  // 1. Birth date: who reaches the pool, and does either ranking add a tilt inside it?
  const raw = useMemo(() => biasAudit(base, res, 'rawRank', 20), [base, res]);
  const fair = useMemo(() => biasAudit(base, res, 'fairRank', 20), [base, res]);
  const counts = raw.pool;
  const chi = chiSquare([counts.Q1, counts.Q2, counts.Q3, counts.Q4], [0, 0, 0, 0].map(() => players.length / 4));
  const q1q4 = counts.Q1 / Math.max(1, counts.Q4);
  const noTilt = raw.p >= 0.05 && fair.p >= 0.05;

  // 2. Team strength: link between each metric and club Elo, before and after the correction.
  const eloCheck = useMemo(() => {
    const elo = base.players.map((p) => p.teamElo);
    return METRICS.filter((m) => m !== 'big90').map((m) => ({
      m,
      before: pearson(base.players.map((p) => p.z[m]), elo),
      after: pearson(base.adj.zf.map((z) => z[m]), elo),
      info: base.adj.info[m],
    }));
  }, [base]);
  const ageCorrected = METRICS.some((m) => base.adj.info[m].keptAge);

  // 3. Contracts ending in the review window; the ones ranked in the top 25% need a second look.
  const expiring = players.filter((p) => p.plannedRelease).sort((x, y) => x.fairRank - y.fairRank);
  const review = expiring.filter((p) => p.releaseWarning);
  const rest = expiring.length - review.length;

  return (
    <div className="fade-in">
      <PageTitle eyebrow="IS THE SELECTION FAIR?" title="Fairness check." sub="Is birth date or club strength deciding who gets picked — and which expiring contracts need a second look." />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>1 · Birth date decides who reaches professional football</h2>
            <p className="panel-sub">Birth quarters of all {players.length} U21 professionals in the pool</p>
          </div>
        </div>
        <div className="audit-row">
          <div className="tiles two">
            <div className="tile wine">
              <span className="eyebrow">Jan–Mar vs Oct–Dec births</span>
              <strong>{q1q4.toFixed(1)}×</strong>
              <p>
                {counts.Q1} players born January–March against {counts.Q4} born October–December. Far beyond chance (p {pFmt(chi.p)}).
              </p>
            </div>
            <div className="tile">
              <span className="eyebrow">What it means</span>
              <p className="tile-body">Players born early in the year were picked more often in academy football, so the bias is already built into who turns professional. A late-born player who made it anyway is worth a closer look.</p>
            </div>
            <div className="tile span2 plain">
              <p className="tile-body">
                <Icon name={noTilt ? 'check' : 'alert'} />{' '}
                {noTilt
                  ? 'Inside the pool, neither the traditional nor the fair ranking favours early births (no significant difference in the top 20).'
                  : `Inside the pool the top 20 still leans towards early births (traditional p ${pFmt(raw.p)}, fair p ${pFmt(fair.p)}).`}
              </p>
            </div>
          </div>
          <div className="quarter-pool">
            {['Q1', 'Q2', 'Q3', 'Q4'].map((q, k) => (
              <div key={q}>
                <span className="qbar" style={{ height: `${(counts[q] / counts.Q1) * 100}%` }} />
                <b>{counts[q]}</b>
                <small>{['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][k]}</small>
              </div>
            ))}
            <span className="even-line" style={{ bottom: `${(players.length / 4 / counts.Q1) * 100}%` }} title="Even split" />
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>2 · Club strength is taken out of the fair ranking</h2>
            <p className="panel-sub">A player at a strong club gets better numbers partly from his team-mates. The fair ranking removes that part wherever the data shows it.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Depends on club strength?</th>
                <th className="r">Link before</th>
                <th className="r">Link after</th>
              </tr>
            </thead>
            <tbody>
              {eloCheck.map(({ m, before, after, info }) => (
                <tr key={m}>
                  <td>{LABELS[m]}</td>
                  <td>{info.keptElo ? <span className="pill-on">Yes — corrected</span> : <span className="pill-off">No</span>}</td>
                  <td className="r num">{before.toFixed(2)}</td>
                  <td className="r num strong">{after.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="attribute-footnote">
          Link = correlation with club strength (0 = none). After the correction the fair ranking no longer depends on how strong the club is. {ageCorrected ? 'Age is also corrected where it matters.' : 'Age showed no measurable effect, so it is left alone.'}
        </p>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>3 · Contracts to review</h2>
            <p className="panel-sub">
              {expiring.length} contracts end between July 2026 and June 2027. {review.length ? `${review.length} of these players rank in the top 25% on the fair ranking.` : 'None of these players ranks in the top 25%.'}
            </p>
          </div>
          <span className={`verdict-pill ${review.length ? 'warn' : 'ok'}`}>
            <Icon name={review.length ? 'alert' : 'check'} />
            {review.length ? `${review.length} to review before letting go` : 'No risky contracts'}
          </span>
        </div>
        {!review.length ? (
          <Empty icon="check" title="No expiring contract conflicts with the data." />
        ) : (
          <div className="table-scroll">
            <table className="data-table release">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Contract ends</th>
                  <th className="r">Fair #</th>
                  <th className="r">Traditional #</th>
                  <th>Why keep him</th>
                </tr>
              </thead>
              <tbody>
                {review.map((p) => (
                  <tr key={p.id} className="flagged">
                    <td>
                      <a href={`#player/${p.id}`} className="strong-link">{p.name}</a> <small className="muted">{p.position} · {p.ageShown} yrs · {p.team}</small>
                    </td>
                    <td>{dateLabel(p.contractEnd)}</td>
                    <td className="r num strong">{p.fairRank}</td>
                    <td className="r num">{p.rawRank}</td>
                    <td>
                      <span className="chips">
                        {reasonChips(ctx, p.i, 3)
                          .filter((r) => !r.includes('−') && !r.startsWith('Only'))
                          .slice(0, 2)
                          .map((r) => (
                            <span key={r} className="reason">{r}</span>
                          ))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rest > 0 && <p className="attribute-footnote">The other {rest} expiring contracts belong to players outside the top 25%: no conflict with the data.</p>}
      </section>
    </div>
  );
}
