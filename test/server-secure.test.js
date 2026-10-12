// Boots the real server in a child process and drives the authenticated API
// over HTTP. This is the check that the UI's data layer is real end to end.

import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { ApprovalGate, hashPassword } from '../src/index.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PASSWORD = 'a long test passphrase'

async function freePort() {
  return new Promise((resolve) => {
    const srv = net.createServer().listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

async function boot(env) {
  const port = await freePort()
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srv-'))
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { PATH: process.env.PATH, PORT: String(port), DATA_DIR: dataDir, ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const base = `http://localhost:${port}`
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return { base, dataDir, child }
    } catch {
      await new Promise((r) => setTimeout(r, 100))
    }
  }
  child.kill()
  throw new Error('server did not start')
}

const call = async (base, method, route, { token, body } = {}) => {
  const res = await fetch(`${base}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

let open // server with auth configured
let closed // server with NO auth configured

before(async () => {
  open = await boot({
    DMF_ADMIN_EMAIL: 'owner@dmf.test',
    DMF_ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
    DMF_SESSION_SECRET: 's'.repeat(40)
  })
  closed = await boot({})
})

after(() => {
  open?.child.kill()
  closed?.child.kill()
})

test('with no credentials configured every secure route is closed (503) and login is disabled', async () => {
  for (const route of ['/api/releases', '/api/campaigns', '/api/royalties', '/api/analytics']) {
    assert.equal((await call(closed.base, 'GET', route)).status, 503, route)
  }
  const login = await call(closed.base, 'POST', '/api/auth/login', { body: { email: 'admin@dariyah.io', password: 'da-riyah' } })
  assert.equal(login.status, 503)
  assert.equal((await call(closed.base, 'GET', '/api/health')).json.authConfigured, false)
})

test('secure routes reject missing, malformed and wrong tokens (401)', async () => {
  for (const token of [undefined, 'garbage', 'a.b']) {
    assert.equal((await call(open.base, 'GET', '/api/releases', { token })).status, 401)
  }
  assert.equal((await call(open.base, 'POST', '/api/royalties', { body: {} })).status, 401)
})

test('login: wrong password 401, right password issues a working token', async () => {
  const bad = await call(open.base, 'POST', '/api/auth/login', { body: { email: 'owner@dmf.test', password: 'wrong wrong wrong' } })
  assert.equal(bad.status, 401)

  const ok = await call(open.base, 'POST', '/api/auth/login', { body: { email: 'owner@dmf.test', password: PASSWORD } })
  assert.equal(ok.status, 200)
  const me = await call(open.base, 'GET', '/api/auth/me', { token: ok.json.token })
  assert.equal(me.json.email, 'owner@dmf.test')
})

test('full flow: release -> approval gate, campaign ROI, royalties, metrics, analytics', async () => {
  const { token } = (await call(open.base, 'POST', '/api/auth/login', { body: { email: 'owner@dmf.test', password: PASSWORD } })).json
  const t = { token }

  // Release is created pending; the real delivery gate denies it.
  const created = await call(open.base, 'POST', '/api/releases', { ...t, body: { title: 'Midnight Echo', artist: 'Freezzo', format: 'single' } })
  assert.equal(created.status, 201)
  const id = created.json.release.releaseId
  const gate = new ApprovalGate(path.join(open.dataDir, 'approvals-export.json'))
  assert.equal(gate.canDeliver({ releaseId: id }).approved, false)

  // Approving through the API makes the same file pass the gate, and records who.
  const decided = await call(open.base, 'POST', `/api/releases/${id}/decision`, { ...t, body: { decision: 'approved' } })
  assert.equal(decided.status, 200)
  assert.equal(decided.json.release.decidedBy, 'owner@dmf.test')
  assert.equal(gate.canDeliver({ releaseId: id }).approved, true)
  assert.equal((await call(open.base, 'POST', `/api/releases/${id}/decision`, { ...t, body: { decision: 'rejected' } })).status, 409)

  // Campaign: ROI only once revenue is entered.
  const camp = await call(open.base, 'POST', '/api/campaigns', { ...t, body: { name: 'Summer', spendCents: 20000 } })
  assert.equal(camp.json.campaign.roi, null)
  const patched = await call(open.base, 'PATCH', `/api/campaigns/${camp.json.campaign.id}`, { ...t, body: { attributedRevenueCents: 50000 } })
  assert.equal(patched.json.campaign.roi, 2.5)

  // Royalties: computed split and summary.
  const roy = await call(open.base, 'POST', '/api/royalties', { ...t, body: { artist: 'Freezzo', period: '2026-09', source: 'spotify', grossCents: 100000, artistShareBps: 5000 } })
  assert.equal(roy.json.entry.artistCents, 50000)
  assert.equal((await call(open.base, 'GET', '/api/royalties/summary', t)).json.summary.owedToArtistsCents, 50000)

  // Metrics: refused when unsourced, accepted when sourced, then visible publicly as tracked.
  assert.equal((await call(open.base, 'POST', '/api/roster/metrics', { ...t, body: { artist: 'Freezzo', source: 'guess', metricType: 'x', value: 1 } })).status, 400)
  assert.equal((await call(open.base, 'POST', '/api/roster/metrics', { ...t, body: { artist: 'Freezzo', source: 'spotify', metricType: 'monthly_listeners', value: 42 } })).status, 201)
  const roster = (await call(open.base, 'GET', '/api/roster')).json
  assert.equal(roster.artists.find((a) => a.name === 'Freezzo').tracked, true)
  assert.equal(roster.aggregate.complete, false, 'one artist reporting must not produce a roster total')
  const analytics = (await call(open.base, 'GET', '/api/analytics', t)).json
  assert.equal(analytics.groups[0].artistsReporting, 1)
  assert.equal(analytics.groups[0].total, null)
})

test('code proposal needs a session and fails clearly when no model key is configured', async () => {
  assert.equal((await call(open.base, 'POST', '/api/dariyah/propose', { body: { task: 'x' } })).status, 401)
  const { token } = (await call(open.base, 'POST', '/api/auth/login', { body: { email: 'owner@dmf.test', password: PASSWORD } })).json
  const res = await call(open.base, 'POST', '/api/dariyah/propose', { token, body: { task: 'x' } })
  assert.equal(res.status, 400)
  assert.match(res.json.error, /not configured/)
})

test('static serving cannot escape its directory', async () => {
  for (const route of ['/../server.js', '/..%2fserver.js', '/%2e%2e/package.json']) {
    const res = await fetch(`${open.base}${route}`)
    const text = await res.text()
    assert.ok(!text.includes('createServer'), `${route} leaked server source`)
  }
  const app = await fetch(`${open.base}/app/..%2f..%2fserver.js`)
  assert.ok(!(await app.text()).includes('createServer'))
})
