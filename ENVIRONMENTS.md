# Environment and production-readiness notes

## Why environment config matters

The approval gate's fail-closed guarantee only holds if the runtime environment is also explicit and safe. If a system silently falls back to a permissive default, then the gate is no longer the final authority.

This project intentionally avoids silent defaults:

- `NODE_ENV` must be explicit
- production requires real configuration values
- the demo path is separate from the local development path
- secrets and credentials are never committed to the repository

## Required separation

### Development
- local values are allowed
- watch mode is fine for interactive work
- sample data may be used for demos

### Production
- all required DMF values must be present
- real DSP credentials and identifiers are required before submission
- live approvals must have a matching approved record and valid expiry policy

## Fail-closed rule

If any of the following are missing, the system denies:

- the approval export file
- an approval matching the target release
- a valid approved status
- a non-expired approval record
- required production configuration values

This is the correct default for any delivery or builder path that can affect real DSP data.

## Dashboard authentication

The dashboard (`/app`) and every endpoint that touches money, approvals, or
roster writes require a signed-in session. There is no default account.

- `DMF_ADMIN_EMAIL`, `DMF_ADMIN_PASSWORD_HASH`, `DMF_SESSION_SECRET` must all be
  set (secret at least 32 characters) or login is disabled and those endpoints
  return 503.
- Generate the hash and secret with `node scripts/hash-password.mjs '<password>'`.
- Sessions last 12 hours. Login is throttled to 5 failures per minute per client.
- In the desktop app, put the three values in `<userData>/.env` (KEY=VALUE per line).

## Data files

All under `DATA_DIR` (default `./.data`), written atomically, and a corrupt file
stops the operation rather than being treated as empty:

| File | Contents |
|---|---|
| `roster.json` | Sourced, timestamped artist metrics (`scripts/add-metric.mjs` or the Artists page) |
| `approvals-export.json` | Release records and approvals; the same file `ApprovalGate` reads |
| `campaigns.json` | Campaign spend and attributed revenue |
| `royalties.json` | Royalty statement lines |
| `dariyah-audit.ndjson` | Append-only audit log |
