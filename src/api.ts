// Thin client for the real DMF API. No fallback data lives here or anywhere in
// the UI: if a request fails, the page shows the error.

const TOKEN_KEY = 'dmf-token';

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the session simply will not persist */
  }
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the DMF server. Is it running?', 0);
  }

  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    setToken(null);
    window.dispatchEvent(new Event('dmf-auth-expired'));
  }
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data as T;
}

export const get = <T,>(path: string) => api<T>('GET', path);
export const post = <T,>(path: string, body: unknown = {}) => api<T>('POST', path, body);
export const patch = <T,>(path: string, body: unknown) => api<T>('PATCH', path, body);

// ---- Types mirroring the server's JSON ----------------------------------

export type Metric = { source: string; metricType: string; value: number; asOf: string };

export type Artist = {
  name: string;
  role: string;
  location: string | null;
  vibe: string | null;
  bio: string | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
  metrics: Metric[];
  tracked: boolean;
};

export type RosterSnapshot = {
  header: string;
  artists: Artist[];
  unlinked: string[];
  aggregate: { complete: boolean; total: number | null; reason?: string; missing?: string[]; asOf?: string };
};

export type Release = {
  releaseId: string;
  title: string;
  artist: string;
  format: 'single' | 'ep' | 'album';
  releaseDate: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  requestedBy: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  expiresAt: string | null;
};

export type Campaign = {
  id: string;
  name: string;
  status: 'planned' | 'live' | 'paused' | 'complete';
  channel: string | null;
  spendCents: number;
  attributedRevenueCents: number | null;
  roi: number | null;
};

export type RoyaltyEntry = {
  id: string;
  artist: string;
  period: string;
  source: string;
  grossCents: number;
  artistShareBps: number;
  artistCents: number;
  labelCents: number;
  statementRef: string | null;
  paidAt: string | null;
};

export type RoyaltySummary = {
  entries: number;
  grossCents: number;
  artistCents: number;
  labelCents: number;
  owedToArtistsCents: number;
  bySource: { source: string; grossCents: number }[];
};

export type AnalyticsGroup = {
  source: string;
  metricType: string;
  artistsReporting: number;
  artistsTotal: number;
  complete: boolean;
  total: number | null;
  readings: { artist: string; value: number; asOf: string }[];
};

export type Division = {
  id: string;
  label: string;
  summary: string;
  exposure: string;
  status: string;
  capabilityCount: number;
  blockedBy: string[];
};

export type DariyahStatus = {
  divisions: Division[];
  codeProviders: { name: string; available: boolean; active: boolean }[];
  sandboxes: { name: string; available: boolean; active: boolean }[];
  canProposeCode: boolean;
  canRunGeneratedCode: boolean;
};

export type AuditEvent = { id: string; event: string; at: string; [key: string]: unknown };

export type Proposal = {
  id: string;
  provider: string;
  language: string;
  code: string;
  notes: string;
  digest: string;
  applied: boolean;
  touchesSchema: boolean;
};
