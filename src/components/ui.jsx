import { useEffect, useMemo, useRef, useState } from 'react';
import { useScout } from '../store.jsx';
import { GROUP_FROM_NAME, RULES } from '../engine/constants.js';
import { flagCode } from '../lib/flags.js';

export const Icon = ({ name, className = '' }) => (
  <svg className={`icon ${className}`} aria-hidden="true">
    <use href={`#i-${name}`} />
  </svg>
);

// Scoutee logo: wine tile with a single lowercase "s" and the gold dot, plus the two-weight wordmark.
export function Logo({ tagline = 'SEE THE POTENTIAL.', className = '' }) {
  return (
    <span className={`brand ${className}`}>
      <span className="brand-mark logo-mark" aria-hidden="true">
        s<i />
      </span>
      <span className="logo-word">
        <span className="logo-name">
          SCOUT<span className="brand-light">EE</span>
        </span>
        {tagline && <small>{tagline}</small>}
      </span>
    </span>
  );
}

// Country flag (flag-icons, 4:3). Falls back to nothing when the country is unknown.
export function Flag({ country, className = '' }) {
  const code = flagCode(country);
  if (!code) return null;
  return <span className={`fi fi-${code} flag-img ${className}`} role="img" aria-label={country} title={country} />;
}

const TINT = { GK: ['#2f5a4f', '#5a8f7f'], DEF: ['#3d3552', '#6e6390'], MID: ['#6b3348', '#b86571'], FWD: ['#7a2a36', '#c9707a'] };
// No photographs: these are real people (many under 21). A neutral silhouette in the template's card style.
export function Portrait({ p, className = 'player-portrait' }) {
  const g = p.grp || GROUP_FROM_NAME[p.positionGroup] || 'MID';
  const [a, b] = TINT[g];
  const uid = `sg-${p.id}-${className.replace(/\W/g, '')}`;
  return (
    <div className={`${className} silhouette`} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMax meet">
        <defs>
          <linearGradient id={uid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={b} />
            <stop offset="1" stopColor={a} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="34" r="17" fill={`url(#${uid})`} />
        <path d="M14 100c0-25 15-44 36-44s36 19 36 44z" fill={`url(#${uid})`} />
        <path d="M40 57l10 11 10-11" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2.5" />
      </svg>
    </div>
  );
}

export function FavButton({ p, className = 'favourite-button' }) {
  const { favs, toggleFav } = useScout();
  const on = favs.includes(p.id);
  return (
    <button
      type="button"
      className={`${className} ${on ? 'saved' : ''}`}
      aria-pressed={on}
      aria-label={`${on ? 'Remove' : 'Add'} ${p.name} ${on ? 'from' : 'to'} favourites`}
      title={on ? 'Remove from favourites' : 'Add to favourites'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleFav(p.id);
      }}
    >
      <Icon name="star" />
    </button>
  );
}

const TAG_CLASS = { 'Hidden Talent': 'tag-gold', 'Priced above output': 'tag-blue', 'Watch Live': 'tag-green', 'Transfer opportunity': 'tag-wine' };
const TAG_RULE = { 'Hidden Talent': RULES.hidden, 'Priced above output': RULES.early, 'Watch Live': RULES.scout, 'Transfer opportunity': RULES.release };
export const Tag = ({ label }) => (
  <span className={`tag ${TAG_CLASS[label] || ''}`} title={TAG_RULE[label] || undefined}>
    {label}
  </span>
);
export const tagsOf = (p) => [...(p.tags || []), p.releaseWarning && 'Transfer opportunity'].filter(Boolean);

export function RankMove({ d, compact }) {
  if (!d) return <span className="move flat">{compact ? '=' : 'no change'}</span>;
  return (
    <span className={`move ${d > 0 ? 'up' : 'down'}`} title={`${Math.abs(d)} places ${d > 0 ? 'higher' : 'lower'} in the fair ranking than in the traditional ranking`}>
      {d > 0 ? '▲' : '▼'}
      {Math.abs(d)}
    </span>
  );
}

export function Panel({ title, sub, right, children, className = '', ...rest }) {
  return (
    <section className={`panel ${className}`} {...rest}>
      {(title || sub || right) && (
        <div className="panel-heading">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p className="panel-sub">{sub}</p>}
          </div>
          {right && <div className="panel-right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ eyebrow, title, sub, right }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {right && <div className="title-actions">{right}</div>}
    </div>
  );
}

export function Seg({ options, value, onChange, label, small }) {
  return (
    <div className={`seg ${small ? 'small' : ''}`} role="group" aria-label={label}>
      {options.map(([v, t]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {t}
        </button>
      ))}
    </div>
  );
}

export function ModeToggle({ small }) {
  const { mode, setMode } = useScout();
  return <Seg small={small} label="Ranking view" value={mode} onChange={setMode} options={[['raw', 'Traditional'], ['fair', 'Fair']]} />;
}

export function Empty({ icon = 'search', title, children, action }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Notice({ tone = 'info', icon, children }) {
  return (
    <div className={`notice ${tone}`} role={tone === 'warn' ? 'alert' : undefined}>
      <Icon name={icon || (tone === 'warn' ? 'alert' : 'info')} />
      <div>{children}</div>
    </div>
  );
}

// Modal built on <dialog>, like the template's player picker.
export function Dialog({ title, eyebrow, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const onCancel = (e) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function PlayerPicker({ exclude = [], onPick, onClose, title = 'Select a player' }) {
  const { players, mode } = useScout();
  const [q, setQ] = useState('');
  const [grp, setGrp] = useState('All');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return players
      .filter((p) => (grp === 'All' || p.grp === grp) && (!t || `${p.name} ${p.team} ${p.position} ${p.country || ''}`.toLowerCase().includes(t)))
      .sort((a, b) => (mode === 'fair' ? a.fairRank - b.fairRank : a.rawRank - b.rawRank))
      .slice(0, 80);
  }, [players, q, grp, mode]);
  return (
    <Dialog title={title} eyebrow="BUILD YOUR COMPARISON" onClose={onClose}>
      <div className="picker-tools">
        <label className="search-box bordered">
          <Icon name="search" />
          <input autoFocus type="search" placeholder="Search name, club, position or country" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        </label>
        <Seg small label="Position group" value={grp} onChange={setGrp} options={[['All', 'All'], ['GK', 'Goalkeepers'], ['DEF', 'Defenders'], ['MID', 'Midfielders'], ['FWD', 'Forwards']]} />
      </div>
      <div id="picker-list">
        {list.map((p) => (
          <button key={p.id} type="button" className="picker-row" disabled={exclude.includes(p.id)} onClick={() => onPick(p.id)}>
            <Portrait p={p} className="mini-avatar" />
            <span>
              <strong>
                {p.name} <Flag country={p.country} />
              </strong>
              <small>
                {p.position} · {p.ageShown} yrs · {p.team} · fair #{p.fairRank}
              </small>
            </span>
            <span className="picker-score">#{mode === 'fair' ? p.fairRank : p.rawRank}</span>
            <Icon name="plus" />
          </button>
        ))}
        {!list.length && <p className="muted-line">No player matches. Try another name.</p>}
      </div>
    </Dialog>
  );
}

// The template's catalogue card, driven by the engine output.
export function PlayerCard({ p }) {
  const { mode, addToCompare, allowed } = useScout();
  const tags = tagsOf(p);
  return (
    <article className={`player-card ${p.hidden ? 'is-hidden-talent' : ''}`}>
      <a className="card-visual" href={`#player/${p.id}`} aria-label={`View ${p.name}'s profile`}>
        <span className="card-number" title={`Rank among ${p.positionGroup.toLowerCase()}s (overall #${mode === 'fair' ? p.fairRank : p.rawRank})`}>{String(mode === 'fair' ? p.posRank : p.rawPosRank).padStart(2, '0')}</span>
        <Portrait p={p} />
        <span className="position-tag">
          <i />
          {p.position} <span>/</span> {p.positionGroup.toUpperCase()}
        </span>
      </a>
      <FavButton p={p} />
      <div className="card-content">
        <a className="player-name" href={`#player/${p.id}`}>
          {p.name}
        </a>
        <div className="player-meta">
          <Flag country={p.country} />
          <span>{p.ageShown} yrs</span>
          <span className="dot-divider">·</span>
          <span className="club">{p.team}</span>
        </div>
        <div className="card-ratings">
          {/* The big number on the card is the rank inside his position for the current view; this line gives the other one. */}
          <span>
            {mode === 'fair' ? 'Traditional' : 'Fair'} <strong>#{mode === 'fair' ? p.rawPosRank : p.posRank}</strong> in position
          </span>
          <span>
            <RankMove d={p.rawPosRank - p.posRank} compact />
          </span>
        </div>
        <div className="card-bottom">
          <span className="card-tags">{tags.length ? tags.slice(0, 2).map((t) => <Tag key={t} label={t} />) : <span className="conf-dot">{p.conf} confidence</span>}</span>
          {allowed('compare') && (
            <button type="button" onClick={() => addToCompare(p.id)}>
              <Icon name="plus" /> Compare
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export const ConfidencePill = ({ level }) => <span className={`conf-pill ${String(level).toLowerCase()}`}>{level} confidence</span>;
