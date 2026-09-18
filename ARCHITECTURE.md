# DMF Distribution System Architecture

## 1. Role in the DMF stack

The Distribution System is the compliance and delivery layer for DMF releases. It sits after the label's operational tooling and before any real DSP submission. It is not a free-form automation layer; it is a controlled, approval-gated release engine.

### System boundaries

- Command Center: local operational client for DMF staff
- Supabase / platform backend: shared memory, metrics, and cloud orchestration
- Distribution System: identifier validation, ERN generation, and safe delivery boundary

The Distribution System is intentionally narrower than the rest of the stack. It does one thing well: evaluate whether a release is valid enough and approved enough to deliver.

## 2. Current modules

- `src/identifiers/`: validation for ISRC, UPC, ISNI, GRID, ownership splits
- `src/ern/`: ERN generation and XML validation
- `src/approvals/`: approval storage and deny-by-default gate
- `src/ern/deliver.js`: the single delivery boundary future sandbox or agent code must call
- `src/config.js`: environment validation for production safety

## 3. Safety model

The Distribution System follows a fail-closed model:

- no approval file means deny
- no matching approval record means deny
- pending, rejected, or expired approval means deny
- invalid ERN structure means deny
- production environment without required values means deny

This is the safety property that matters before anything touches a real DSP: nothing delivers without a recorded human approval.

## 4. Why the approval gate is the boundary

The gate is intentionally the first and last step before delivery. The future Builder Engine or API Agent is not allowed to bypass it.

Any future automation must do this:

1. build a release proposal
2. validate identifiers and XML
3. check approval status
4. only then call the delivery boundary

This keeps the gate as the one shared audit point across all future automation.

## 5. Environment separation

The repo is intentionally explicit about environment behavior:

- `development`: local values and demos are allowed
- `production`: required config must exist or the process fails immediately
- secrets are intentionally excluded from the repository

This is the difference between a system that merely "works on my machine" and one that is production-ready.

## 6. Production-readiness checklist

The Distribution System now includes the concrete production pieces that were missing earlier:

- CI workflow for typecheck / test / build / validation
- explicit environment configuration
- no-secret repo policy
- fail-closed approval gate
- watch mode split from one-shot demo mode
- single delivery boundary enforced by design

## 7. Next step pattern for the other DMF systems

Use the same pattern across Command Center and the Music Platform:

1. add CI workflow
2. make environment config explicit and fail closed
3. keep secrets out of the repo
4. enforce a review boundary before any write or delivery call

That is the real bridge between demo code and operationally safe production code.
