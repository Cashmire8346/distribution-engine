import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { BrainCircuit, ShieldCheck } from 'lucide-react';
import { api, get, getToken, post, setToken, type DariyahStatus } from './api';
import { useLoad } from './ui';
import Dashboard from './pages/Dashboard';
import Releases from './pages/Releases';
import Artists from './pages/Artists';
import Campaigns from './pages/Campaigns';
import Analytics from './pages/Analytics';
import Royalties from './pages/Royalties';
import Ai from './pages/Ai';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/releases', label: 'Releases' },
  { to: '/artists', label: 'Artists' },
  { to: '/campaigns', label: 'Campaigns' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/royalties', label: 'Royalties' },
  { to: '/ai', label: 'AI' },
];

// Resolves who is signed in by asking the server. A token in storage is only a
// claim; the server decides whether it is still valid.
function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    api<{ email: string }>('GET', '/api/auth/me')
      .then((me) => setEmail(me.email))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const expired = () => setEmail(null);
    window.addEventListener('dmf-auth-expired', expired);
    return () => window.removeEventListener('dmf-auth-expired', expired);
  }, []);

  return { email, setEmail, checking };
}

function LoginScreen({ onSignedIn }: { onSignedIn: (email: string) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await post<{ token: string; email: string }>('/api/auth/login', { email, password });
      setToken(res.token);
      onSignedIn(res.email);
      navigate('/');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="brand-box large">
          <div className="brand-mark">DMF</div>
          <div>
            <div className="brand-title">Da’Riyah</div>
            <div className="brand-sub">Distribution engine</div>
          </div>
        </div>

        <div className="login-header">
          <div className="eyebrow">Secure access</div>
          <h2>Sign in</h2>
        </div>

        <form onSubmit={submit} className="login-form">
          <label>
            Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

function Layout({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const status = useLoad(() => get<DariyahStatus>('/api/dariyah'));
  const health = useLoad(() => get<{ studioSessions: number; videoJobs: number; metricsTracked: boolean }>('/api/health'));

  const divisions = status.data?.divisions ?? [];
  const partial = divisions.filter((d) => d.status === 'partial').length;
  const available = divisions.filter((d) => d.status === 'available').length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-box">
          <div className="brand-mark">DMF</div>
          <div>
            <div className="brand-title">Da’Riyah</div>
            <div className="brand-sub">Distribution engine</div>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="panel mini-panel">
          <div className="panel-label">Engine</div>
          <div className="mini-stat">
            <BrainCircuit size={18} />
            <span>{status.data ? `${available} available, ${partial} partial of ${divisions.length} divisions` : status.error ?? 'Loading…'}</span>
          </div>
          <div className="mini-stat muted">
            <ShieldCheck size={18} />
            <span>{health.data ? `${health.data.studioSessions} studio sessions, ${health.data.videoJobs} video jobs` : health.error ?? 'Loading…'}</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">DMF Records · Fly Hoolie Ent</div>
            <h1>Distribution engine</h1>
          </div>

          <div className="topbar-actions">
            <div className="user-pill">
              <div className="avatar">{email.slice(0, 2).toUpperCase()}</div>
              <div>
                <div className="user-name">{email}</div>
                <div className="user-role">Signed in</div>
              </div>
            </div>
            <button className="small-button" onClick={onSignOut}>Sign out</button>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/releases" element={<Releases />} />
          <Route path="/artists" element={<Artists />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/royalties" element={<Royalties />} />
          <Route path="/ai" element={<Ai />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const { email, setEmail, checking } = useSession();

  if (checking) return <div className="login-shell"><div className="empty">Checking session…</div></div>;

  const signOut = () => {
    setToken(null);
    setEmail(null);
  };

  return (
    <Routes>
      <Route path="/login" element={email ? <Navigate to="/" replace /> : <LoginScreen onSignedIn={setEmail} />} />
      <Route path="/*" element={email ? <Layout email={email} onSignOut={signOut} /> : <Navigate to="/login" replace />} />
    </Routes>
  );
}
