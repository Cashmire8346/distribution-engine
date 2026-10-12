import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BrainCircuit, CircleDollarSign, Music2, Users } from 'lucide-react';
import { get, type Campaign, type DariyahStatus, type Release, type RosterSnapshot, type RoyaltySummary } from '../api';
import { Empty, Loading, Panel, count, dollars, useLoad } from '../ui';
import { latestListeners } from './Artists';

export default function Dashboard() {
  const { data, error, loading } = useLoad(async () => {
    const [roster, releases, royalties, campaigns, dariyah] = await Promise.all([
      get<RosterSnapshot>('/api/roster'),
      get<{ releases: Release[] }>('/api/releases'),
      get<{ summary: RoyaltySummary }>('/api/royalties/summary'),
      get<{ campaigns: Campaign[] }>('/api/campaigns'),
      get<DariyahStatus>('/api/dariyah'),
    ]);
    return { roster, releases: releases.releases, royalties: royalties.summary, campaigns: campaigns.campaigns, dariyah };
  });

  if (!data) return <Loading error={error} loading={loading} />;
  const { roster, releases, royalties, campaigns, dariyah } = data;
  const linked = roster.artists.length - roster.unlinked.length;
  const pending = releases.filter((r) => r.status === 'pending').length;

  return (
    <>
      <section className="summary-grid">
        <article className="stat-card">
          <div className="stat-icon violet"><Users size={18} /></div>
          <div className="stat-copy">
            <div className="stat-label">Artists on roster</div>
            <div className="stat-value">{count(roster.artists.length)}</div>
          </div>
          <div className="stat-change">{linked} Spotify linked</div>
        </article>
        <article className="stat-card">
          <div className="stat-icon blue"><Music2 size={18} /></div>
          <div className="stat-copy">
            <div className="stat-label">Releases awaiting approval</div>
            <div className="stat-value">{count(pending)}</div>
          </div>
          <div className="stat-change">{releases.length} total</div>
        </article>
        <article className="stat-card">
          <div className="stat-icon green"><CircleDollarSign size={18} /></div>
          <div className="stat-copy">
            <div className="stat-label">Gross royalties entered</div>
            <div className="stat-value">{royalties.entries ? dollars(royalties.grossCents) : '—'}</div>
          </div>
          <div className="stat-change">{royalties.entries ? `${royalties.entries} lines` : 'none entered'}</div>
        </article>
        <article className="stat-card">
          <div className="stat-icon orange"><BrainCircuit size={18} /></div>
          <div className="stat-copy">
            <div className="stat-label">Owed to artists</div>
            <div className="stat-value">{royalties.entries ? dollars(royalties.owedToArtistsCents) : '—'}</div>
          </div>
          <div className="stat-change">unpaid share</div>
        </article>
      </section>

      <section className="content-grid">
        <Panel label="Royalties" title="Gross by source">
          {royalties.bySource.length === 0 ? (
            <Empty>No royalty statements entered yet. Add them on the <Link className="link-button" to="/royalties">Royalties</Link> page.</Empty>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={royalties.bySource.map((s) => ({ name: s.source, dollars: s.grossCents / 100 }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d2b43" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" tickLine={false} axisLine={false} />
                <YAxis stroke="#9ca3af" tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="dollars" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel label="Roster" title="Monthly listeners (Spotify)">
          <div className="stacked-metrics">
            {roster.artists.map((a) => {
              const reading = latestListeners(a);
              return (
                <div key={a.name} className="metric-row">
                  <div className="metric-row-title"><span>{a.name}</span></div>
                  <strong>{reading ? count(reading.value) : 'Not tracked'}</strong>
                </div>
              );
            })}
          </div>
          <div className="note">
            {roster.aggregate.complete
              ? `Roster total ${count(roster.aggregate.total ?? 0)}.`
              : `No roster total: ${roster.aggregate.reason ?? 'readings are incomplete'}.`}
          </div>
        </Panel>
      </section>

      <section className="lower-grid">
        <Panel label="Campaigns" title="Ops queue">
          {campaigns.length === 0 ? (
            <Empty>No campaigns recorded.</Empty>
          ) : (
            <div className="campaign-list">
              {campaigns.map((c) => (
                <div key={c.id} className="campaign-item">
                  <div>
                    <div className="campaign-name">{c.name}</div>
                    <div className="campaign-status">{c.status}</div>
                  </div>
                  <div className="campaign-metrics">
                    <span>{dollars(c.spendCents)}</span>
                    <strong>{c.roi === null ? 'ROI not measured' : `${c.roi}x`}</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel label="Da’Riyah" title="Engine status">
          <div className="ai-list">
            {dariyah.divisions.map((d) => (
              <div key={d.id} className="ai-item">
                <div>
                  <div className="ai-title">{d.label}</div>
                  <div className="ai-detail">{d.blockedBy.length} blocker{d.blockedBy.length === 1 ? '' : 's'}</div>
                </div>
                <span className="tag">{d.status}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </>
  );
}
