import { useState } from 'react';
import { get, patch, post, type Campaign } from '../api';
import { Empty, Loading, Panel, dollars, useAction, useLoad } from '../ui';

const toCents = (value: string) => Math.round(Number(value) * 100);

export default function Campaigns() {
  const { data, error, loading, reload } = useLoad(() => get<{ campaigns: Campaign[] }>('/api/campaigns'));
  const action = useAction();
  const [form, setForm] = useState({ name: '', channel: '', status: 'planned', spend: '' });
  const [revenue, setRevenue] = useState<Record<string, string>>({});

  if (!data) return <Loading error={error} loading={loading} />;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await action.run(() =>
      post('/api/campaigns', {
        name: form.name,
        channel: form.channel || null,
        status: form.status,
        spendCents: form.spend === '' ? 0 : toCents(form.spend),
      })
    );
    if (ok) {
      setForm({ name: '', channel: '', status: 'planned', spend: '' });
      reload();
    }
  };

  const save = async (id: string, body: object) => {
    if (await action.run(() => patch(`/api/campaigns/${id}`, body))) reload();
  };

  const totalSpend = data.campaigns.reduce((sum, c) => sum + c.spendCents, 0);

  return (
    <section className="multi-panel-grid">
      <Panel label="Campaigns" title="Ledger">
        {data.campaigns.length === 0 ? (
          <Empty>No campaigns recorded.</Empty>
        ) : (
          <div className="campaign-list">
            {data.campaigns.map((c) => (
              <div key={c.id} className="campaign-item">
                <div>
                  <div className="campaign-name">{c.name}</div>
                  <div className="campaign-status">{[c.channel, c.status].filter(Boolean).join(' · ')}</div>
                  <select value={c.status} onChange={(e) => save(c.id, { status: e.target.value })} aria-label={`Status for ${c.name}`}>
                    <option>planned</option><option>live</option><option>paused</option><option>complete</option>
                  </select>
                </div>
                <div className="campaign-metrics">
                  <span>Spend {dollars(c.spendCents)}</span>
                  <span>Revenue {c.attributedRevenueCents === null ? 'not entered' : dollars(c.attributedRevenueCents)}</span>
                  <strong>{c.roi === null ? 'ROI not measured' : `${c.roi}x`}</strong>
                  <span>
                    <input
                      type="number" min="0" step="0.01" placeholder="Attributed revenue $"
                      value={revenue[c.id] ?? ''}
                      onChange={(e) => setRevenue({ ...revenue, [c.id]: e.target.value })}
                    />{' '}
                    <button
                      className="small-button"
                      disabled={action.busy || !revenue[c.id]}
                      onClick={() => save(c.id, { attributedRevenueCents: toCents(revenue[c.id]) })}
                    >Save</button>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {action.error ? <div className="error-box">{action.error}</div> : null}
        <div className="note">ROI is shown only after you enter both spend and the revenue attributed to the campaign.</div>
      </Panel>

      <Panel label="Budget" title="New campaign">
        <form className="form-row" onSubmit={create}>
          <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label>Channel<input value={form.channel} placeholder="e.g. YouTube ads" onChange={(e) => setForm({ ...form, channel: e.target.value })} /></label>
          <label>Spend ($)<input type="number" min="0" step="0.01" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} /></label>
          <button className="primary-button" disabled={action.busy}>Add campaign</button>
        </form>
        <div className="budget-stack">
          <div><span>Total spend recorded</span><strong>{data.campaigns.length ? dollars(totalSpend) : '—'}</strong></div>
        </div>
      </Panel>
    </section>
  );
}
