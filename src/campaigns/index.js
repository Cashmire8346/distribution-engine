// Campaign ledger.
//
// Spend and attributed revenue are entered by a person, in integer cents.
// ROI is derived, and only when BOTH a positive spend and an attributed
// revenue figure exist. Otherwise it is null ("not measured"), never a guess.

import crypto from 'node:crypto'

import { readJsonFile, writeJsonFile } from '../jsonstore.js'

export const CAMPAIGN_STATUSES = Object.freeze(['planned', 'live', 'paused', 'complete'])

export class CampaignError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'CampaignError'
    Object.assign(this, details)
  }
}

const cents = (value, field, { nullable = false } = {}) => {
  if (value == null || value === '') {
    if (nullable) return null
    throw new CampaignError(`${field} is required`, { field })
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new CampaignError(`${field} must be a non-negative integer number of cents`, { field })
  }
  return value
}

export function roiFor(campaign) {
  if (campaign.attributedRevenueCents == null || !(campaign.spendCents > 0)) return null
  return Math.round((campaign.attributedRevenueCents / campaign.spendCents) * 100) / 100
}

export class CampaignStore {
  #file

  constructor(file) {
    this.#file = file
  }

  #read() {
    const data = readJsonFile(this.#file, { campaigns: [] })
    if (!data || !Array.isArray(data.campaigns)) {
      throw new CampaignError(`campaign file must contain a "campaigns" array: ${this.#file}`)
    }
    return data
  }

  list() {
    return this.#read().campaigns.map((c) => ({ ...c, roi: roiFor(c) }))
  }

  create(input = {}, now = new Date()) {
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    if (name === '') throw new CampaignError('name is required', { field: 'name' })
    const status = input.status ?? 'planned'
    if (!CAMPAIGN_STATUSES.includes(status)) {
      throw new CampaignError(`status must be one of ${CAMPAIGN_STATUSES.join(', ')}`, { field: 'status' })
    }

    const campaign = {
      id: crypto.randomUUID(),
      name,
      status,
      channel: typeof input.channel === 'string' && input.channel.trim() ? input.channel.trim() : null,
      spendCents: cents(input.spendCents ?? 0, 'spendCents'),
      attributedRevenueCents: cents(input.attributedRevenueCents, 'attributedRevenueCents', { nullable: true }),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }

    const data = this.#read()
    if (data.campaigns.some((c) => c.name === name)) {
      throw new CampaignError('a campaign with this name already exists', { field: 'name', code: 409 })
    }
    data.campaigns.push(campaign)
    writeJsonFile(this.#file, data)
    return { ...campaign, roi: roiFor(campaign) }
  }

  update(id, patch = {}, now = new Date()) {
    const data = this.#read()
    const campaign = data.campaigns.find((c) => c.id === id)
    if (!campaign) throw new CampaignError('No such campaign', { field: 'id', code: 404 })

    if (patch.status !== undefined) {
      if (!CAMPAIGN_STATUSES.includes(patch.status)) {
        throw new CampaignError(`status must be one of ${CAMPAIGN_STATUSES.join(', ')}`, { field: 'status' })
      }
      campaign.status = patch.status
    }
    if (patch.spendCents !== undefined) campaign.spendCents = cents(patch.spendCents, 'spendCents')
    if (patch.attributedRevenueCents !== undefined) {
      campaign.attributedRevenueCents = cents(patch.attributedRevenueCents, 'attributedRevenueCents', { nullable: true })
    }
    campaign.updatedAt = now.toISOString()

    writeJsonFile(this.#file, data)
    return { ...campaign, roi: roiFor(campaign) }
  }
}
