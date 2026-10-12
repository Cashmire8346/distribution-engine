import { get, type AnalyticsGroup } from '../api';
import { Empty, Loading, count, date, useLoad } from '../ui';

export default function Analytics() {
  const { data, error, loading } = useLoad(() => get<{ groups: AnalyticsGroup[] }>('/api/analytics'));
  if (!data) return <Loading error={error} loading={loading} />;

  return (
    <section className="panel full-section">
      <div className="panel-head">
        <div>
          <div className="panel-label">Analytics</div>
          <h2>Performance by source</h2>
        </div>
      </div>

      {data.groups.length === 0 ? (
        <Empty>No sourced readings yet. Record them on the Artists page; nothing here is estimated.</Empty>
      ) : (
        data.groups.map((g) => (
          <div key={`${g.source}-${g.metricType}`} style={{ marginBottom: 24 }}>
            <div className="analytics-summary">
              <div className="metric-tile">
                <span>{g.source} · {g.metricType}</span>
                <strong>{g.complete && g.total !== null ? count(g.total) : 'Incomplete'}</strong>
              </div>
              <div className="metric-tile">
                <span>Artists reporting</span>
                <strong>{g.artistsReporting} / {g.artistsTotal}</strong>
              </div>
            </div>
            {!g.complete ? (
              <div className="note">No total is shown until every artist on the roster has a reading, because a partial sum would look authoritative and not be.</div>
            ) : null}
            <table>
              <thead><tr><th>Artist</th><th>Value</th><th>As of</th></tr></thead>
              <tbody>
                {g.readings.map((r) => (
                  <tr key={r.artist}><td>{r.artist}</td><td>{count(r.value)}</td><td>{date(r.asOf)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </section>
  );
}
