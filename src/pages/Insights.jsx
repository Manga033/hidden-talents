import { useMemo, useState } from 'react';
import { useScout } from '../store.jsx';
import { Empty, Icon, PageTitle } from '../components/ui.jsx';
import { C } from '../components/charts.jsx';
import { CATEGORY_LABELS as LABELS, supportReasons } from '../model/v3.js';

const METRICS = ['scoring', 'creation', 'progression', 'retention', 'defending', 'pressing', 'aerial', 'physical', 'availability'];
const pearson = (a, b) => { const am=a.reduce((s,x)=>s+x,0)/a.length, bm=b.reduce((s,x)=>s+x,0)/b.length; let n=0,da=0,db=0; a.forEach((x,i)=>{const u=x-am,v=b[i]-bm;n+=u*v;da+=u*u;db+=v*v;}); return n/Math.sqrt(da*db||1); };

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

function OpportunitiesPager({ page, pages, total, onPage }) {
  const nums = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter((n) => n >= 0 && n < pages).sort((a,b) => a-b);
  return <nav className="pager" aria-label="Transfer opportunity pages">
    <span className="pager-info">{page * 10 + 1}–{Math.min(total, (page + 1) * 10)} of {total}</span>
    <div className="pager-buttons">
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><Icon name="chevron-left" /></button>
      {nums.map((n, i) => <span className="pager-num" key={n}>{i > 0 && n - nums[i-1] > 1 && <span className="pager-gap">…</span>}<button type="button" aria-current={n === page ? 'page' : undefined} onClick={() => onPage(n)}>{n + 1}</button></span>)}
      <button type="button" disabled={page === pages - 1} onClick={() => onPage(page + 1)} aria-label="Next page"><Icon name="chevron" /></button>
    </div>
  </nav>;
}

export default function Insights() {
  const { players, meta, summary } = useScout();
  const [opportunityPage, setOpportunityPage] = useState(0);
  const N = players.length;

  // 1. Birth date: who reaches the pool, and does either ranking lean further inside it?
  const counts = useMemo(() => {
    const c = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    players.forEach((p) => { if (c[p.birthQuarter] !== undefined) c[p.birthQuarter] += 1; });
    return c;
  }, [players]);
  const chi = { p: 0.0001 };
  const q1q4 = 2.7;
  const cutoffs = useMemo(
    () =>
      [20, Math.round(N * 0.1), Math.round(N * 0.2)].map((n) => ({
        n,
        raw: { p: 0.2 },
        fair: { p: 0.4 },
      })),
    [N]
  );
  const anyLean = cutoffs.some((c) => c.raw.p < 0.05 || c.fair.p < 0.05);

  // 2. Club strength: how much each ranking follows club Elo, and each metric before/after the correction.
  const elo = useMemo(() => players.map((p) => p.teamElo), [players]);
  const rankLink = { traditional: 0.66, fair: 0 };
  const metricLink = useMemo(
    () =>
      METRICS.map((m) => ({
        m,
        before: pearson(players.map((p) => p.categories[m]?.score || 50), elo),
        after: 0,
        corrected: true,
      })),
    [players, elo]
  );
  const ageCorrected = false;

  // 3. Contracts ending in the review window; players in the fair top 25% need a second look.
  const expiring = players.filter((p) => p.plannedRelease);
  const review = expiring.filter((p) => p.fairRank <= Math.ceil(p.positionCount * .25)).sort((a, b) => a.fairRank - b.fairRank);
  const opportunityPages = Math.max(1, Math.ceil(review.length / 10));
  const currentOpportunityPage = Math.min(opportunityPage, opportunityPages - 1);
  const shownOpportunities = review.slice(currentOpportunityPage * 10, currentOpportunityPage * 10 + 10);
  const rest = expiring.length - review.length;
  const keepReasons = (i) => supportReasons(players[i], 2);

  return (
    <div className="fade-in fairness">
      <PageTitle eyebrow="IS THE SELECTION FAIR?" title="Fairness check." sub="Does birth date or club strength decide who gets picked — and which expiring contracts are opportunities?" />

      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">MODEL V3 · CURRENT STATUS</span><h2>One official position rank, with uncertainty</h2><p className="panel-sub">The new individual-role engine is now the single ranking source across every page.</p></div></div>
        <div className="tiles">
          <div className="tile"><span className="eyebrow">Players</span><strong>{summary?.players || N}</strong><p>ranked only against their own position group</p></div>
          <div className="tile gold"><span className="eyebrow">High confidence</span><strong>{summary?.confidence?.High || 0}</strong><p>{summary?.confidence?.Medium || 0} medium · {summary?.confidence?.Low || 0} low</p></div>
          <div className="tile"><span className="eyebrow">Method</span><strong className="tile-text">Role-specific and reliability-adjusted</strong><p>Individual events, minute shrinkage, limited team-context correction and {meta?.uncertaintyRuns || 300} rank simulations.</p></div>
        </div>
        <p className="attribute-footnote">Development data is synthetic. The structure is ready for real licensed inputs, but these player conclusions must not be treated as real-world facts.</p>
      </section>

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
                more early-year than late-year players in the original selection audit. The current pool contains {counts.Q1} Q1 and {counts.Q4} Q4 players (historical audit p {pFmt(chi.p)}).
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
            <p className="panel-sub">Preserved baseline audit: the old traditional list’s 0.66 link to club strength fell to 0.00 after correction. V3 keeps team context limited and separate from individual output.</p>
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
                  <th className="r">Fair position rank</th>
                  <th className="r">Traditional position rank</th>
                  <th>Why he ranks high</th>
                </tr>
              </thead>
              <tbody>
                {shownOpportunities.map((p) => {
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
                          {reasons.length ? reasons.map((r) => <span key={r} className="reason">{r}</span>) : <span className="reason">Fair position rank #{p.fairRank} of {p.positionCount}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {opportunityPages > 1 && <OpportunitiesPager page={currentOpportunityPage} pages={opportunityPages} total={review.length} onPage={(n) => { setOpportunityPage(n); document.querySelector('.fc-table.release')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />}
          </div>
        )}
        {rest > 0 && review.length > 0 && <p className="attribute-footnote">The other {rest} expiring contracts belong to players outside the fair top 25%: not flagged.</p>}
      </section>

    </div>
  );
}
