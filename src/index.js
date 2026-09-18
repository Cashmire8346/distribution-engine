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
