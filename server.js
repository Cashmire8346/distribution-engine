// Minimal static server + JSON API for the DMF roster dashboard.
// Zero dependencies: node:http only, in keeping with the rest of this repo.
//
// Run: node server.js   (or: PORT=8080 node server.js)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

import {
  loadRoster,
  saveRoster,
  Auth,
  AuthError,
  ReleaseStore,
  ReleaseError,
  CampaignStore,
  CampaignError,
  RoyaltyStore,
  RoyaltyError,
  RosterError,
  createAnthropicCodeProvider,
  CodeProviderError,
  StudioStore,
  RenderQueue,
  STYLE_PRESETS,
  VideoError,
  StudioError,
  WorkshopStore,
  WorkshopError,
  createVideoProject,
  ProviderRegistry,
  stubProvider,
  engineStatus,
  listDivisions,
  getDivision,
  CodeProviderRegistry,
  SandboxRunner,
  AuditLog,
  stubCodeProvider,
  NoSandbox
} from './src/index.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(here, 'public')
const distDir = path.join(here, 'dist')
const dataDir = process.env.DATA_DIR || path.join(here, '.data')
const port = Number(process.env.PORT || 3000)

const studio = new StudioStore(path.join(dataDir, 'studio'))
const video = new RenderQueue(path.join(dataDir, 'video'))
const workshop = new WorkshopStore(path.join(dataDir, 'workshop'))

// Da'Riyah render providers. Only the stub is registered, and it reports
// available: false, so nothing can claim to have rendered video.
const providers = new ProviderRegistry()
providers.register(stubProvider)

// Da'Riyah Engineering. Only stubs registered: no model proposes code, and no
// sandbox can run it. Both report available: false.
const codeProviders = new CodeProviderRegistry()
codeProviders.register(stubCodeProvider)
// Real provider. Reports available only when ANTHROPIC_API_KEY is set.
codeProviders.register(createAnthropicCodeProvider())

const sandboxes = new SandboxRunner()
sandboxes.register(NoSandbox)

// Append-only record of everything the engine produces.
const audit = new AuditLog(path.join(dataDir, 'dariyah-audit.ndjson'))

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8'
}

function readJsonBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limitBytes) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw === '') return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Request body is not valid JSON'))
      }
    })
    req.on('error', reject)
  })
}

// Built once at boot. If the seed is malformed the process exits loudly
// rather than serving a half-populated roster.
// Identity comes from ROSTER_SEED; sourced metrics come from DATA_DIR/roster.json
// (see scripts/add-metric.mjs). A corrupt file stops boot instead of hiding data.
const rosterFile = path.join(dataDir, 'roster.json')
const roster = loadRoster(rosterFile)

// Ledgers. The approvals file is the one ApprovalGate reads at delivery time.
const approvalsFile = process.env.DMF_APPROVALS_FILE || path.join(dataDir, 'approvals-export.json')
const releases = new ReleaseStore(approvalsFile)
const campaigns = new CampaignStore(path.join(dataDir, 'campaigns.json'))
const royalties = new RoyaltyStore(path.join(dataDir, 'royalties.json'))

// Login is disabled unless admin credentials are configured (see src/auth).
const auth = Auth.fromEnv()

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  })
  res.end(payload)
}

function isInside(root, target) {
  const rel = path.relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

// Serves the built React app (npm run build -> dist/) under /app. Unknown
// paths fall back to index.html so client-side routes survive a refresh.
function serveApp(res, urlPath) {
  const distIndex = path.join(distDir, 'index.html')
  if (!fs.existsSync(distIndex)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('The dashboard is not built. Run: npm run build')
    return
  }
  const relative = urlPath.replace(/^\/app\/?/, '')
  const candidate = path.join(distDir, path.normalize(relative))
  const target = relative !== '' && isInside(distDir, candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : distIndex
  fs.readFile(target, (error, file) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'content-type': CONTENT_TYPES[path.extname(target)] || 'application/octet-stream' })
    res.end(file)
  })
}

function serveStatic(res, urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath
  const resolved = path.join(publicDir, path.normalize(requested))

  // Path traversal guard: anything escaping publicDir is refused.
  if (!isInside(publicDir, resolved)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Forbidden')
    return
  }

  fs.readFile(resolved, (error, file) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    const type = CONTENT_TYPES[path.extname(resolved)] || 'application/octet-stream'
    res.writeHead(200, { 'content-type': type })
    res.end(file)
  })
}

// ---- Authenticated API ---------------------------------------------------
// Everything that touches money, approvals, or writes roster data requires a
// valid session. Returns true when it handled (or is handling) the request.
const SECURE_PATHS = [
  /^\/api\/auth\/(login|me)$/,
  /^\/api\/releases(\/[0-9a-f-]{36}\/decision)?$/,
  /^\/api\/campaigns(\/[0-9a-f-]{36})?$/,
  /^\/api\/royalties(\/summary|\/[0-9a-f-]{36}\/paid)?$/,
  /^\/api\/analytics$/,
  /^\/api\/roster\/metrics$/,
  /^\/api\/dariyah\/propose$/
]

const STATUS_BY_ERROR = (error) => {
  if (Number.isInteger(error.code) && error.code >= 400 && error.code < 600) return error.code
  const known =
    error instanceof ReleaseError ||
    error instanceof CampaignError ||
    error instanceof RoyaltyError ||
    error instanceof RosterError ||
    error instanceof CodeProviderError ||
    error instanceof AuthError
  return known ? 400 : 500
}

function secureRoute(req, res, url) {
  const p = url.pathname
  if (!SECURE_PATHS.some((re) => re.test(p))) return false

  const fail = (error) => sendJson(res, STATUS_BY_ERROR(error), { error: error.message, field: error.field ?? null })
  const body = () => (req.method === 'GET' ? Promise.resolve({}) : readJsonBody(req))
  const send = (status, payload) => sendJson(res, status, payload)

  if (p === '/api/auth/login') {
    if (req.method !== 'POST') return send(405, { error: 'Method not allowed' }), true
    body()
      .then((b) => send(200, auth.login(b, { key: req.socket.remoteAddress || 'unknown' })))
      .catch(fail)
    return true
  }

  // Everything below needs a session. If login is not configured, nothing can
  // ever authenticate, so these routes are closed rather than open.
  if (!auth.enabled) {
    send(503, { error: 'Authentication is not configured. Set DMF_ADMIN_EMAIL, DMF_ADMIN_PASSWORD_HASH and DMF_SESSION_SECRET.' })
    return true
  }
  const session = auth.fromRequest(req)
  if (!session) {
    send(401, { error: 'Sign in required' })
    return true
  }

  if (p === '/api/auth/me') return send(200, { email: session.email }), true

  const route = (handler) => {
    Promise.resolve()
      .then(() => body())
      .then((b) => handler(b))
      .catch(fail)
    return true
  }
  const m = req.method

  if (p === '/api/analytics' && m === 'GET') return route(() => send(200, { groups: roster.analytics() }))

  if (p === '/api/roster/metrics' && m === 'POST') {
    return route((b) => {
      const metric = { source: b.source, metricType: b.metricType, value: b.value, asOf: b.asOf || new Date().toISOString() }
      roster.addMetric(b.artist, metric)
      saveRoster(roster, rosterFile)
      send(201, { artist: roster.get(b.artist) })
    })
  }

  if (p === '/api/releases') {
    if (m === 'GET') return route(() => send(200, { releases: releases.list() }))
    if (m === 'POST') return route((b) => send(201, { release: releases.create(b, { requestedBy: session.email }) }))
  }
  const decision = p.match(/^\/api\/releases\/([0-9a-f-]{36})\/decision$/)
  if (decision && m === 'POST') {
    return route((b) =>
      send(200, { release: releases.decide(decision[1], { decision: b.decision, by: session.email, ttlDays: b.ttlDays ?? undefined }) })
    )
  }

  if (p === '/api/campaigns') {
    if (m === 'GET') return route(() => send(200, { campaigns: campaigns.list() }))
    if (m === 'POST') return route((b) => send(201, { campaign: campaigns.create(b) }))
  }
  const campaignId = p.match(/^\/api\/campaigns\/([0-9a-f-]{36})$/)
  if (campaignId && m === 'PATCH') return route((b) => send(200, { campaign: campaigns.update(campaignId[1], b) }))

  if (p === '/api/royalties/summary' && m === 'GET') return route(() => send(200, { summary: royalties.summary() }))
  if (p === '/api/royalties') {
    if (m === 'GET') return route(() => send(200, { entries: royalties.list() }))
    if (m === 'POST') return route((b) => send(201, { entry: royalties.add(b) }))
  }
  const paid = p.match(/^\/api\/royalties\/([0-9a-f-]{36})\/paid$/)
  if (paid && m === 'POST') return route(() => send(200, { entry: royalties.markPaid(paid[1]) }))

  if (p === '/api/dariyah/propose' && m === 'POST') {
    return route((b) =>
      codeProviders.propose({ ...b, requestedBy: session.email }).then((proposal) => {
        audit.append('proposal.created', {
          proposalId: proposal.id,
          provider: proposal.provider,
          digest: proposal.digest,
          touchesSchema: proposal.touchesSchema,
          requestedBy: session.email
        })
        // The proposal is text. Nothing has been run or applied.
        send(201, { proposal })
      })
    )
  }

  send(405, { error: 'Method not allowed' })
  return true
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (secureRoute(req, res, url)) return

  if (req.method === 'GET' && (url.pathname === '/app' || url.pathname.startsWith('/app/'))) {
    return serveApp(res, url.pathname)
  }

  if (req.method === 'GET') {
    if (url.pathname === '/api/roster') return sendJson(res, 200, roster.toJSON())

    if (url.pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        artists: roster.list().length,
        metricsTracked: roster.analytics().length > 0,
        authConfigured: auth.enabled,
        studioSessions: studio.list().length,
        videoJobs: video.list().length
      })
    }

    if (url.pathname === '/api/workshop') return sendJson(res, 200, { items: workshop.list() })

    if (url.pathname === '/api/studio/sessions') {
      return sendJson(res, 200, { sessions: studio.list() })
    }

    const sessionMatch = url.pathname.match(/^\/api\/studio\/sessions\/([0-9a-f-]{36})$/)
    if (sessionMatch) {
      const session = studio.get(sessionMatch[1])
      if (!session) return sendJson(res, 404, { error: 'No such session' })
      return sendJson(res, 200, { session, mix: studio.validateMix(session.id) })
    }

    const manifestMatch = url.pathname.match(/^\/api\/studio\/sessions\/([0-9a-f-]{36})\/export$/)
    if (manifestMatch) {
      try {
        return sendJson(res, 200, { manifest: studio.exportManifest(manifestMatch[1]) })
      } catch (error) {
        return sendJson(res, 400, { error: error.message })
      }
    }

    if (url.pathname === '/api/video/presets') {
      return sendJson(res, 200, { presets: STYLE_PRESETS })
    }

    // Da'Riyah render providers and whether any can actually produce frames.
    if (url.pathname === '/api/dariyah/providers') {
      return sendJson(res, 200, {
        providers: providers.list(),
        renderAvailable: providers.active() !== null,
        note: 'No video model is connected. Scene planning and job queueing work; frame generation does not.'
      })
    }

    // Da'Riyah engine divisions and their real status.
    if (url.pathname === '/api/dariyah') {
      return sendJson(res, 200, {
        status: engineStatus(),
        divisions: listDivisions(),
        codeProviders: codeProviders.list(),
        sandboxes: sandboxes.list(),
        canProposeCode: codeProviders.active() !== null,
        canRunGeneratedCode: sandboxes.active() !== null
      })
    }

    if (url.pathname === '/api/dariyah/audit') {
      return sendJson(res, 200, { events: audit.read({ limit: 100 }) })
    }

    const divisionMatch = url.pathname.match(/^\/api\/dariyah\/divisions\/([a-z]+)$/)
    if (divisionMatch) {
      try {
        return sendJson(res, 200, { division: getDivision(divisionMatch[1]) })
      } catch (error) {
        return sendJson(res, 404, { error: error.message })
      }
    }

    if (url.pathname === '/api/video/jobs') {
      return sendJson(res, 200, { jobs: video.list() })
    }

    const jobMatch = url.pathname.match(/^\/api\/video\/jobs\/([0-9a-f-]{36})$/)
    if (jobMatch) {
      const job = video.get(jobMatch[1])
      if (!job) return sendJson(res, 404, { error: 'No such job' })
      return sendJson(res, 200, { job, progress: video.progress(job.id) })
    }

    return serveStatic(res, url.pathname)
  }

  // Track-level edits: mix changes, mute, and removal.
  const trackIdMatch = url.pathname.match(/^\/api\/studio\/sessions\/([0-9a-f-]{36})\/tracks\/([0-9a-f-]{36})$/)

  if (req.method === 'DELETE' && trackIdMatch) {
    try {
      const session = studio.removeTrack(trackIdMatch[1], trackIdMatch[2])
      return sendJson(res, 200, { session })
    } catch (error) {
      return sendJson(res, error instanceof StudioError ? 400 : 500, { error: error.message })
    }
  }

  if (req.method === 'PATCH' && trackIdMatch) {
    return readJsonBody(req)
      .then((body) => {
        const session = studio.updateTrack(trackIdMatch[1], trackIdMatch[2], body)
        sendJson(res, 200, { session })
      })
      .catch((error) => {
        sendJson(res, error instanceof StudioError ? 400 : 500, { error: error.message })
      })
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Method not allowed')
    return
  }

  readJsonBody(req)
    .then((body) => {
      if (url.pathname === '/api/workshop') {
        return sendJson(res, 201, { item: workshop.create(body) })
      }

      if (url.pathname === '/api/studio/sessions') {
        const session = studio.create(body)
        return sendJson(res, 201, { session })
      }

      const trackMatch = url.pathname.match(/^\/api\/studio\/sessions\/([0-9a-f-]{36})\/tracks$/)
      if (trackMatch) {
        const session = studio.addTrack(trackMatch[1], body)
        return sendJson(res, 201, { session })
      }

      if (url.pathname === '/api/video/jobs') {
        // The body describes a project; enqueue expects a built project, so
        // it is validated and constructed here first.
        const project = createVideoProject(body)
        const job = video.enqueue(project, { barsPerCut: Number(body.barsPerCut) || 4 })
        return sendJson(res, 201, { job })
      }

      sendJson(res, 404, { error: 'No such endpoint' })
    })
    .catch((error) => {
      const known =
        error instanceof StudioError ||
        error instanceof VideoError ||
        error instanceof WorkshopError ||
        error instanceof CodeProviderError
      sendJson(res, known ? 400 : 500, { error: error.message, field: error.field ?? null })
    })
})

server.listen(port, () => {
  console.log(`DMF roster dashboard listening on http://localhost:${port}`)
  console.log(`Roster: ${roster.list().length} artists | unlinked Spotify: ${roster.unlinked().join(', ') || 'none'}`)
})
