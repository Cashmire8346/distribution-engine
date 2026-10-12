// Authentication for the DMF dashboard.
//
// Fail closed: with no credentials configured, login is disabled and no token
// can be issued. There is no default account and no demo password.
//
// Config (all required for login to be enabled):
//   DMF_ADMIN_EMAIL           the one admin identity
//   DMF_ADMIN_PASSWORD_HASH   "scrypt$<saltHex>$<hashHex>" (scripts/hash-password.mjs)
//   DMF_SESSION_SECRET        >= 32 chars; signs session tokens
//
// Tokens are "<base64url payload>.<base64url HMAC-SHA256>" with an expiry.

import crypto from 'node:crypto'

const SCRYPT_KEYLEN = 64
export const MIN_SECRET_LENGTH = 32
export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000

export class AuthError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'AuthError'
    Object.assign(this, details)
  }
}

export function hashPassword(password, salt = crypto.randomBytes(16)) {
  if (typeof password !== 'string' || password.length < 12) {
    throw new AuthError('password must be at least 12 characters', { field: 'password' })
  }
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  if (expected.length !== SCRYPT_KEYLEN) return false
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), SCRYPT_KEYLEN)
  return crypto.timingSafeEqual(actual, expected)
}

const b64 = (buf) => Buffer.from(buf).toString('base64url')

export class Auth {
  #email
  #passwordHash
  #secret
  #ttlMs
  #attempts = new Map()

  constructor({ email, passwordHash, secret, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.#email = typeof email === 'string' ? email.trim().toLowerCase() : ''
    this.#passwordHash = passwordHash
    this.#secret = secret
    this.#ttlMs = ttlMs
  }

  static fromEnv(env = process.env) {
    return new Auth({
      email: env.DMF_ADMIN_EMAIL,
      passwordHash: env.DMF_ADMIN_PASSWORD_HASH,
      secret: env.DMF_SESSION_SECRET
    })
  }

  get enabled() {
    return (
      this.#email !== '' &&
      typeof this.#passwordHash === 'string' &&
      this.#passwordHash.startsWith('scrypt$') &&
      typeof this.#secret === 'string' &&
      this.#secret.length >= MIN_SECRET_LENGTH
    )
  }

  #sign(payload) {
    return crypto.createHmac('sha256', this.#secret).update(payload).digest()
  }

  // Max 5 failed attempts per key per minute.
  #throttled(key, now) {
    const recent = (this.#attempts.get(key) ?? []).filter((t) => now - t < 60_000)
    this.#attempts.set(key, recent)
    return recent.length >= 5
  }

  login({ email, password }, { key = 'global', now = Date.now() } = {}) {
    if (!this.enabled) throw new AuthError('Login is disabled: admin credentials are not configured.', { code: 503 })
    if (this.#throttled(key, now)) throw new AuthError('Too many attempts. Try again in a minute.', { code: 429 })

    const emailOk = typeof email === 'string' && email.trim().toLowerCase() === this.#email
    // Always run the hash so timing does not reveal whether the email matched.
    const passOk = verifyPassword(password, this.#passwordHash)
    if (!emailOk || !passOk) {
      this.#attempts.get(key).push(now)
      throw new AuthError('Invalid email or password.', { code: 401 })
    }

    const payload = b64(JSON.stringify({ sub: this.#email, exp: now + this.#ttlMs }))
    return { token: `${payload}.${b64(this.#sign(payload))}`, email: this.#email, expiresAt: new Date(now + this.#ttlMs).toISOString() }
  }

  // Returns { email } for a valid, unexpired token; otherwise null.
  verify(token, now = Date.now()) {
    if (!this.enabled || typeof token !== 'string') return null
    const [payload, signature] = token.split('.')
    if (!payload || !signature) return null

    const expected = this.#sign(payload)
    const given = Buffer.from(signature, 'base64url')
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null

    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      if (typeof claims.exp !== 'number' || claims.exp <= now) return null
      if (claims.sub !== this.#email) return null
      return { email: claims.sub }
    } catch {
      return null
    }
  }

  fromRequest(req) {
    const header = req.headers.authorization || ''
    return this.verify(header.startsWith('Bearer ') ? header.slice(7) : '')
  }
}
