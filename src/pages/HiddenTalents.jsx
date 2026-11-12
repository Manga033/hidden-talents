import { useMemo, useState } from 'react';
import { useScout } from '../store.jsx';
import ModelNotice from '../components/ModelNotice.jsx';
import { ConfidencePill, Empty, Flag, Icon, PageTitle, Panel, Portrait } from '../components/ui.jsx';
import { RankScatter } from '../components/charts.jsx';
import { RULES } from '../engine/constants.js';
import { breakdown, rawBreakdown } from '../engine/engine.js';
import { money, reasonChips, signed } from '../engine/explain.js';
import { mean } from '../engine/stats.js';

export default function HiddenTalents() {
  const { players, nm, navigate, ctx, base, res } = useScout();
  const [allPeakers, setAllPeakers] = useState(false);
  const risers = useMemo(() => players.filter((p) => p.hidden).sort((a, b) => a.fairRank - b.fairRank), [players]);
  const peakers = useMemo(() => players.filter((p) => p.early).sort((a, b) => a.rawRank - b.rawRank), [players]);
  const watch = useMemo(() => players.filter((p) => p.scout).sort((a, b) => b.upside - a.upside).slice(0, 9), [players]);

  // What the hidden talents have in common, measured against everyone else.
  const profile = useMemo(() => {
    const others = players.filter((p) => !p.hidden);
    const val = (arr) => mean(arr.map((p) => p.valueEnd || 0));
    const elo = (arr) => mean(arr.map((p) => p.teamElo));
    const mins = (arr) => mean(arr.map((p) => p.minutes));
    const eloPts = (arr) => mean(arr.map((p) => breakdown(base, res, p.i).elo));
    const valPts = (arr) => mean(arr.map((p) => rawBreakdown(base, res, p.i).value));
    return {
      n: risers.length,
      value: [val(risers), val(others)],
      elo: [elo(risers), elo(others)],
      mins: [mins(risers), mins(others)],
      eloPts: eloPts(risers),
      valPts: valPts(risers),
      q34: risers.filter((p) => p.bq >= 3).length,
    };
  }, [players, risers, base, res]);

  return (
    <div className="fade-in">
      <PageTitle
        eyebrow="BELOW THE RADAR"
        title="Hidden talents."
        sub="Players the fair ranking rates far higher than a traditional list — and players whose high raw rank is mostly price tag."
      />

      <ModelNotice />
      <div className="tiles">
        <div className="tile gold">
          <span className="eyebrow">Hidden talents</span>
          <strong>{risers.length}</strong>
          <p>{RULES.hidden}</p>
        </div>
        <div className="tile">
          <span className="eyebrow">Early-peaker risk</span>
          <strong>{peakers.length}</strong>
          <p>{RULES.early}</p>
        </div>
        <div className="tile">
          <span className="eyebrow">What they share</span>
          <strong className="tile-text">{money(profile.value[0])} avg value</strong>
          <p>
            vs {money(profile.value[1])} for everyone else, and they play for {profile.elo[0] < profile.elo[1] ? 'weaker' : 'stronger'} teams (Elo {Math.round(profile.elo[0])} vs {Math.round(profile.elo[1])}). {profile.value[0] < profile.value[1] ? 'A lower price tag keeps them down traditional lists; their on-pitch numbers do not.' : ''}
          </p>
        </div>
      </div>

      <div className="hidden-grid">
        <Panel title="Raw rank against fair rank" sub={`All ${players.length} players. Hover a dot for the name; click to open the profile.`}>
          <RankScatter players={players} name={nm} onPick={(p) => navigate('player', p.id)} />
        </Panel>
        <Panel title="Biggest risers" sub="Traditional rank → fair rank, and the main reasons">
          {!risers.length ? (
            <Empty title="No hidden talents under these weights." />
          ) : (
            <div className="riser-list">
              {risers.map((p) => (
                <a key={p.id} href={`#player/${p.id}`} className="riser">
                  <Portrait p={p} className="mini-avatar" />
                  <span className="riser-main">
                    <span className="riser-line">
                      <b>{nm(p)}</b>
                      <Flag country={p.country} />
                      <small>
                        {p.position} · {p.ageShown} yrs
                      </small>
                      <span className="riser-move">
                        #{p.rawRank} → #{p.fairRank}
                      </span>
                    </span>
                    <span className="chips">
                      {reasonChips(ctx, p.i).map((r) => (
                        <span key={r} className="reason">{r}</span>
                      ))}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="stack hidden-lower">
        <Panel title="Early-peaker risk" sub="Top of the traditional list, but the on-pitch numbers do not follow. Look again before a big fee or long contract.">
          {!peakers.length ? (
            <Empty title="No early-peaker risks under these weights." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th className="r">Traditional #</th>
                    <th className="r">Fair #</th>
                    <th className="r">Value</th>
                    <th className="r">From value</th>
                    <th className="r">Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {(allPeakers ? peakers : peakers.slice(0, 10)).map((p) => (
                    <tr key={p.id}>
                      <td>
                        <a href={`#player/${p.id}`} className="strong-link">{nm(p)}</a> <Flag country={p.country} /> <small className="muted">{p.position} · {p.team}</small>
                      </td>
                      <td className="r num">{p.rawRank}</td>
                      <td className="r num neg">{p.fairRank}</td>
                      <td className="r num">{money(p.valueEnd)}</td>
                      <td className="r num">{signed(rawBreakdown(base, res, p.i).value)}</td>
                      <td className="r num">{p.minutes.toLocaleString('en')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {peakers.length > 10 && (
                <div className="more-row">
                  <button type="button" className="button button-outline" onClick={() => setAllPeakers((v) => !v)}>
                    {allPeakers ? 'Show top 10' : `Show all ${peakers.length}`}
                  </button>
                </div>
              )}
            </div>
          )}
          <p className="attribute-footnote">"From value" = how many points of his traditional score come from his market value alone. A big number with a low fair rank means the list is paying for reputation.</p>
        </Panel>
        <Panel title="Watch next" sub={RULES.scout}>
          {!watch.length ? (
            <Empty title="Nobody meets the scout-live rule." />
          ) : (
            <div className="watch-grid">
              {watch.map((p) => (
                <a key={p.id} href={`#player/${p.id}`} className="watch">
                  <b>
                    {nm(p)} <Flag country={p.country} />
                  </b>
                  <small>
                    {p.position} · {p.minutes.toLocaleString('en')} min · fair {p.fairScore} → potential up to {p.potentialHigh}
                  </small>
                  <small>
                    Likely rank #{Math.round(p.rankLow)}–#{Math.round(p.rankHigh)}
                  </small>
                  <ConfidencePill level={p.conf} />
                </a>
              ))}
            </div>
          )}
          <p className="attribute-footnote">
            <Icon name="info" /> {profile.q34} of {profile.n} hidden talents were born July–December.
          </p>
        </Panel>
      </div>
    </div>
  );
}
