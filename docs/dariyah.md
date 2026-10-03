# Da'Riyah

DMF's internal AI engine. The architecture describes three divisions.

## Status

| Division | Exposure | Status | Implemented |
|---|---|
| **Creative** (Visual Engine) | public | partial | scene planning, prompts, render queue, provider contract |
| **App Builder** | internal | partial | code-model contract, sandbox contract with limits, audit log |
| **Engineering** | internal | partial | code-model contract, migration approval gate, audit log |

Every division is `partial`. **None is `available`**, because no model is
connected in any of them. `engineStatus()` returns `canGenerateVideo: false`,
`canGenerateApps: false`, `canGenerateCode: false`.

Query the live status at any time:

```
GET /api/dariyah                  # all divisions, providers, sandboxes
GET /api/dariyah/divisions/code   # capabilities and blockers for one division
GET /api/dariyah/providers        # video render providers
GET /api/dariyah/audit            # recent audit events
```

## 1. Creative — Da'Riyah Visual Engine

The only division with code behind it. What works:

- `planCuts()` — maps BPM and duration to scene cut times
- `buildScenes()` — composes a per-scene prompt from the selected style preset
- `RenderQueue` — job states, progress, retries, persistence to disk
- `ProviderRegistry` + `PROVIDER_CONTRACT` — the adapter boundary to a video model

What does not work: **frame generation.** `renderFrames()` delegates to the
registry, and the only registered provider is `stubProvider`, which reports
`available: false`. No video model is connected.

To make it work, supply one of the following and register a provider:

- a hosted video API (Runway, Luma, Kling) with credentials, or
- a GPU machine running Stable Video Diffusion or equivalent

Adding one means writing a single object satisfying `PROVIDER_CONTRACT` — three
members: `name`, `available`, `generateClip()`. Nothing else in the pipeline
changes.

## 2. App Builder — Da'Riyah Apps

The pipeline around generation is built. The generation itself is not.

**Built** (`src/dariyah/code.js`, `src/dariyah/sandbox.js`, `src/dariyah/audit.js`):

- `CODE_PROVIDER_CONTRACT` — `name`, `available`, `propose()`
- `CodeProviderRegistry` — registers providers; only the unavailable stub is registered
- `wrapProposal()` — every proposal is untrusted text with a content digest, `applied: false` always
- `SANDBOX_CONTRACT` + `SandboxRunner` — run limits enforced, not trusted from the caller
- `buildRunSpec()` — refuses schema-modifying code outright, routes it to the migration gate
- `AuditLog` — append-only NDJSON record of everything produced
**Not built:** no execution backend. `SandboxRunner` has only `NoSandbox`, which
rejects every run. Generated code has nowhere to run, which is why nothing can
execute yet — including anything malicious.

Adding one means an object satisfying `SANDBOX_CONTRACT` — `name`, `available`,
`run(spec)`. A container runner, a microVM, or a hosted execution service.

## 3. Engineering — Da'Riyah Code

The gate a generated migration must pass is built. The model is not.

**Built** (`src/dariyah/migrations.js`):

- `analyseMigration()` — detects destructive statements (DROP, TRUNCATE, DELETE,
  DISABLE ROW LEVEL SECURITY) and security-touching ones (CREATE POLICY, GRANT,
  REVOKE, SECURITY DEFINER)
- `MigrationGate.approve()` — refuses destructive or security-changing migrations
  without explicit `allowDestructive` / `allowSecurityChange`
- approvals are **digest-bound**: editing the SQL after approval invalidates it
- applied migrations cannot be applied twice; expired approvals are refused
- a corrupt approval store denies everything rather than throwing
**Not built:** `MigrationGate.apply()` throws. The gate decides whether a
migration *may* be applied; it has no database connection. Applying is a
separate step that does not exist here.

**Why the gate comes first.** A generated RLS policy that is wrong does not
throw — it either exposes one artist's rows to another, or returns nothing and
looks like an empty database. Neither failure is visible at apply time. That is
why the approval, digest binding and opt-in flags exist before any model is
connected.

## Namespaces

`supabase/functions/{ai,analytics,royalties,campaigns,notifications,video}/` are
reserved and empty. A reserved folder is not a capability; see
`supabase/README.md`.
