import { useState } from 'react';
import { get, post, type Artist, type Metric, type RosterSnapshot } from '../api';
import { Empty, Loading, Panel, count, date, useAction, useLoad } from '../ui';

const SOURCES = ['spotify', 'apple', 'youtube', 'amazon', 'tidal', 'chartmetric', 'manual'];

export function latestListeners(artist: Artist): Metric | null {
  const rows = artist.metrics.filter((m) => m.source === 'spotify' && m.metricType === 'monthly_listeners');
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => (Date.parse(b.asOf) > Date.parse(a.asOf) ? b : a));
}

export default function Artists() {
  const { data, error, loading, reload } = useLoad(() => get<RosterSnapshot>('/api/roster'));
  const action = useAction();
  const [form, setForm] = useState({ artist: '', source: 'spotify', metricType: 'monthly_listeners', value: '', asOf: '' });

  if (!data) return <Loading error={error} loading={loading} />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await action.run(() =>
      post('/api/roster/metrics', {
        artist: form.artist,
        source: form.source,
        metricType: form.metricType,
        value: Number(form.value),
        ...(form.asOf ? { asOf: new Date(form.asOf).toISOString() } : {}),
      })
    );
    if (ok) {
      setForm({ ...form, value: '' });
      reload();
    }
  };

  return (
    <section className="multi-panel-grid">
      <Panel label="Artists" title="Roster">
        <div className="artist-list">
          {data.artists.map((a) => {
            const reading = latestListeners(a);
            return (
              <div key={a.name} className="artist-row">
                <div>
                  <div className="artist-name">{a.name}</div>
                  <div className="campaign-status">{[a.role, a.location].filter(Boolean).join(' · ')}</div>
                  {a.spotifyUrl ? (
                    <a className="link-button" href={a.spotifyUrl} target="_blank" rel="noreferrer">Spotify profile</a>
                  ) : (
                    <span className="campaign-status">Spotify profile not linked</span>
                  )}
                </div>
                <div className="artist-meta">
                  <strong>{reading ? count(reading.value) : 'Not tracked'}</strong>
                  <span>{reading ? `as of ${date(reading.asOf)}` : 'no sourced reading'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="note">
          {data.aggregate.complete
            ? `Roster total ${count(data.aggregate.total ?? 0)} monthly listeners, oldest reading ${date(data.aggregate.asOf ?? null)}.`
            : `No roster total: ${data.aggregate.reason ?? 'readings are incomplete'}.`}
        </div>
      </Panel>

      <Panel label="Metrics" title="Record a sourced reading">
        <form className="form-row" onSubmit={submit}>
          <label>Artist
            <select value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} required>
              <option value="" disabled>Select…</option>
              {data.artists.map((a) => <option key={a.name}>{a.name}</option>)}
            </select>
          </label>
          <label>Source
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Metric
            <input value={form.metricType} onChange={(e) => setForm({ ...form, metricType: e.target.value })} required />
          </label>
          <label>Value
            <input type="number" min="0" step="1" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} required />
          </label>
          <label>As of (optional)
            <input type="date" value={form.asOf} onChange={(e) => setForm({ ...form, asOf: e.target.value })} />
          </label>
          <button className="primary-button" disabled={action.busy}>Record</button>
        </form>
        {action.error ? <div className="error-box">{action.error}</div> : null}
        <div className="note">Every reading is stored with its source and date. Unsourced numbers are refused by the server.</div>
        {data.artists.every((a) => a.metrics.length === 0) ? <Empty>No readings recorded yet.</Empty> : null}
      </Panel>
    </section>
  );
}
