const ISRC_PATTERN = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/
const UPC_PATTERN = /^(\d{12}|\d{13})$/
const ISNI_PATTERN = /^\d{15}[0-9X]$/
const GRID_PATTERN = /^[A-Z0-9][A-Z0-9-]{5,24}$/

function upcCheckDigit(value) {
  const digits = value.slice(0, -1).split('').map(Number)
  const sum = digits.reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0)
  return String((10 - (sum % 10)) % 10)
}

export function validateIsrc(value) {
  return typeof value === 'string' && ISRC_PATTERN.test(value)
}

export function validateUpc(value) {
  return typeof value === 'string' && UPC_PATTERN.test(value) && upcCheckDigit(value) === value.at(-1)
}

export function validateIsni(value) {
  if (typeof value !== 'string' || !ISNI_PATTERN.test(value)) return false
  const digits = value.slice(0, 15).split('').map(Number)
  let total = 0
  for (const digit of digits) total = (total + digit) * 2
  const remainder = total % 11
  const check = (12 - remainder) % 11
  return (check === 10 ? 'X' : String(check)) === value.at(-1)
}

export function validateGrid(value) {
  return typeof value === 'string' && GRID_PATTERN.test(value)
}

export function validateOwnershipSplit(owners) {
  if (!Array.isArray(owners) || owners.length === 0) return false

  const total = owners.reduce((sum, owner) => {
    if (!owner || typeof owner !== 'object') return sum
    return sum + Number(owner.share || 0)
  }, 0)

  return owners.every((owner) => {
    if (!owner || typeof owner !== 'object') return false
    const share = Number(owner.share)
    return typeof owner.name === 'string' && owner.name.trim().length > 0 && Number.isFinite(share) && share >= 0
  }) && total === 100
}

export function validateReleaseIdentifiers(release) {
  if (!release || typeof release !== 'object') return false
  if (!validateIsrc(release.isrc) || !validateUpc(release.upc)) return false
  if (!Array.isArray(release.owners)) return false
  return validateOwnershipSplit(release.owners)
}
