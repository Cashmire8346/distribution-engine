import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { get, post, type RosterSnapshot, type RoyaltyEntry, type RoyaltySummary } from '../api';
import { Empty, Loading, Panel, date, dollars, useAction, useLoad } from '../ui';

const SOURCES = ['spotify', 'apple', 'youtube', 'amazon', 'tidal', 'symphonic', 'pro', 'sync', 'publisher', 'other'];

export default function Royalties() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [entries, summary, roster] = await Promise.all([
      get<{ entries: RoyaltyEntry[] }>('/api/royalties'),
      get<{ summary: RoyaltySummary }>('/api/royalties/summary'),
      get<RosterSnapshot>('/api/roster'),
    ]);
    return { entries: entries.entries, summary: summary.summary, artists: roster.artists.map((a) => a.name) };
  });
  const action = useAction();
  const [form, setForm] = useState({ artist: '', period: '', source: 'spotify', gross: '', sharePct: '50', statementRef: '' });

  if (!data) return <Loading error={error} loading={loading} />;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await action.run(() =>
      post('/api/royalties', {
        artist: form.artist,
        period: form.period,
        source: form.source,
        grossCents: Math.round(Number(form.gross) * 100),
        artistShareBps: Math.round(Number(form.sharePct) * 100),
        statementRef: form.statementRef || null,
      })
    );
    if (ok) {
      setForm({ ...form, gross: '', statementRef: '' });
      reload();
    }
  };

  const markPaid = async (id: string) => {
    if (await action.run(() => post(`/api/royalties/${id}/paid`))) reload();
  };

  const { summary } = data;

  return (
    <>
      <section className="multi-panel-grid">
        <Panel label="Royalties" title="Statements entered">
          <div className="royalty-list">
            <div className="royalty-row"><span>Gross income</span><strong>{summary.entries ? dollars(summary.grossCents) : '—'}</strong></div>
            <div className="royalty-row"><span>Artist share</span><strong>{summary.entries ? dollars(summary.artistCents) : '—'}</strong></div>
            <div className="royalty-row"><span>Label share</span><strong>{summary.entries ? dollars(summary.labelCents) : '—'}</strong></div>
          </div>
        </Panel>
        <Panel label="Payments" title="Owed to artists">
          <div className="payment-box">
            <Wallet size={28} />
            <div>
              <div className="large-number">{summary.entries ? dollars(summary.owedToArtistsCents) : '—'}</div>
              <div className="campaign-status">Unpaid artist share across entered statements</div>
            </div>
          </div>
        </Panel>
      </section>

      <section className="panel full-section">
        <div className="panel-head">
          <div>
            <div className="panel-label">Ledger</div>
            <h2>Statement lines</h2>
          </div>
        </div>

        {data.entries.length === 0 ? (
          <Empty>No statements entered. Add a line from a real DSP, distributor, PRO or sync statement below.</Empty>
        ) : (
          <table>
            <thead><tr><th>Period</th><th>Artist</th><th>Source</th><th>Gross</th><th>Artist share</th><th>Label</th><th>Status</th></tr></thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.period}</td>
                  <td>{e.artist}</td>
                  <td>{e.source}{e.statementRef ? ` · ${e.statementRef}` : ''}</td>
                  <td>{dollars(e.grossCents)}</td>
                  <td>{dollars(e.artistCents)} ({e.artistShareBps / 100}%)</td>
                  <td>{dollars(e.labelCents)}</td>
                  <td>
                    {e.paidAt ? `Paid ${date(e.paidAt)}` : (
                      <button className="small-button" disabled={action.busy} onClick={() => markPaid(e.id)}>Mark paid</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <form className="form-row" onSubmit={add}>
          <label>Artist
            <select value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} required>
              <option value="" disabled>Select…</option>
              {data.artists.map((a) => <option key={a}>{a}</option>)}
            </select>
          </label>
          <label>Period<input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} required /></label>
          <label>Source
            <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label>Gross ($)<input type="number" min="0" step="0.01" value={form.gross} onChange={(e) => setForm({ ...form, gross: e.target.value })} required /></label>
          <label>Artist share (%)<input type="number" min="0" max="100" step="0.01" value={form.sharePct} onChange={(e) => setForm({ ...form, sharePct: e.target.value })} required /></label>
          <label>Statement ref<input value={form.statementRef} onChange={(e) => setForm({ ...form, statementRef: e.target.value })} /></label>
          <button className="primary-button" disabled={action.busy}>Add line</button>
        </form>
        {action.error ? <div className="error-box">{action.error}</div> : null}
        <div className="note">Payouts are computed from the gross and share you enter. Nothing is estimated or projected.</div>
      </section>
    </>
  );
}
