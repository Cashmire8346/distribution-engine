import test from 'node:test'
import assert from 'node:assert/strict'

import { Auth, AuthError, hashPassword, verifyPassword } from '../src/index.js'

const SECRET = 'x'.repeat(40)
const PASSWORD = 'correct horse battery'
const make = (overrides = {}) =>
  new Auth({ email: 'Owner@DMF.test', passwordHash: hashPassword(PASSWORD), secret: SECRET, ...overrides })

test('hashing: salted, verifiable, and rejects wrong or malformed input', () => {
  const a = hashPassword(PASSWORD)
  const b = hashPassword(PASSWORD)
  assert.notEqual(a, b, 'each hash must use a fresh salt')
  assert.equal(verifyPassword(PASSWORD, a), true)
  assert.equal(verifyPassword('wrong password!!', a), false)
  assert.equal(verifyPassword(PASSWORD, 'not-a-hash'), false)
  assert.equal(verifyPassword(PASSWORD, 'scrypt$zz$00'), false)
  assert.throws(() => hashPassword('short'), AuthError)
})

test('with no credentials configured, login is disabled and no token can be issued', () => {
  for (const auth of [new Auth(), make({ secret: 'too short' }), make({ passwordHash: 'plaintext' }), make({ email: '' })]) {
    assert.equal(auth.enabled, false)
    assert.throws(() => auth.login({ email: 'Owner@DMF.test', password: PASSWORD }), (e) => e.code === 503)
    assert.equal(auth.verify('anything.at-all'), null)
  }
})

test('there is no default or demo account', () => {
  const auth = Auth.fromEnv({})
  assert.equal(auth.enabled, false)
  assert.throws(() => auth.login({ email: 'admin@dariyah.io', password: 'da-riyah' }), AuthError)
})

test('valid login issues a token that verifies; email match is case-insensitive', () => {
  const auth = make()
  const { token, email } = auth.login({ email: ' owner@dmf.TEST ', password: PASSWORD })
  assert.equal(email, 'owner@dmf.test')
  assert.deepEqual(auth.verify(token), { email: 'owner@dmf.test' })
})

test('wrong email or password is a 401 with the same message', () => {
  const auth = make()
  const badEmail = assert.throws(() => auth.login({ email: 'x@y.z', password: PASSWORD }), (e) => e.code === 401)
  assert.throws(() => auth.login({ email: 'owner@dmf.test', password: 'nope nope nope' }), (e) => e.code === 401 && e.message === 'Invalid email or password.')
  void badEmail
})

test('tokens expire, and tampered or foreign-secret tokens are rejected', () => {
  const auth = make({ ttlMs: 1000 })
  const now = 1_000_000
  const { token } = auth.login({ email: 'owner@dmf.test', password: PASSWORD }, { now })
  assert.ok(auth.verify(token, now + 999))
  assert.equal(auth.verify(token, now + 1000), null, 'expired')

  const [payload, sig] = token.split('.')
  const forged = Buffer.from(JSON.stringify({ sub: 'owner@dmf.test', exp: now + 10 ** 12 })).toString('base64url')
  assert.equal(auth.verify(`${forged}.${sig}`, now), null, 'payload swapped under the old signature')
  assert.equal(auth.verify(`${payload}.`, now), null)
  assert.equal(make({ secret: 'y'.repeat(40) }).verify(token, now), null, 'signed with another secret')
})

test('login is throttled after 5 failures per key', () => {
  const auth = make()
  const opts = { key: '1.2.3.4', now: 5_000_000 }
  for (let i = 0; i < 5; i++) {
    assert.throws(() => auth.login({ email: 'owner@dmf.test', password: 'bad bad bad bad' }, opts), (e) => e.code === 401)
  }
  assert.throws(() => auth.login({ email: 'owner@dmf.test', password: PASSWORD }, opts), (e) => e.code === 429)
  // A minute later it is allowed again.
  assert.ok(auth.login({ email: 'owner@dmf.test', password: PASSWORD }, { ...opts, now: opts.now + 61_000 }).token)
})
