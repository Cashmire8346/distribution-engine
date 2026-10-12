// Da'Riyah - DMF internal AI engine.
//
// Three divisions are described in the architecture:
//
//   1. CREATE  - the Visual Engine (music videos, visualsizers, storyboards)
//   2. BUILD   - an app builder that generates DMF's internal tools
//   3. CODE    - an engineering engine that writes DMF's code
//
// This module names all three and reports the real status of each. Only the
// parts that exist are marked available. This is deliberately a status surface,
// not a capability claim: querying it tells you what is wired up, and nothing
// here can generate an application or write code.
//
// See docs/dariyah.md for what each division would require.

// Status values, in the order a division moves through them.
export const DIVISION_STATUS = Object.freeze({
  UNAVAILABLE: 'unavailable',
  PARTIAL: 'partial',
  AVAILABLE: 'available'
})

export class DariyahError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'DariyahError'
    Object.assign(this, details)
  }
}

// The division registry. `capabilities` lists what is implemented; `blockedBy`
// lists what is missing. Neither is aspirational - these strings describe the
// code in this repository as it stands.
export const DIVISIONS = Object.freeze({
  create: {
    id: 'create',
    label: 'Da\'Riyah Creative',
    summary: 'Visual Engine - music videos, visualizers, storyboards, promo clips.',
    exposure: 'public',
    status: DIVISION_STATUS.PARTIAL,
    capabilities: [
      { name: 'scene planning from beat grid', path: 'src/video/index.js:planCuts' },
      { name: 'prompt composition from style preset', path: 'src/video/index.js:buildScenes' },
      { name: 'render queue with job states', path: 'src/video/index.js:RenderQueue' },
      { name: 'provider adapter contract', path: 'src/video/providers.js:PROVIDER_CONTRACT' }
    ],
    blockedBy: [
      'no video model is connected (ProviderRegistry has only the unavailable stub)',
      'frame generation is not implemented'
    ]
  },

  build: {
    id: 'build',
    label: 'Da\'Riyah App Builder',
    summary: 'Generates DMF internal applications and admin tools from instructions.',
    exposure: 'internal',
    status: DIVISION_STATUS.PARTIAL,
    capabilities: [
      { name: 'code-model adapter contract', path: 'src/dariyah/code.js:CODE_PROVIDER_CONTRACT' },
      { name: 'sandbox run contract with enforced limits', path: 'src/dariyah/sandbox.js:SANDBOX_CONTRACT' },
      { name: 'schema-modifying proposals refused at the sandbox', path: 'src/dariyah/sandbox.js:buildRunSpec' },
      { name: 'append-only audit log', path: 'src/dariyah/audit.js:AuditLog' }
    ],
    blockedBy: [
      'no code-generation model is connected unless ANTHROPIC_API_KEY is set (the anthropic provider reports unavailable without it)',
      'no sandbox execution backend is connected (SandboxRunner has only NoSandbox)'
    ]
  },

  code: {
    id: 'code',
    label: 'Da\'Riyah Engineering',
    summary: 'Writes and maintains DMF code: SQL, migrations, RLS policies, functions.',
    exposure: 'internal',
    status: DIVISION_STATUS.PARTIAL,
    capabilities: [
      { name: 'code-model adapter contract', path: 'src/dariyah/code.js:CODE_PROVIDER_CONTRACT' },
      { name: 'migration approval gate, digest-bound', path: 'src/dariyah/migrations.js:MigrationGate' },
      { name: 'destructive and security changes require explicit opt-in', path: 'src/dariyah/migrations.js:MigrationGate.approve' },
      { name: 'append-only audit log', path: 'src/dariyah/audit.js:AuditLog' }
    ],
    blockedBy: [
      'no code-generation model is connected unless ANTHROPIC_API_KEY is set (the anthropic provider reports unavailable without it)',
      'applying a migration is not implemented - the gate only decides',
      'the initial RLS migration is written (supabase/migrations) but not applied; applying it needs a MigrationGate approval'
    ]
  }
})

export function listDivisions() {
  return Object.values(DIVISIONS).map((division) => ({
    id: division.id,
    label: division.label,
    summary: division.summary,
    exposure: division.exposure,
    status: division.status,
    capabilityCount: division.capabilities.length,
    blockedBy: [...division.blockedBy]
  }))
}

export function getDivision(id) {
  const division = DIVISIONS[id]
  if (!division) {
    throw new DariyahError(`No division named "${id}"`, { field: 'id' })
  }
  return {
    ...division,
    capabilities: division.capabilities.map((c) => ({ ...c })),
    blockedBy: [...division.blockedBy]
  }
}

// Whether anything in the engine can actually produce output right now.
// Consumers use this instead of inferring capability from the presence of a
// division, which is how a stub gets mistaken for a working feature.
export function engineStatus() {
  const divisions = Object.values(DIVISIONS)
  return {
    engine: 'Da\'Riyah',
    divisions: divisions.length,
    available: divisions.filter((d) => d.status === DIVISION_STATUS.AVAILABLE).length,
    partial: divisions.filter((d) => d.status === DIVISION_STATUS.PARTIAL).length,
    unavailable: divisions.filter((d) => d.status === DIVISION_STATUS.UNAVAILABLE).length,
    canGenerateVideo: false,
    canGenerateApps: false,
    canGenerateCode: false
  }
}
