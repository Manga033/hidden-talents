import { useMemo } from 'react';
import { useScout } from '../store.jsx';
import { ConfidencePill, Empty, FavButton, Flag, Icon, Notice, Panel, Portrait, RankMove, Tag, tagsOf } from '../components/ui.jsx';
import { C, Radar, RankInterval } from '../components/charts.jsx';
import { CATEGORY_LABELS, GROUP_NAME, money, supportReasons } from '../model/v3.js';

const METRICS = ['scoring', 'creation', 'progression', 'retention', 'defending', 'pressing', 'aerial', 'physical', 'availability'];
const SHORT = CATEGORY_LABELS;
const fmt2 = (v) => Number(v).toFixed(2);

const SPOT = { GK: [50, 91], CB: [50, 78], LB: [18, 72], RB: [82, 72], DM: [50, 62], CM: [50, 50], AM: [50, 37], LW: [18, 25], RW: [82, 25], ST: [50, 18] };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateLabel = (s) => {
  if (!s) return '–';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export default function Profile({ id }) {
  const { byId, players, notes, setNote, favs, toggleFav, addToCompare, can, allowed } = useScout();
  const p = byId[id];
  const ordered = useMemo(() => players.filter((x) => x.grp === p?.grp).sort((a, b) => a.fairRank - b.fairRank), [players, p?.grp]);
  if (!p) {
    return (
      <Empty title="This player is not in the current data." action={<a className="button" href="#players">Back to all players</a>}>
        The data may have been updated since this link was made.
      </Empty>
    );
  }
  const N = p.positionCount;
  const idx = ordered.findIndex((x) => x.id === p.id);
  const prev = ordered[idx - 1];
  const next = ordered[idx + 1];
  const tags = tagsOf(p);
  const saved = favs.includes(p.id);
  const radarKeys = METRICS.filter((m) => p.categories[m]?.weight > 0).slice(0, 6);
  const radarAxes = radarKeys.map((m) => SHORT[m]);
  const pct = radarKeys.map((m) => p.categories[m]?.score || 50);
  const sim = players.filter((x) => x.grp === p.grp && x.id !== p.id).map((q) => {
    const distance = Math.sqrt(radarKeys.reduce((sum, m) => sum + ((p.categories[m]?.score || 50) - (q.categories[m]?.score || 50)) ** 2, 0) / radarKeys.length);
    return { q, id: q.id, similarity: Math.max(0, Math.round(100 - distance)) };
  }).sort((a,b) => b.similarity-a.similarity).slice(0, 3);
  const why = supportReasons(p, 4);
  const per90 = p.minutes ? ((p.goals + p.assists) / p.minutes) * 90 : 0;
  const avgElo = players.reduce((s, x) => s + x.teamElo, 0) / players.length;

  return (
    <div className="fade-in profile">
      <div className="breadcrumb">
        <a href="#home">Discover</a>
        <Icon name="chevron" />
        <a href="#players">Players</a>
        <Icon name="chevron" />
        <span>{p.name}</span>
        <span className="crumb-nav">
          {prev && (
            <a href={`#player/${prev.id}`}>
              <Icon name="chevron-left" /> Fair #{prev.fairRank}
            </a>
          )}
          {next && (
            <a href={`#player/${next.id}`}>
              Fair #{next.fairRank} <Icon name="chevron" />
            </a>
          )}
        </span>
      </div>

      {p.releaseWarning && (
        <Notice tone="warn">
          <b>Contract ends {p.contractEnd ? dateLabel(p.contractEnd) : 'between July 2026 and June 2027'}</b> and he ranks #{p.fairRank} of {N} on the fair ranking: a transfer opportunity for a buying club, a contract to review for his own.
        </Notice>
      )}

      <section className="profile-banner">
        <div className="profile-photo" data-number={p.posRank}>
          <Portrait p={p} />
        </div>
        <div className="profile-identity">
          <span className="eyebrow">
            {GROUP_NAME[p.grp].toUpperCase()} · {p.position}
            {p.subPosition ? ` · ${p.subPosition}` : ''}
          </span>
          <h1>{p.name}</h1>
          <div className="player-meta">
            <Flag country={p.country} />
            <span>{p.country || 'Nationality unknown'}</span>
            <span className="dot-divider">·</span>
            <span>{p.ageShown} yrs</span>
            <span className="dot-divider">·</span>
            <span>{p.team}</span>
          </div>
          <div className="chips tag-row">
            {tags.map((t) => (
              <Tag key={t} label={t} />
            ))}
            <ConfidencePill level={p.conf} />
          </div>
          <div className="profile-facts">
            <span>
              <small>Born</small>
              <strong>{dateLabel(p.birthDate)}</strong>
            </span>
            <span>
              <small>Height</small>
              <strong>{p.heightCm ? `${p.heightCm} cm` : '–'}</strong>
            </span>
            <span>
              <small>Foot</small>
              <strong>{p.foot}</strong>
            </span>
            <span>
              <small>Minutes</small>
              <strong>{p.minutes.toLocaleString('en')}</strong>
            </span>
            {can('marketValue') && (
              <span>
                <small>Market value</small>
                <strong>{money(p.valueEnd)}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="profile-scores">
          <div className="score-pair">
            <div className="score-box">
              <small>Fair rank · {GROUP_NAME[p.grp].toLowerCase()}s</small>
              <strong>#{p.posRank}</strong>
              <span className="range">
                of {p.posCount} in his position
              </span>
            </div>
            <div className="score-box potential">
              <small>Traditional rank · {GROUP_NAME[p.grp].toLowerCase()}s</small>
              <strong>#{p.rawPosRank}</strong>
              <span className="range">
                of {p.posCount} · <RankMove d={p.rankChange} />
              </span>
            </div>
          </div>
          <div className="profile-actions">
            <button type="button" className="button button-outline" onClick={() => toggleFav(p.id)}>
              <Icon name="star" />
              {saved ? 'Saved' : 'Favourite'}
            </button>
            {allowed('compare') && (
              <button type="button" className="button" onClick={() => addToCompare(p.id)}>
                <Icon name="compare" />
                Compare
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="panel one-line">
        <div className="one-line-text">
          <span className="eyebrow">IN ONE LINE</span>
          <p className="verdict">
            {p.rankChange > 0
              ? `The fair ranking places ${p.name} ${p.rankChange} places higher than a traditional list (#${p.rawRank} → #${p.fairRank}).`
              : p.rankChange < 0
                ? `A traditional list rates ${p.name} ${-p.rankChange} places higher than his on-pitch numbers support (#${p.rawRank} → #${p.fairRank}).`
                : `Both rankings agree: #${p.fairRank}.`}
          </p>
        </div>
        <div className="chips">
          {why.map((r) => (
            <span key={r} className="reason">{r}</span>
          ))}
        </div>
      </section>

      <div className="profile-columns">
        <Panel title="Key metrics" right={<small>PERCENTILE IN POSITION</small>}>
          {METRICS.map((m) => {
            const v = Math.round(p.categories[m]?.score || 50);
            return (
              <div key={m} className={`attribute-row fact ${m === 'big90' ? 'dim' : ''}`}>
                <span className="attribute-name">{SHORT[m]}</span>
                <div className="attribute-ovr-bar" aria-hidden="true">
                  <i style={{ width: `${Math.max(3, v)}%`, background: v >= 75 ? C.wine : v >= 50 ? C.gold : '#b9b3b5' }} />
                </div>
                <strong className="attribute-ovr">{v}</strong>
                <p className="fact-text">{Math.round((p.categories[m]?.weight || 0) * 100)}% role weight · {Math.round((p.categories[m]?.reliability || 0) * 100)}% reliability</p>
              </div>
            );
          })}
        </Panel>
        <Panel title="The full picture" right={<small>VS POSITION AVERAGE</small>}>
          <Radar axes={radarAxes} series={[{ name: 'Position average', values: radarAxes.map(() => 50), color: '#9aa98c', dashed: true }, { name: p.name, values: pct, color: C.wine }]} />
          <div className="radar-legend">
            <span>
              <i />
              {p.name}
            </span>
            <span>
              <i className="potential-key" />
              Average {GROUP_NAME[p.grp].toLowerCase()}
            </span>
          </div>
        </Panel>
        <Panel title="How sure are we?" right={<ConfidencePill level={p.conf} />}>
          <RankInterval rank={p.fairRank} low={p.rankLow} high={p.rankHigh} N={N} />
          <p className="small-text">
            Likely fair rank: between <b>#{Math.round(p.rankLow)}</b> and <b>#{Math.round(p.rankHigh)}</b>. {p.minutes < 900 ? 'Few minutes so far, so the range is wide.' : ''}
          </p>
          <div className="robust">
            <strong>{Math.round(p.confValue * 100)}%</strong>
            <span>model confidence after minutes, event coverage and measurement reliability are considered.</span>
          </div>
          {(p.grp === 'DEF' || p.grp === 'GK') && <p className="small-text">Defenders and goalkeepers use their own role models, rather than being judged mainly by goals and assists.</p>}
          {p.scout && <p className="small-text">Top-25% numbers from only {p.minutes.toLocaleString('en')} minutes. Watch him live.</p>}
        </Panel>
      </div>

      <div className="profile-lower">
        <Panel title="The season so far" right={<small>2025 / 26</small>}>
          <div className="performance-stats">
            <span>
              <strong>{p.apps ?? '–'}</strong>
              <small>APPEARANCES</small>
            </span>
            <span>
              <strong>{p.minutes.toLocaleString('en')}</strong>
              <small>MINUTES</small>
            </span>
            <span>
              <strong>{p.goals}</strong>
              <small>GOALS</small>
            </span>
            <span>
              <strong>{p.assists}</strong>
              <small>ASSISTS</small>
            </span>
          </div>
          <table className="data-table">
            <tbody>
              <tr>
                <td>Goals + assists per 90 minutes</td>
                <td className="r num">{fmt2(per90)}</td>
              </tr>
              <tr>
                <td>Strength of his team (Elo rating)</td>
                <td className="r num">
                  {Math.round(p.teamElo)} <small className="muted">· average {Math.round(avgElo)}</small>
                </td>
              </tr>
              <tr>
                <td>Club</td>
                <td className="r">{p.team}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
        <Panel title="Where he plays" right={<small>LISTED POSITION</small>}>
          <div className="pitch-widget role-pitch">
            <div className="pitch-boundary" />
            <div className="pitch-halfway" />
            <span className="role-marker natural" style={{ left: `${SPOT[p.position]?.[0] ?? 50}%`, top: `${SPOT[p.position]?.[1] ?? 50}%` }}>
              {p.position}
            </span>
          </div>
          <div className="position-caption">
            <strong>
              {p.position} · {GROUP_NAME[p.grp]}
            </strong>
            <span>Compared with other {GROUP_NAME[p.grp].toLowerCase()}s</span>
          </div>
        </Panel>
      </div>

      <div className="profile-lower">
        <Panel title="Plays like" right={<small>CLOSEST PROFILES</small>}>
          {sim.map((s) => (
            <a key={s.id} href={`#player/${s.id}`} className="picker-row">
              <Portrait p={s.q} className="mini-avatar" />
              <span>
                <strong>
                  {s.q.name} <Flag country={s.q.country} />
                </strong>
                <small>
                  {s.q.position} · {s.q.ageShown} yrs · {s.q.team}
                </small>
              </span>
              <span className="picker-score">{s.similarity}%</span>
              <FavButton p={s.q} className="favourite-button inline" />
            </a>
          ))}
        </Panel>
        <Panel title="Scout notes" right={<small>SAVED ON THIS DEVICE</small>}>
          <label className="notes">
            <span className="sr-only">Scout notes</span>
            <textarea rows={6} placeholder="What the data cannot see: decisions, attitude, leadership, injuries…" value={notes[p.id] || ''} onChange={(e) => setNote(p.id, e.target.value)} />
          </label>
        </Panel>
      </div>
    </div>
  );
}
