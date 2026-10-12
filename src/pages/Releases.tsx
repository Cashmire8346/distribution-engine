import { useState } from 'react';
import { get, post, type Release, type RosterSnapshot } from '../api';
import { Empty, Loading, Panel, date, useAction, useLoad } from '../ui';

export default function Releases() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [releases, roster] = await Promise.all([get<{ releases: Release[] }>('/api/releases'), get<RosterSnapshot>('/api/roster')]);
    return { releases: releases.releases, artists: roster.artists.map((a) => a.name) };
  });
  const action = useAction();
  const [form, setForm] = useState({ title: '', artist: '', format: 'single', releaseDate: '' });

  if (!data) return <Loading error={error} loading={loading} />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await action.run(() => post('/api/releases', { ...form, releaseDate: form.releaseDate || null }));
    if (ok) {
      setForm({ ...form, title: '', releaseDate: '' });
      reload();
    }
  };

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    if (await action.run(() => post(`/api/releases/${id}/decision`, { decision }))) reload();
  };

  return (
    <section className="panel full-section">
      <div className="panel-head">
        <div>
          <div className="panel-label">Releases</div>
          <h2>Release pipeline</h2>
        </div>
      </div>

      {data.releases.length === 0 ? (
        <Empty>No releases yet. Create one below; it starts pending and cannot be delivered until you approve it.</Empty>
      ) : (
        <table>
          <thead>
            <tr><th>Title</th><th>Artist</th><th>Format</th><th>Status</th><th>Release date</th><th>Decision</th></tr>
          </thead>
          <tbody>
            {data.releases.map((r) => (
              <tr key={r.releaseId}>
                <td>{r.title}</td>
                <td>{r.artist}</td>
                <td>{r.format}</td>
                <td className={`status-${r.status}`}>{r.status}</td>
                <td>{date(r.releaseDate)}</td>
                <td>
                  {r.status === 'pending' ? (
                    <>
                      <button className="small-button" disabled={action.busy} onClick={() => decide(r.releaseId, 'approved')}>Approve</button>{' '}
                      <button className="small-button" disabled={action.busy} onClick={() => decide(r.releaseId, 'rejected')}>Reject</button>
                    </>
                  ) : (
                    `${r.decidedBy ?? ''} ${date(r.decidedAt)}${r.expiresAt ? ` · expires ${date(r.expiresAt)}` : ''}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form className="form-row" onSubmit={create}>
        <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
        <label>Artist
          <select value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} required>
            <option value="" disabled>Select…</option>
            {data.artists.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label>Format
          <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>
            <option>single</option><option>ep</option><option>album</option>
          </select>
        </label>
        <label>Release date (optional)<input type="date" value={form.releaseDate} onChange={(e) => setForm({ ...form, releaseDate: e.target.value })} /></label>
        <button className="primary-button" disabled={action.busy}>New release</button>
      </form>
      {action.error ? <div className="error-box">{action.error}</div> : null}
      <div className="note">Approval is recorded under your signed-in email and expires after 30 days. This is the same record the delivery gate checks.</div>
    </section>
  );
}
