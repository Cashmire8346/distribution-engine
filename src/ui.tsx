import { useCallback, useEffect, useState, type ReactNode } from 'react';

export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    load()
      .then((value) => {
        setData(value);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

export const dollars = (cents: number) =>
  (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US') : '—');

export const count = (n: number) => n.toLocaleString('en-US');

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return <div className="error-box">{message}</div>;
}

export function Panel({ label, title, children, action }: { label: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-head compact">
        <div>
          <div className="panel-label">{label}</div>
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Loading({ error, loading }: { error: string | null; loading: boolean }) {
  if (error) return <ErrorNote message={error} />;
  if (loading) return <div className="empty">Loading…</div>;
  return null;
}

// Runs an action, surfacing the server's message on failure.
export function useAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run };
}
