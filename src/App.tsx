import { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Bell,
  BrainCircuit,
  CalendarClock,
  CircleDollarSign,
  CreditCard,
  Music2,
  PlayCircle,
  Radio,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';

const navItems = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'releases', label: 'Releases' },
  { key: 'artists', label: 'Artists' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'royalties', label: 'Royalties' },
  { key: 'ai', label: 'AI' },
];

const summaryCards = [
  { label: 'Monthly revenue', value: '$842.4K', change: '+18.2%', tone: 'green', icon: CircleDollarSign },
  { label: 'Global streams', value: '48.3M', change: '+12.8%', tone: 'blue', icon: PlayCircle },
  { label: 'Active artists', value: '1,284', change: '+64', tone: 'violet', icon: Users },
  { label: 'Campaign ROI', value: '6.9x', change: '+2.1x', tone: 'orange', icon: TrendingUp },
];

const revenueData = [
  { name: 'Jan', revenue: 180, streams: 120 },
  { name: 'Feb', revenue: 210, streams: 148 },
  { name: 'Mar', revenue: 190, streams: 136 },
  { name: 'Apr', revenue: 245, streams: 168 },
  { name: 'May', revenue: 270, streams: 192 },
  { name: 'Jun', revenue: 290, streams: 205 },
  { name: 'Jul', revenue: 320, streams: 228 },
  { name: 'Aug', revenue: 350, streams: 246 },
];

const artistData = [
  { name: 'Ari Sol', genre: 'R&B', plays: '8.7M', payout: '$18.4K' },
  { name: 'Kairo D', genre: 'Hip-Hop', plays: '6.2M', payout: '$13.8K' },
  { name: 'Nova Vale', genre: 'Pop', plays: '5.9M', payout: '$12.6K' },
  { name: 'Rae Bloom', genre: 'EDM', plays: '4.1M', payout: '$9.7K' },
];

const campaignData = [
  { name: 'Summer Push', status: 'Live', spend: '$24.2K', roi: '5.8x' },
  { name: 'Playlist Amplify', status: 'Scheduled', spend: '$12.8K', roi: '4.6x' },
  { name: 'Street Team', status: 'Reviewing', spend: '$8.5K', roi: '2.9x' },
  { name: 'Fan Growth', status: 'Optimized', spend: '$17.3K', roi: '7.2x' },
];

const aiTasks = [
  { title: 'DSP sync', detail: 'Queued for Spotify & Apple Music', tag: 'Auto' },
  { title: 'Royalty anomaly check', detail: '3 flags detected across 2 territories', tag: 'Needs review' },
  { title: 'Campaign ideation', detail: 'AI generated 9 creative angles for the next run', tag: 'Ready' },
];

const releaseRows = [
  { title: 'Midnight Echo', artist: 'Ari Sol', format: 'Single', status: 'Approved', date: 'Sep 12' },
  { title: 'Blueprints', artist: 'Kairo D', format: 'EP', status: 'Scheduled', date: 'Sep 18' },
  { title: 'Afterglow', artist: 'Nova Vale', format: 'Album', status: 'In review', date: 'Sep 22' },
  { title: 'Static Hearts', artist: 'Rae Bloom', format: 'Single', status: 'Live', date: 'Sep 29' },
];

const dashboardWidgets = [
  { label: 'Distribution health', value: '96.8%', tone: 'green' },
  { label: 'Avg. conversion rate', value: '7.4%', tone: 'blue' },
  { label: 'Open invoicing', value: '18', tone: 'purple' },
];

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const isAuthenticated = localStorage.getItem('dmf-auth') === 'true';
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function LoginScreen() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@dariyah.io');
  const [password, setPassword] = useState('da-riyah');
  const [error, setError] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (!email || !password) {
      setError('Enter both email and password to continue.');
      return;
    }

    localStorage.setItem('dmf-auth', 'true');
    navigate('/dashboard');
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
          <h2>Welcome back</h2>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error ? <div className="error-box">{error}</div> : null}

          <button type="submit" className="primary-button">Sign in</button>
        </form>

        <div className="login-footnote">Demo credentials: admin@dariyah.io / da-riyah</div>
      </div>
    </div>
  );
}

function DashboardLayout({ activeTab, setActiveTab }: { activeTab: string; setActiveTab: (key: string) => void }) {
  const navigate = useNavigate();

  const handleSelect = (key: string) => {
    setActiveTab(key);
    navigate(`/dashboard/${key === 'dashboard' ? '' : key}`);
  };

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
            <button
              key={item.key}
              className={item.key === activeTab ? 'nav-item active' : 'nav-item'}
              onClick={() => handleSelect(item.key)}
            >
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="panel mini-panel">
          <div className="panel-label">AI orchestration</div>
          <div className="mini-stat">
            <BrainCircuit size={18} />
            <span>12 workflows active</span>
          </div>
          <div className="mini-stat muted">
            <ShieldCheck size={18} />
            <span>99.94% system health</span>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <div className="eyebrow">Music ops platform</div>
            <h1>{navItems.find((item) => item.key === activeTab)?.label || 'Dashboard'}</h1>
          </div>

          <div className="topbar-actions">
            <button className="icon-button" aria-label="Search">
              <Search size={16} />
            </button>
            <button className="icon-button" aria-label="Notifications">
              <Bell size={16} />
            </button>
            <div className="user-pill">
              <div className="avatar">AR</div>
              <div>
                <div className="user-name">Ari Ramos</div>
                <div className="user-role">Label admin</div>
              </div>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="" element={<DashboardPage />} />
          <Route path="releases" element={<ReleasesPage />} />
          <Route path="artists" element={<ArtistsPage />} />
          <Route path="campaigns" element={<CampaignsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="royalties" element={<RoyaltiesPage />} />
          <Route path="ai" element={<AiPage />} />
        </Routes>
      </main>
    </div>
  );
}

function DashboardPage() {
  return (
    <>
      <section className="summary-grid">
        {summaryCards.map(({ label, value, change, tone, icon: Icon }) => (
          <article key={label} className="stat-card">
            <div className={`stat-icon ${tone}`}>
              <Icon size={18} />
            </div>
            <div className="stat-copy">
              <div className="stat-label">{label}</div>
              <div className="stat-value">{value}</div>
            </div>
            <div className="stat-change">{change}</div>
          </article>
        ))}
      </section>

      <section className="content-grid">
        <div className="panel chart-panel">
          <div className="panel-head">
            <div>
              <div className="panel-label">Revenue & streaming trend</div>
              <h2>Global performance</h2>
            </div>
            <button className="inline-action">
              View report
              <ArrowUpRight size={14} />
            </button>
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenueData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.04} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d2b43" vertical={false} />
              <XAxis dataKey="name" stroke="#9ca3af" tickLine={false} axisLine={false} />
              <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
              <Tooltip />
              <Area dataKey="revenue" stroke="#8b5cf6" fill="url(#revenueGradient)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-head compact">
            <div>
              <div className="panel-label">Catalog health</div>
              <h2>Release velocity</h2>
            </div>
          </div>

          <div className="stacked-metrics">
            <div className="metric-row">
              <div className="metric-row-title">
                <Music2 size={16} />
                <span>New releases</span>
              </div>
              <strong>28</strong>
            </div>
            <div className="metric-row">
              <div className="metric-row-title">
                <CalendarClock size={16} />
                <span>Scheduled drops</span>
              </div>
              <strong>9</strong>
            </div>
            <div className="metric-row">
              <div className="metric-row-title">
                <Radio size={16} />
                <span>Radio adds</span>
              </div>
              <strong>14</strong>
            </div>
          </div>

          <div className="mini-chart">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={revenueData}>
                <Bar dataKey="streams" fill="#22c55e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel list-panel">
          <div className="panel-head compact">
            <div>
              <div className="panel-label">Top artists</div>
              <h2>Performance table</h2>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Artist</th>
                <th>Genre</th>
                <th>Plays</th>
                <th>Payout</th>
              </tr>
            </thead>
            <tbody>
              {artistData.map((artist) => (
                <tr key={artist.name}>
                  <td>{artist.name}</td>
                  <td>{artist.genre}</td>
                  <td>{artist.plays}</td>
                  <td>{artist.payout}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel list-panel">
          <div className="panel-head compact">
            <div>
              <div className="panel-label">Campaigns</div>
              <h2>Ops queue</h2>
            </div>
          </div>

          <div className="campaign-list">
            {campaignData.map((campaign) => (
              <div key={campaign.name} className="campaign-item">
                <div>
                  <div className="campaign-name">{campaign.name}</div>
                  <div className="campaign-status">{campaign.status}</div>
                </div>
                <div className="campaign-metrics">
                  <span>{campaign.spend}</span>
                  <strong>{campaign.roi}</strong>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel list-panel ai-panel">
          <div className="panel-head compact">
            <div>
              <div className="panel-label">AI automation</div>
              <h2>Operational tasks</h2>
            </div>
          </div>

          <div className="ai-list">
            {aiTasks.map((task) => (
              <div key={task.title} className="ai-item">
                <div className="ai-icon">
                  <Sparkles size={16} />
                </div>
                <div>
                  <div className="ai-title">{task.title}</div>
                  <div className="ai-detail">{task.detail}</div>
                </div>
                <span className="tag">{task.tag}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function ReleasesPage() {
  return (
    <section className="panel full-section">
      <div className="panel-head">
        <div>
          <div className="panel-label">Releases</div>
          <h2>Release pipeline</h2>
        </div>
        <button className="inline-action">New release</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Artist</th>
            <th>Format</th>
            <th>Status</th>
            <th>Release</th>
          </tr>
        </thead>
        <tbody>
          {releaseRows.map((row) => (
            <tr key={row.title}>
              <td>{row.title}</td>
              <td>{row.artist}</td>
              <td>{row.format}</td>
              <td>{row.status}</td>
              <td>{row.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ArtistsPage() {
  const topArtists = useMemo(
    () => [
      { name: 'Ari Sol', active: 97, earnings: '$58.2K', focus: 'R&B' },
      { name: 'Kairo D', active: 92, earnings: '$41.1K', focus: 'Hip Hop' },
      { name: 'Nova Vale', active: 88, earnings: '$35.7K', focus: 'Pop' },
      { name: 'Rae Bloom', active: 81, earnings: '$29.9K', focus: 'EDM' },
    ],
    []
  );

  return (
    <section className="multi-panel-grid">
      <div className="panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-label">Artists</div>
            <h2>Roster overview</h2>
          </div>
        </div>

        <div className="artist-list">
          {topArtists.map((artist) => (
            <div key={artist.name} className="artist-row">
              <div>
                <div className="artist-name">{artist.name}</div>
                <div className="campaign-status">{artist.focus}</div>
              </div>
              <div className="artist-meta">
                <span>{artist.active}% activity</span>
                <strong>{artist.earnings}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-label">Growth</div>
            <h2>Audience reach</h2>
          </div>
        </div>
        <div className="growth-box">
          <div className="large-number">+34.6%</div>
          <p>Audience engagement increased in the last 30 days across playlist, social, and paid campaigns.</p>
        </div>
      </div>
    </section>
  );
}

function CampaignsPage() {
  return (
    <section className="multi-panel-grid">
      <div className="panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-label">Campaigns</div>
            <h2>Creative pipeline</h2>
          </div>
        </div>
        <div className="campaign-list">
          {campaignData.map((campaign) => (
            <div key={campaign.name} className="campaign-item">
              <div>
                <div className="campaign-name">{campaign.name}</div>
                <div className="campaign-status">{campaign.status}</div>
              </div>
              <div className="campaign-metrics">
                <span>{campaign.spend}</span>
                <strong>{campaign.roi}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-label">Budget</div>
            <h2>Allocation</h2>
          </div>
        </div>
        <div className="budget-stack">
          <div><span>Paid social</span><strong>$72.4K</strong></div>
          <div><span>Playlist pitching</span><strong>$44.8K</strong></div>
          <div><span>Influencer outreach</span><strong>$29.1K</strong></div>
        </div>
      </div>
    </section>
  );
}

function AnalyticsPage() {
  return (
    <section className="panel full-section">
      <div className="panel-head">
        <div>
          <div className="panel-label">Analytics</div>
          <h2>Performance by channel</h2>
        </div>
      </div>

      <div className="analytics-summary">
        <div className="metric-tile">
          <span>Spotify</span>
          <strong>24.3M</strong>
        </div>
        <div className="metric-tile">
          <span>Apple Music</span>
          <strong>11.7M</strong>
        </div>
        <div className="metric-tile">
          <span>YouTube</span>
          <strong>7.9M</strong>
        </div>
        <div className="metric-tile">
          <span>Short-form</span>
          <strong>4.5M</strong>
        </div>
      </div>
    </section>
  );
}

function RoyaltiesPage() {
  return (
    <section className="multi-panel-grid">
      <div className="panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-label">Royalties</div>
            <h2>Statements</h2>
          </div>
        </div>
        <div className="royalty-list">
          <div className="royalty-row"><span>Streaming payouts</span><strong>$184.5K</strong></div>
          <div className="royalty-row"><span>Sync / licensing</span><strong>$31.2K</strong></div>
          <div className="royalty-row"><span>Publisher revenue</span><strong>$23.8K</strong></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head compact">
          <div>
            <div className="panel-label">Payments</div>
            <h2>Settlement status</h2>
          </div>
        </div>
        <div className="payment-box">
          <Wallet size={28} />
          <div>
            <div className="large-number">$239.5K</div>
            <div className="campaign-status">Next disbursement on Sep 29</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AiPage() {
  return (
    <section className="panel full-section">
      <div className="panel-head">
        <div>
          <div className="panel-label">AI</div>
          <h2>Autonomous operations</h2>
        </div>
      </div>

      <div className="ai-list">
        {aiTasks.map((task) => (
          <div key={task.title} className="ai-item">
            <div className="ai-icon"><Sparkles size={16} /></div>
            <div>
              <div className="ai-title">{task.title}</div>
              <div className="ai-detail">{task.detail}</div>
            </div>
            <span className="tag">{task.tag}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <DashboardLayout activeTab={activeTab} setActiveTab={setActiveTab} />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;
