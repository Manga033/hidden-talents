import { useState } from 'react';
import { useScout } from '../store.jsx';
import { Icon } from '../components/ui.jsx';
import { ROLES } from '../auth/roles.js';

export default function Login() {
  const { signIn } = useScout();
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await signIn(u, p);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="brand">
          <span className="brand-mark">
            h<span>t</span>
            <i />
          </span>
          <span>
            HIDDEN<span className="brand-light">TALENT</span>
            <small>SEE THE POTENTIAL.</small>
          </span>
        </div>
        <span className="eyebrow">FAIR SCOUTING · U21 PROFESSIONALS</span>
        <h1>
          Find the player <em>the list missed.</em>
        </h1>
        <p>Every rank comes with its reasons: what he did on the pitch, how strong his team was, and how sure we can be.</p>
        <ul className="role-list">
          {Object.values(ROLES).map((r) => (
            <li key={r.label}>
              <Icon name="shield" />
              <span>
                <b>{r.label}</b> {r.see.audit ? 'Everything, including the fairness check, contracts and data updates.' : r.see.marketValue ? 'All scouting pages and market values.' : 'Best XI, players, profiles and comparisons.'}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <form className="login-card" onSubmit={submit}>
        <span className="eyebrow">STAFF SIGN-IN</span>
        <h2>Welcome back.</h2>
        <label>
          Username
          <input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required />
        </label>
        {err && (
          <p className="login-error" role="alert">
            <Icon name="alert" /> {err}
          </p>
        )}
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <Icon name="arrow" />
        </button>
        <p className="login-note">What you see depends on your role. Accounts are managed by the sporting director.</p>
      </form>
    </div>
  );
}
