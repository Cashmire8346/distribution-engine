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
