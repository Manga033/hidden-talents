import { useRef, useState } from 'react';
import { signed } from '../engine/explain.js';

/* Hand-drawn SVG charts in the template's palette: wine = player / fair, green = comparison, gold = potential. */
export const C = { wine: '#831b2d', green: '#6f8a62', gold: '#b48a49', blue: '#3f6fa8', grey: '#b9b3b5', line: '#e8e4e1', text: '#8f858a', ink: '#23242a' };

// Radar of percentiles (0–100) inside the position group. Series: [{name, values, color, dashed}]
export function Radar({ axes, series, size = 300 }) {
  const cx = 150;
  const cy = 128;
  const R = 92;
  const n = axes.length;
  const pt = (i, v) => {
    const a = ((i * 360) / n - 90) * (Math.PI / 180);
    return [cx + Math.cos(a) * R * (v / 100), cy + Math.sin(a) * R * (v / 100)];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const label = series.map((s) => `${s.name}: ${axes.map((a, i) => `${a} ${Math.round(s.values[i])}th percentile`).join(', ')}`).join('. ');
  return (
    <svg className="radar-chart" viewBox="0 0 300 262" style={{ maxWidth: size }} role="img" aria-label={`Radar chart of percentiles within the position. ${label}`}>
      {[100, 75, 50, 25].map((v) => (
        <polygon key={v} points={poly(axes.map(() => v))} fill={v === 100 ? '#faf9f6' : 'none'} stroke={v === 50 ? '#d9cfd2' : C.line} strokeWidth={v === 50 ? 1.1 : 0.8} strokeDasharray={v === 50 ? '3 3' : undefined} />
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 100);
        return <line key={a} x1={cx} y1={cy} x2={x} y2={y} stroke="#eee9e6" strokeWidth=".7" />;
      })}
      {series.map((s) => (
        <g key={s.name}>
          <polygon points={poly(s.values)} fill={`${s.color}22`} stroke={s.color} strokeWidth="1.7" strokeDasharray={s.dashed ? '3 3' : undefined} />
          {s.values.map((v, i) => {
            const [x, y] = pt(i, v);
            return (
              <circle key={i} cx={x} cy={y} r="2.4" fill={s.color}>
                <title>{`${s.name} · ${axes[i]}: ${Math.round(v)}th percentile`}</title>
              </circle>
            );
          })}
        </g>
      ))}
      {axes.map((a, i) => {
        const [x, y] = pt(i, 124);
        return (
          <text key={a} x={x} y={y + 3} textAnchor="middle">
            {a}
          </text>
        );
      })}
    </svg>
  );
}

// Horizontal diverging bars: each metric's points above/below the position average, split performance / context.
export function ContributionBars({ parts, labels, max }) {
  const W = 560;
  const rowH = 34;
  const H = parts.length * rowH + 24;
  const mid = 300;
  const span = 230;
  const m = max || Math.max(4, ...parts.map((p) => Math.abs(p.perf) + Math.abs(p.ctx)));
  const x = (v) => mid + (v / m) * span;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="contrib-chart" role="img" aria-label={parts.map((p) => `${labels[p.metric]}: ${signed(p.perf + p.ctx)} points`).join('. ')}>
      <line x1={mid} x2={mid} y1="4" y2={H - 18} stroke="#cfc6c9" />
      {parts.map((p, k) => {
        const y = 8 + k * rowH;
        const perfEnd = x(p.perf);
        const ctxEnd = x(p.perf + p.ctx);
        return (
          <g key={p.metric}>
            <text x="4" y={y + 15} className="c-label">
              {labels[p.metric]}
              {p.weight === 0 ? ' (weight 0)' : ''}
            </text>
            <rect x={Math.min(mid, perfEnd)} y={y + 4} width={Math.max(1, Math.abs(perfEnd - mid))} height="16" rx="2" fill={p.perf >= 0 ? C.wine : '#c9a2ab'} opacity={p.weight === 0 ? 0.25 : 1}>
              <title>{`Performance: ${signed(p.perf)} pts`}</title>
            </rect>
            {Math.abs(p.ctx) > 0.05 && (
              <rect x={Math.min(perfEnd, ctxEnd)} y={y + 4} width={Math.max(1, Math.abs(ctxEnd - perfEnd))} height="16" rx="2" fill={C.gold} opacity=".85">
                <title>{`Context correction (age + team strength): ${signed(p.ctx)} pts`}</title>
              </rect>
            )}
            <text x={W - 4} y={y + 15} textAnchor="end" className="c-val">
              {signed(p.perf + p.ctx)}
            </text>
          </g>
        );
      })}
      <text x={mid - 6} y={H - 4} textAnchor="end" className="c-axis">
        ◀ below position average
      </text>
      <text x={mid + 6} y={H - 4} className="c-axis">
        above position average ▶
      </text>
    </svg>
  );
}

// The likely rank range from the Monte Carlo (10th–90th percentile) on a 1..N axis.
export function RankInterval({ rank, low, high, N, color = C.wine, compact }) {
  const W = 520;
  const H = compact ? 34 : 54;
  const l = 12;
  const r = W - 12;
  const x = (v) => l + ((v - 1) / (N - 1)) * (r - l);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Rank ${rank}, likely between ${Math.round(low)} and ${Math.round(high)} of ${N}`} className="interval-chart">
      <line x1={l} x2={r} y1="16" y2="16" stroke="#ece8e5" strokeWidth="6" strokeLinecap="round" />
      <line x1={x(low)} x2={x(high)} y1="16" y2="16" stroke={color} strokeOpacity=".35" strokeWidth="6" strokeLinecap="round" />
      <circle cx={x(rank)} cy="16" r="6" fill={color} stroke="#fff" strokeWidth="2" />
      {!compact && (
        <>
          <text x={l} y="44" className="c-axis">#1</text>
          <text x={r} y="44" textAnchor="end" className="c-axis">#{N}</text>
          <text x={x(low)} y="44" textAnchor="middle" className="c-axis strong">#{Math.round(low)}</text>
          <text x={x(high)} y="44" textAnchor="middle" className="c-axis strong">#{Math.round(high)}</text>
        </>
      )}
    </svg>
  );
}

// Raw rank (x) vs fair rank (y). Above the diagonal = the fair ranking rates the player higher.
export function RankScatter({ players, name, onPick, highlight }) {
  const W = 620;
  const H = 440;
  const m = { l: 52, r: 16, t: 16, b: 44 };
  const n = players.length;
  const X = (v) => m.l + ((v - 1) / (n - 1)) * (W - m.l - m.r);
  const Y = (v) => m.t + ((v - 1) / (n - 1)) * (H - m.t - m.b);
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const kind = (p) => (p.hidden ? 'hidden' : p.early ? 'early' : 'other');
  const ordered = [...players].sort((a, b) => (kind(a) === 'other' ? -1 : 1) - (kind(b) === 'other' ? -1 : 1));
  const ticks = [1, 100, 200, 300, 400, n].filter((t, i, a) => t <= n && a.indexOf(t) === i);
  const nearest = (e) => {
    const b = ref.current.getBoundingClientRect();
    const px = ((e.clientX - b.left) / b.width) * W;
    const py = ((e.clientY - b.top) / b.height) * H;
    let best = null;
    let d0 = 14 * 14;
    players.forEach((p) => {
      const d = (X(p.rawRank) - px) ** 2 + (Y(p.fairRank) - py) ** 2;
      if (d < d0) {
        d0 = d;
        best = p;
      }
    });
    return best;
  };
  const col = { hidden: C.gold, early: C.blue, other: '#cfc8ca' };
  return (
    <div className="chart-wrap">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Scatter of raw rank against fair rank for every player. Points above the dashed diagonal are rated higher by the fair ranking."
        onMouseMove={(e) => setHover(nearest(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const p = nearest(e);
          if (p) onPick(p);
        }}
        style={{ cursor: hover ? 'pointer' : 'default' }}
      >
        <polygon points={`${X(1)},${Y(1)} ${X(n)},${Y(1)} ${X(n)},${Y(n)}`} fill="#faf5ec" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={Y(t)} y2={Y(t)} stroke="#f0edeb" />
            <text x={m.l - 8} y={Y(t) + 4} textAnchor="end" className="c-axis">{t}</text>
            <text x={X(t)} y={H - m.b + 16} textAnchor="middle" className="c-axis">{t}</text>
          </g>
        ))}
        <line x1={X(1)} y1={Y(1)} x2={X(n)} y2={Y(n)} stroke="#a59b9f" strokeDasharray="5 5" />
        <text x={X(n) - 6} y={Y(1) + 16} textAnchor="end" className="c-axis strong" fill={C.gold}>Fair ranks them higher</text>
        <text x={X(1) + 6} y={Y(n) - 8} className="c-axis strong">Traditional list ranks them higher</text>
        <text x={(m.l + W - m.r) / 2} y={H - 6} textAnchor="middle" className="c-label">Traditional rank (goals, assists, market value) →</text>
        <text x={14} y={(m.t + H - m.b) / 2} textAnchor="middle" className="c-label" transform={`rotate(-90 14 ${(m.t + H - m.b) / 2})`}>Fair rank →</text>
        {ordered.map((p) => {
          const k = kind(p);
          const hl = highlight && highlight.includes(p.id);
          return <circle key={p.id} cx={X(p.rawRank)} cy={Y(p.fairRank)} r={k === 'other' ? 3.2 : 5.5} fill={col[k]} stroke={hover?.id === p.id || hl ? C.ink : '#fff'} strokeWidth={hover?.id === p.id || hl ? 2 : 1} />;
        })}
      </svg>
      {hover && (
        <div className="tip" style={{ left: `${(X(hover.rawRank) / W) * 100}%`, top: `${(Y(hover.fairRank) / H) * 100}%` }}>
          <b>{name(hover)}</b>
          <span>
            {hover.position} · traditional #{hover.rawRank} → fair #{hover.fairRank}
          </span>
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: C.gold }} />Hidden talent</span>
        <span><i style={{ background: C.blue }} />Early-peaker risk</span>
        <span><i style={{ background: '#cfc8ca' }} />Other players</span>
        <span><i className="dash" />Same rank in both</span>
      </div>
    </div>
  );
}

// Birth quarters of the top N: raw vs fair, with the number expected if selection ignored birth date.
export function QuarterBars({ pool, raw, fair }) {
  const W = 620;
  const H = 260;
  const base = 206;
  const top = 18;
  const qs = ['Q1', 'Q2', 'Q3', 'Q4'];
  const months = { Q1: 'Jan–Mar', Q2: 'Apr–Jun', Q3: 'Jul–Sep', Q4: 'Oct–Dec' };
  const total = qs.reduce((s, q) => s + (pool[q] || 0), 0) || 1;
  const picked = qs.reduce((s, q) => s + (raw[q] || 0), 0) || 20;
  const exp = (q) => ((pool[q] || 0) / total) * picked;
  const maxY = Math.ceil(Math.max(...qs.map((q) => Math.max(raw[q] || 0, fair[q] || 0, exp(q))), 4) / 2) * 2;
  const y = (v) => base - (v / maxY) * (base - top);
  const bw = 40;
  const cx = (i) => 110 + i * 140;
  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Birth quarters of the top ${picked}. Raw ${qs.map((q) => `${q} ${raw[q] || 0}`).join(', ')}. Fair ${qs.map((q) => `${q} ${fair[q] || 0}`).join(', ')}.`}>
        {Array.from({ length: maxY / 2 + 1 }, (_, k) => k * 2).map((v) => (
          <g key={v}>
            <line x1="48" x2={W - 12} y1={y(v)} y2={y(v)} stroke="#f0edeb" />
            <text x="40" y={y(v) + 4} textAnchor="end" className="c-axis">{v}</text>
          </g>
        ))}
        {qs.map((q, i) => (
          <g key={q}>
            <rect x={cx(i) - bw - 1} y={y(raw[q] || 0)} width={bw} height={base - y(raw[q] || 0)} rx="3" fill="#c9bfc2" />
            <rect x={cx(i) + 1} y={y(fair[q] || 0)} width={bw} height={base - y(fair[q] || 0)} rx="3" fill={C.wine} />
            <text x={cx(i) - bw / 2} y={y(raw[q] || 0) - 5} textAnchor="middle" className="c-val">{raw[q] || 0}</text>
            <text x={cx(i) + bw / 2} y={y(fair[q] || 0) - 5} textAnchor="middle" className="c-val">{fair[q] || 0}</text>
            <line x1={cx(i) - bw - 8} x2={cx(i) + bw + 8} y1={y(exp(q))} y2={y(exp(q))} stroke={C.ink} strokeDasharray="4 3" strokeWidth="1.3">
              <title>{`${q}: ${exp(q).toFixed(1)} expected from the pool`}</title>
            </line>
            <text x={cx(i)} y={base + 18} textAnchor="middle" className="c-label strong">{q}</text>
            <text x={cx(i)} y={base + 33} textAnchor="middle" className="c-axis">{months[q]} · {pool[q] || 0} in pool</text>
          </g>
        ))}
      </svg>
      <div className="legend">
        <span><i style={{ background: '#c9bfc2' }} />Traditional top {picked}</span>
        <span><i style={{ background: C.wine }} />Fair top {picked}</span>
        <span><i className="dash" />Expected if birth date played no part</span>
      </div>
    </div>
  );
}

// A thin percentile bar with the position average marked.
export function PctBar({ value, color = '#9aa98c' }) {
  return (
    <span className="pct-bar" aria-hidden="true">
      <i style={{ width: `${Math.max(2, value)}%`, background: color }} />
      <b />
    </span>
  );
}
