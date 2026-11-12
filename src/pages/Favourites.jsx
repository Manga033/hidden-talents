import { useScout } from '../store.jsx';
import { Empty, Icon, PageTitle, PlayerCard } from '../components/ui.jsx';

export default function Favourites() {
  const { favs, byId, setCompare, navigate } = useScout();
  const saved = favs.map((id) => byId[id]).filter(Boolean);
  return (
    <div className="fade-in">
      <PageTitle
        eyebrow="YOUR SCOUTING BOARD"
        title="A few names to remember."
        sub="The players who caught your eye, with the evidence one click away."
        right={
          <a className="button button-outline" href="#players">
            <Icon name="plus" />
            Discover more
          </a>
        }
      />
      <div className="favourites-banner">
        <Icon name="star" />
        <div>
          <h3>
            {saved.length} {saved.length === 1 ? 'player' : 'players'}. A lot of possibility.
          </h3>
          <p>Saved in this browser only. Compare two of them to see exactly where the gap comes from.</p>
        </div>
        {saved.length >= 2 && (
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setCompare([saved[0].id, saved[1].id]);
              navigate('compare');
            }}
          >
            Compare first two <Icon name="compare" />
          </button>
        )}
      </div>
      {saved.length ? (
        <div className="favourites-grid">
          {saved.map((p) => (
            <PlayerCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <Empty icon="star" title="Your next discovery is out there." action={<a className="button" href="#players">Explore players <Icon name="arrow" /></a>}>
          Star a player to add them to your scouting board.
        </Empty>
      )}
    </div>
  );
}
