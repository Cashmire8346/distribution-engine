import { useState } from 'react';
import { get, post, type AuditEvent, type DariyahStatus, type Proposal } from '../api';
import { Empty, Loading, Panel, useAction, useLoad } from '../ui';

const LANGUAGES = ['sql', 'typescript', 'javascript', 'tsx', 'json', 'text'];

export default function Ai() {
  const { data, error, loading, reload } = useLoad(async () => {
    const [status, audit] = await Promise.all([get<DariyahStatus>('/api/dariyah'), get<{ events: AuditEvent[] }>('/api/dariyah/audit')]);
    return { status, events: audit.events };
  });
  const action = useAction();
  const [form, setForm] = useState({ task: '', language: 'sql', touchesSchema: false });
  const [proposal, setProposal] = useState<Proposal | null>(null);

  if (!data) return <Loading error={error} loading={loading} />;
  const { status, events } = data;

  const propose = async (e: React.FormEvent) => {
    e.preventDefault();
    setProposal(null);
    const ok = await action.run(async () => {
      const res = await post<{ proposal: Proposal }>('/api/dariyah/propose', form);
      setProposal(res.proposal);
    });
    if (ok) reload();
  };

  return (
    <>
      <section className="multi-panel-grid">
        <Panel label="Da’Riyah" title="Divisions">
          <div className="ai-list">
            {status.divisions.map((d) => (
              <div key={d.id} className="ai-item">
                <div>
                  <div className="ai-title">{d.label}</div>
                  <div className="ai-detail">{d.summary}</div>
                  {d.blockedBy.map((b) => <div key={b} className="note">Blocked: {b}</div>)}
                </div>
                <span className="tag">{d.status}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel label="Providers" title="What can actually run">
          <div className="royalty-list">
            {status.codeProviders.map((p) => (
              <div key={p.name} className="royalty-row"><span>Code model · {p.name}</span><strong>{p.available ? 'available' : 'unavailable'}</strong></div>
            ))}
            {status.sandboxes.map((s) => (
              <div key={s.name} className="royalty-row"><span>Sandbox · {s.name}</span><strong>{s.available ? 'available' : 'unavailable'}</strong></div>
            ))}
          </div>
          <div className="note">Proposals are text only. Nothing generated here is run or applied; schema changes must pass the migration approval gate.</div>
        </Panel>
      </section>

      <section className="panel full-section">
        <div className="panel-head">
          <div>
            <div className="panel-label">Engineering</div>
            <h2>Request a code proposal</h2>
          </div>
        </div>
        {!status.canProposeCode ? (
          <Empty>No code model is connected. Set ANTHROPIC_API_KEY on the server to enable proposals.</Empty>
        ) : (
          <form className="form-row" onSubmit={propose}>
            <label>Task
              <textarea value={form.task} onChange={(e) => setForm({ ...form, task: e.target.value })} required />
            </label>
            <label>Language
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label>
              <span><input type="checkbox" checked={form.touchesSchema} onChange={(e) => setForm({ ...form, touchesSchema: e.target.checked })} /> Changes the schema</span>
            </label>
            <button className="primary-button" disabled={action.busy}>{action.busy ? 'Working…' : 'Propose'}</button>
          </form>
        )}
        {action.error ? <div className="error-box">{action.error}</div> : null}
        {proposal ? (
          <>
            <div className="note">Untrusted proposal from {proposal.provider} · applied: {String(proposal.applied)} · sha256 {proposal.digest.slice(0, 12)}… {proposal.notes ? `· ${proposal.notes}` : ''}</div>
            <div className="code-block">{proposal.code}</div>
          </>
        ) : null}
      </section>

      <section className="panel full-section">
        <div className="panel-head">
          <div>
            <div className="panel-label">Audit</div>
            <h2>Recorded events</h2>
          </div>
        </div>
        {events.length === 0 ? (
          <Empty>No events recorded.</Empty>
        ) : (
          <table>
            <thead><tr><th>When</th><th>Event</th><th>Detail</th></tr></thead>
            <tbody>
              {[...events].reverse().map((ev) => (
                <tr key={ev.id}>
                  <td>{new Date(ev.at).toLocaleString('en-US')}</td>
                  <td>{ev.event}</td>
                  <td>{String(ev.requestedBy ?? ev.provider ?? '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
