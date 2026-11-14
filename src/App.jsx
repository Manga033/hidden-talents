import { useEffect, useRef, useState } from 'react';
import { useScout } from './store.jsx';
import { Empty, Icon, Logo } from './components/ui.jsx';
import Home from './pages/Home.jsx';
import Players from './pages/Players.jsx';
import Profile from './pages/Profile.jsx';
import Compare from './pages/Compare.jsx';
import FindStar from './pages/FindStar.jsx';
import HiddenTalents from './pages/HiddenTalents.jsx';
import Insights from './pages/Insights.jsx';
import Favourites from './pages/Favourites.jsx';
import Login from './pages/Login.jsx';

const NAV = [
  ['home', 'Discover', 'grid'],
  ['players', 'Players', 'people'],
  ['find', 'Find your star', 'target'],
  ['compare', 'Compare', 'compare'],
  ['hidden', 'Hidden talents', 'trend'],
  ['insights', 'Fairness check', 'scale'],
  ['favourites', 'Favourites', 'star'],
];
const TITLES = { home: 'Discover', players: 'Player pool', find: 'Find your star', compare: 'Compare players', hidden: 'Hidden talents', insights: 'Fairness check', favourites: 'Your favourites' };

function UserMenu() {
  const { user, roleLabel, signOut } = useScout();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className="user-button" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="account-avatar">{initials}</span>
        <span className="user-text">
          <b>{user.name}</b>
          <small>{roleLabel}</small>
        </span>
        <Icon name="down" />
      </button>
      {open && (
        <div className="user-pop" role="menu">
          <div className="user-pop-head">
            <b>{user.name}</b>
            <small>{roleLabel}</small>
          </div>
          <button type="button" role="menuitem" onClick={signOut}>
            <Icon name="back" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function Header() {
  const { route, favs, allowed } = useScout();
  const active = route.page === 'player' ? 'players' : route.page;
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand-link" href="#home" aria-label="Scoutee home">
          <Logo />
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV.filter(([to]) => allowed(to)).map(([to, label, icon]) => (
            <a key={to} href={`#${to}`} className={active === to ? 'active' : ''} aria-current={active === to ? 'page' : undefined}>
              <Icon name={icon} />
              {label}
              {to === 'favourites' && <span className="nav-count">{favs.length}</span>}
            </a>
          ))}
        </nav>
        <div className="header-tools">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const { user, ready, error, route, toastMsg, byId, allowed } = useScout();
  useEffect(() => {
    const p = route.page === 'player' ? byId[route.id] : null;
    document.title = user ? `${p ? p.name : TITLES[route.page] || 'Discover'} — Scoutee` : 'Sign in — Scoutee';
  }, [route, byId, user]);

  if (user === undefined) return <div className="loading" role="status"><span className="loader" /> Loading…</div>;
  if (!user) return <Login />;

  let page = null;
  if (ready) {
    if (!allowed(route.page)) {
      page = (
        <Empty icon="shield" title="This page is not available for your role." action={<a className="button" href="#home">Back to Discover</a>}>
          Ask the sporting director if you need access.
        </Empty>
      );
    } else {
      switch (route.page) {
        case 'players': page = <Players />; break;
        case 'player': page = <Profile id={route.id} />; break;
        case 'find': page = <FindStar />; break;
        case 'compare': page = <Compare />; break;
        case 'hidden': page = <HiddenTalents />; break;
        case 'insights': page = <Insights />; break;
        case 'favourites': page = <Favourites />; break;
        default: page = <Home />;
      }
    }
  }
  return (
    <>
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className={route.page === 'home' ? 'is-home' : ''}>
        {error ? (
          <Empty icon="alert" title="The player data could not be loaded.">{error}</Empty>
        ) : !ready ? (
          <div className="loading" role="status">
            <span className="loader" /> Loading players…
          </div>
        ) : (
          page
        )}
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <a className="footer-brand" href="#home">
            SCOUTEE<span>See the player. Prove the potential.</span>
          </a>
          <span>U21 professionals · season 2025/26 · synthetic development dataset</span>
          <small>DECISION SUPPORT · THE SCOUT DECIDES</small>
        </div>
      </footer>
      <div className={`toast ${toastMsg ? 'show' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </>
  );
}
