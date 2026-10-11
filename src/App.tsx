import {
  Activity,
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

const navItems = ['Dashboard', 'Releases', 'Artists', 'Campaigns', 'Analytics', 'Royalties', 'AI'];

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

function App() {
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
          {navItems.map((item, index) => (
            <button key={item} className={index === 0 ? 'nav-item active' : 'nav-item'}>
              <span>{item}</span>
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
            <div className="eyebrow">Music Ops Platform</div>
            <h1>Performance overview</h1>
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
      </main>
    </div>
  );
}

export default App;
