// Minimal static server + JSON API for the DMF roster dashboard.
// Zero dependencies: node:http only, in keeping with the rest of this repo.
//
// Run: node server.js   (or: PORT=8080 node server.js)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  Roster,
  ROSTER_SEED,
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

const sandboxes = new SandboxRunner()
sandboxes.register(NoSandbox)

// Append-only record of everything the engine produces.
const audit = new AuditLog(path.join(dataDir, 'dariyah-audit.ndjson'))

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml'
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
const roster = Roster.from(ROSTER_SEED)

function sendJson(res, status, body) {
  const payload = JSON.stringify(body, null, 2)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store'
  })
  res.end(payload)
}

function serveStatic(res, urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath
  const resolved = path.join(publicDir, path.normalize(requested))

  // Path traversal guard: anything escaping publicDir is refused.
  if (!resolved.startsWith(publicDir)) {
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)

  if (req.method === 'GET') {
    if (url.pathname === '/api/roster') return sendJson(res, 200, roster.toJSON())

    if (url.pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'ok',
        artists: roster.list().length,
        metricsTracked: false,
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
      const known = error instanceof StudioError || error instanceof VideoError || error instanceof WorkshopError
      sendJson(res, known ? 400 : 500, { error: error.message, field: error.field ?? null })
    })
})

server.listen(port, () => {
  console.log(`DMF roster dashboard listening on http://localhost:${port}`)
  console.log(`Roster: ${roster.list().length} artists | unlinked Spotify: ${roster.unlinked().join(', ') || 'none'}`)
})
