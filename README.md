# DMF Distribution Engine

This is the first sequential layer of direct distribution: validate DMF-owned identifiers, generate an ERN 4.3-shaped XML package, and enforce a fail-closed approval gate before delivery is allowed.

## Production-ready pipeline

The project now includes the same production guard rails you want across the rest of DMF:

- CI workflow in `.github/workflows/ci.yml`
- explicit environment validation in `src/config.js`
- fail-closed approval gate in `src/approvals/index.js`
- a delivery boundary in `src/ern/deliver.js`
- no secrets committed via `.env.example` and `.gitignore`

## Run

```bash
npm install
npm test
npm run build    # builds the dashboard into dist/
npm start        # server on http://localhost:3000  (dashboard at /app)
npm run electron # desktop app
```

The dashboard at `/app` shows only real data: roster, sourced metrics, releases and
approvals, campaigns, royalties, and Da'Riyah status. Where nothing has been recorded it
says so. It needs a login: see `ENVIRONMENTS.md` ("Dashboard authentication") and run
`node scripts/hash-password.mjs '<password>'`.

For UI development run `npm start` and `npm run dev` together; Vite proxies `/api`.
The plain Roster, Studio, Da'Riyah video and Workshop pages are still served from `public/`.

Record a sourced metric from the command line:

```bash
node scripts/add-metric.mjs "Freezzo" spotify monthly_listeners 1234
```

## Approval gate behavior

Delivery is denied by default unless a matching approved record exists in the approval export file.

The gate intentionally fails closed for:

- no approval file present
- missing matching approval record
- pending approval
- rejected approval
- expired approval

This gate is the single delivery boundary future sandbox or agent code must pass through.

## Important limits

- The ERN output is structurally validated by the local checks; it has not been validated against the official DDEX XSD.
- No identifier, artist, owner, or DSP party value is bundled. Delivery fails when any required real value is missing.
- Test fixtures exist only inside the automated tests and are never used by the delivery path.
- This package does not submit releases to DSPs, mint identifiers, or bypass approval. Those steps remain later stages.
