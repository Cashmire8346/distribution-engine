import crypto from 'node:crypto'
import {
  validateIsrc,
  validateUpc,
  validateIsni,
  validateGrid,
  validateOwnershipSplit,
  validateReleaseIdentifiers
} from './identifiers/index.js'

export {
  validateIsrc,
  validateUpc,
  validateIsni,
  validateGrid,
  validateOwnershipSplit,
  validateReleaseIdentifiers
}

export { generateErn, validateErnXml } from './ern/index.js'
export { FileApprovalStore, ApprovalGate } from './approvals/index.js'
export { deliverErn } from './ern/deliver.js'

export { createAnthropicCodeProvider, DEFAULT_ANTHROPIC_MODEL } from './dariyah/anthropic-provider.js'

export {
  Roster,
  RosterError,
  ROSTER_SEED,
  ROSTER_ROLES,
  ROSTER_METRIC_SOURCES,
  parseSpotifyArtistUrl,
  validateMetric
} from './roster/index.js'
export { Auth, AuthError, hashPassword, verifyPassword } from './auth/index.js'
export { ReleaseStore, ReleaseError, RELEASE_FORMATS } from './releases/index.js'
export { CampaignStore, CampaignError, CAMPAIGN_STATUSES, roiFor } from './campaigns/index.js'
export { RoyaltyStore, RoyaltyError, ROYALTY_SOURCES, splitGross } from './royalties/index.js'
export { loadRoster, saveRoster, recordMetric, rosterFromRows } from './roster/persist.js'

export {
  StudioStore,
  StudioError,
  SESSION_STATUSES,
  TRACK_KINDS,
  createSession,
  normaliseTrack,
  processAudio
} from './studio/index.js'

export { WorkshopStore, WorkshopError, WORKSHOP_STATUSES, createWorkshopItem } from './workshop/index.js'

export {
  RenderQueue,
  VideoError,
  STYLE_PRESETS,
  JOB_STATES,
  planCuts,
  buildScenes,
  createVideoProject,
  renderFrames
} from './video/index.js'

// Da'Riyah provider adapters - the boundary between this engine and an
// external video model.
export {
  ProviderRegistry,
  ProviderNotConfiguredError,
  PROVIDER_CONTRACT,
  buildClipRequest,
  validateProvider,
  stubProvider
} from './video/providers.js'

// Da'Riyah engine divisions and their real status.
export {
  DIVISIONS,
  DIVISION_STATUS,
  DariyahError,
  listDivisions,
  getDivision,
  engineStatus
} from './dariyah/index.js'

// Da'Riyah Engineering - the gate a generated migration must pass.
export {
  MigrationGate,
  MigrationApprovalStore,
  MigrationGateError,
  MIGRATION_KINDS,
  analyseMigration,
  createMigration,
  digestSql
} from './dariyah/migrations.js'

// Da'Riyah Engineering - code-model adapter contract.
export {
  CodeProviderRegistry,
  CodeProviderError,
  CodeModelNotConfiguredError,
  CODE_PROVIDER_CONTRACT,
  CODE_LANGUAGES,
  buildCodeRequest,
  wrapProposal,
  validateCodeProvider,
  stubCodeProvider
} from './dariyah/code.js'

// Da'Riyah App Builder - sandbox contract for running generated code.
export {
  SandboxRunner,
  SandboxError,
  NoSandboxAvailableError,
  SANDBOX_CONTRACT,
  SANDBOX_LIMITS,
  buildRunSpec,
  validateSandbox,
  NoSandbox
} from './dariyah/sandbox.js'

// Da'Riyah - append-only audit log for generated artefacts.
export { AuditLog, AuditError, AUDIT_EVENTS } from './dariyah/audit.js'

export class InMemoryIdentifierStore {
  #releases = new Map()
  #isrcs = new Map()

  create(release) {
    if (!release || typeof release !== 'object' || !validateReleaseIdentifiers(release)) {
      throw new Error('Release identifiers are invalid')
    }

    const upc = String(release.upc)
    const isrc = String(release.isrc)

    if (this.#releases.has(upc)) {
      throw new Error(`A release with UPC ${upc} is already registered`)
    }
    if (this.#isrcs.has(isrc)) {
      throw new Error(`A release with ISRC ${isrc} is already registered`)
    }

    const record = { ...release, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    this.#releases.set(upc, record)
    this.#isrcs.set(isrc, record)
    return record
  }

  get(upc) {
    return this.#releases.get(String(upc))
  }
}
