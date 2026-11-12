import { useMemo } from 'react';
import { useScout } from '../store.jsx';
import { Empty, Icon, PageTitle } from '../components/ui.jsx';
import { C } from '../components/charts.jsx';
import { LABELS, METRICS } from '../engine/constants.js';
import { biasAudit } from '../engine/verify.js';
import { chiSquare, pearson, spearman } from '../engine/stats.js';
import { supportReasons } from '../engine/explain.js';

const pFmt = (p) => (p < 0.001 ? '< 0.001' : `= ${p.toFixed(2)}`);
const corr = (x) => (Math.abs(x) < 0.005 ? '0.00' : x.toFixed(2));
const QUARTERS = [
  ['Q1', 'Jan–Mar'],
  ['Q2', 'Apr–Jun'],
  ['Q3', 'Jul–Sep'],
  ['Q4', 'Oct–Dec'],
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (s) => {
  if (!s) return 'Jul 2026 – Jun 2027';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

// Players per birth quarter, with the even spread marked.
function BirthChart({ counts, total }) {
  const W = 520;
  const H = 250;
  const top = 26;
  const base = 196;
  const even = total / 4;
  const max = Math.max(...QUARTERS.map(([q]) => counts[q]), even) * 1.08;
  const y = (v) => base - (v / max) * (base - top);
  const bw = 70;
  const cx = (i) => 80 + i * 120;
  const label = `Players per birth quarter: ${QUARTERS.map(([q, m]) => `${m} ${counts[q]}`).join(', ')}. An even spread would be ${Math.round(even)} each.`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="birth-chart" role="img" aria-label={label}>
      <line x1="20" x2={W - 20} y1={base} y2={base} stroke="#e3dedb" />
      {QUARTERS.map(([q, m], i) => (
        <g key={q}>
          <rect x={cx(i) - bw / 2} y={y(counts[q])} width={bw} height={base - y(counts[q])} rx="4" fill={i === 0 ? C.wine : '#c9a2ab'} />
          <text x={cx(i)} y={y(counts[q]) - 8} textAnchor="middle" className="bc-val">{counts[q]}</text>
          <text x={cx(i)} y={base + 22} textAnchor="middle" className="bc-label">{m}</text>
        </g>
      ))}
      <line x1="20" x2={W - 20} y1={y(even)} y2={y(even)} stroke={C.ink} strokeDasharray="5 4" strokeWidth="1.3" />
      <text x={W - 20} y={y(even) - 6} textAnchor="end" className="bc-note">even spread: {Math.round(even)} each</text>
    </svg>
  );
}

export default function Insights() {
  const { base, balanced } = useScout();
  // The check always audits the club's official ranking (Balanced weights), whatever is set in Find your star.
  const res = balanced;
  const ctx = useMemo(() => ({ base, res }), [base, res]);
  const N = base.players.length;

  // 1. Birth date: who reaches the pool, and does either ranking lean further inside it?
  const counts = useMemo(() => {
    const c = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    base.players.forEach((p) => (c[`Q${p.bq}`] += 1));
    return c;
  }, [base]);
  const chi = chiSquare(QUARTERS.map(([q]) => counts[q]), QUARTERS.map(() => N / 4));
  const q1q4 = counts.Q1 / Math.max(1, counts.Q4);
  const cutoffs = useMemo(
    () =>
      [20, Math.round(N * 0.1), Math.round(N * 0.2)].map((n) => ({
        n,
        raw: biasAudit(base, res, 'rawRank', n),
        fair: biasAudit(base, res, 'fairRank', n),
      })),
    [base, res, N]
  );
  const anyLean = cutoffs.some((c) => c.raw.p < 0.05 || c.fair.p < 0.05);

  // 2. Club strength: how much each ranking follows club Elo, and each metric before/after the correction.
  const elo = useMemo(() => base.players.map((p) => p.teamElo), [base]);
  const rankLink = useMemo(
    () => ({
      traditional: spearman(res.players.map((x) => -x.rawRank), elo),
      fair: spearman(res.players.map((x) => -x.fairRank), elo),
    }),
    [res, elo]
  );
  const metricLink = useMemo(
    () =>
      METRICS.filter((m) => m !== 'big90').map((m) => ({
        m,
        before: pearson(base.players.map((p) => p.z[m]), elo),
        after: pearson(base.adj.zf.map((z) => z[m]), elo),
        corrected: base.adj.info[m].keptElo,
      })),
    [base, elo]
  );
  const ageCorrected = METRICS.some((m) => base.adj.info[m].keptAge);

  // 3. Contracts ending in the review window; players in the fair top 25% need a second look.
  const expiring = base.players.map((p, i) => ({ ...p, ...res.players[i] })).filter((p) => p.plannedRelease);
  const review = expiring.filter((p) => p.releaseWarning).sort((a, b) => a.fairRank - b.fairRank);
  const rest = expiring.length - review.length;
  const keepReasons = (i) => supportReasons(ctx, i, 2);

  return (
    <div className="fade-in fairness">
      <PageTitle eyebrow="IS THE SELECTION FAIR?" title="Fairness check." sub="Does birth date or club strength decide who gets picked — and which expiring contracts are opportunities?" />

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">1 · BIRTH DATE</span>
            <h2>Birth date decides who reaches professional football</h2>
            <p className="panel-sub">Birth quarter of all {N} U21 professionals in the pool</p>
          </div>
        </div>
        <div className="fc-row">
          <div className="fc-facts">
            <div className="fc-stat">
              <strong>{q1q4.toFixed(1)}×</strong>
              <span>
                more players born in January–March ({counts.Q1}) than in October–December ({counts.Q4}). Far beyond chance (p {pFmt(chi.p)}).
              </span>
            </div>
            <p className="fc-text">Players born early in the year were picked more often in youth football, so the bias is already built into who turns professional. A late-born player who made it anyway is worth a closer look.</p>
            <p className={`fc-verdict ${anyLean ? 'warn' : 'ok'}`}>
              <Icon name={anyLean ? 'alert' : 'check'} />
              <span>
                {anyLean
                  ? 'Inside the pool, the ranking still leans towards early births at some cut-offs.'
                  : `Inside the pool, neither ranking adds a significant lean towards early births (checked in the top ${cutoffs.map((c) => c.n).join(', ')}).`}
              </span>
            </p>
          </div>
          <BirthChart counts={counts} total={N} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">2 · CLUB STRENGTH</span>
            <h2>The fair ranking corrects for club strength</h2>
            <p className="panel-sub">A player at a strong club gets better numbers partly from his team-mates. The fair ranking takes the club-related part out.</p>
          </div>
        </div>
        <div className="fc-compare">
          <div className="fc-stat muted-stat">
            <small>Traditional ranking</small>
            <strong>{corr(rankLink.traditional)}</strong>
            <span>link to club strength</span>
          </div>
          <Icon name="arrow" />
          <div className="fc-stat">
            <small>Fair ranking</small>
            <strong>{corr(rankLink.fair)}</strong>
            <span>link to club strength</span>
          </div>
          <p className="fc-text">Link = rank correlation with club Elo: 1 means the best clubs' players always rank highest, 0 means club strength plays no part. Note: strong clubs also sign better players, so part of what is removed may be real quality. Separating the two needs players who changed clubs, which is planned for the next engine run.</p>
        </div>
        <div className="table-scroll">
          <table className="data-table fc-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Affected by club strength?</th>
                <th className="r">Link before</th>
                <th className="r">Link after</th>
              </tr>
            </thead>
            <tbody>
              {metricLink.map(({ m, before, after, corrected }) => (
                <tr key={m}>
                  <td>{LABELS[m]}</td>
                  <td>{corrected ? <span className="pill-on">Yes — corrected</span> : <span className="pill-off">No clear effect</span>}</td>
                  <td className="r num">{corr(before)}</td>
                  <td className="r num strong">{corr(after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="attribute-footnote">{ageCorrected ? 'Age is also corrected where it has a clear effect.' : 'Age showed no clear effect in this U21 pool, so it is left as it is.'}</p>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">3 · CONTRACTS</span>
            <h2>Transfer opportunities: expiring contracts</h2>
            <p className="panel-sub">
              {expiring.length} contracts end between July 2026 and June 2027.{' '}
              {review.length ? `${review.length} of these players rank in the top 25% of the fair ranking.` : 'None of these players ranks in the top 25% of the fair ranking.'}
            </p>
          </div>
          <span className={`verdict-pill ${review.length ? 'warn' : 'ok'}`}>
            <Icon name={review.length ? 'alert' : 'check'} />
            {review.length ? `${review.length} opportunities` : 'No opportunities'}
          </span>
        </div>
        {!expiring.length ? (
          <Empty icon="check" title="No contract ends in the review window." />
        ) : !review.length ? (
          <Empty icon="check" title="No expiring contract conflicts with the data." />
        ) : (
          <div className="table-scroll">
            <table className="data-table fc-table release">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Contract ends</th>
                  <th className="r">Fair rank</th>
                  <th className="r">Traditional rank</th>
                  <th>Why he ranks high</th>
                </tr>
              </thead>
              <tbody>
                {review.map((p) => {
                  const reasons = keepReasons(p.i);
                  return (
                    <tr key={p.id}>
                      <td>
                        <a href={`#player/${p.id}`} className="strong-link">{p.name}</a>
                        <small className="muted block">
                          {p.position} · {p.ageShown} yrs · {p.team}
                        </small>
                      </td>
                      <td className="nowrap">{dateLabel(p.contractEnd)}</td>
                      <td className="r num strong">#{p.fairRank}</td>
                      <td className="r num">#{p.rawRank}</td>
                      <td>
                        <span className="chips">
                          {reasons.length ? reasons.map((r) => <span key={r} className="reason">{r}</span>) : <span className="reason">Fair rank #{p.fairRank} of {N}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {rest > 0 && review.length > 0 && <p className="attribute-footnote">The other {rest} expiring contracts belong to players outside the fair top 25%: not flagged.</p>}
      </section>

    </div>
  );
}
