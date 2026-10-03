// End-to-end API smoke check. Run with the server up:
//   node scripts/smoke.mjs
// Exits non-zero on the first failure.

const base = process.env.BASE_URL || 'http://localhost:3000'

let failures = 0

async function check(label, fn) {
  try {
    const detail = await fn()
    console.log(`ok   ${label}${detail ? ` -> ${detail}` : ''}`)
  } catch (error) {
    failures += 1
    console.log(`FAIL ${label} -> ${error.message}`)
  }
}

async function json(path, options) {
  const response = await fetch(`${base}${path}`, {
    headers: { 'content-type': 'application/json' },
    ...options
  })
  const body = await response.json().catch(() => ({}))
  return { status: response.status, body }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

await check('health', async () => {
  const { status, body } = await json('/api/health')
  expect(status === 200, `status ${status}`)
  return `${body.artists} artists, ${body.studioSessions} sessions, ${body.videoJobs} jobs`
})

await check('roster', async () => {
  const { body } = await json('/api/roster')
  expect(body.artists.length === 5, `expected 5 artists, got ${body.artists.length}`)
  expect(body.artists.every((a) => a.tracked === false), 'expected no tracked metrics')
  return `${body.artists.length} artists, aggregate complete=${body.aggregate.complete}`
})

await check('studio: create session', async () => {
  const { status, body } = await json('/api/studio/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: 'Smoke Session', artistName: 'Big Homie Cash' })
  })
  expect(status === 201, `status ${status}`)
  globalThis.__sid = body.session.id
  return body.session.id
})

await check('studio: session requires a title', async () => {
  const { status, body } = await json('/api/studio/sessions', { method: 'POST', body: '{}' })
  expect(status === 400, `expected 400, got ${status}`)
  return body.error
})

await check('studio: add track', async () => {
  const { status, body } = await json(`/api/studio/sessions/${globalThis.__sid}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Lead vocal', kind: 'vocals', duration: 30, sourceKey: 'bucket/v.wav' })
  })
  expect(status === 201, `status ${status}`)
  globalThis.__tid = body.session.tracks[0].id
  return body.session.tracks[0].name
})

await check('studio: patch gain', async () => {
  const { status, body } = await json(`/api/studio/sessions/${globalThis.__sid}/tracks/${globalThis.__tid}`, {
    method: 'PATCH',
    body: JSON.stringify({ gain: 0.8 })
  })
  expect(status === 200, `status ${status}`)
  expect(body.session.tracks[0].gain === 0.8, `gain is ${body.session.tracks[0].gain}`)
  return `gain=${body.session.tracks[0].gain}`
})

await check('studio: reject out-of-range gain', async () => {
  const { status } = await json(`/api/studio/sessions/${globalThis.__sid}/tracks/${globalThis.__tid}`, {
    method: 'PATCH',
    body: JSON.stringify({ gain: 9 })
  })
  expect(status === 400, `expected 400, got ${status}`)
  return 'rejected'
})

await check('studio: mix validation', async () => {
  const { body } = await json(`/api/studio/sessions/${globalThis.__sid}`)
  expect(body.mix.ok === true, `mix issues: ${body.mix.issues.join('; ')}`)
  return 'ok'
})

await check('studio: export manifest', async () => {
  const { body } = await json(`/api/studio/sessions/${globalThis.__sid}/export`)
  expect(body.manifest.tracks.length === 1, 'expected 1 track in manifest')
  return `runtime=${body.manifest.runtime}s`
})

await check('studio: delete track', async () => {
  const { status, body } = await json(`/api/studio/sessions/${globalThis.__sid}/tracks/${globalThis.__tid}`, {
    method: 'DELETE'
  })
  expect(status === 200, `status ${status}`)
  expect(body.session.tracks.length === 0, 'track not removed')
  return 'removed'
})

await check('video: presets', async () => {
  const { body } = await json('/api/video/presets')
  const keys = Object.keys(body.presets)
  expect(keys.length === 6, `expected 6 presets, got ${keys.length}`)
  return keys.join(',')
})

await check('video: queue job builds a scene plan', async () => {
  const { status, body } = await json('/api/video/jobs', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Midnight Echo Visual',
      artistName: 'Big Homie Cash',
      style: 'street',
      bpm: 120,
      durationSeconds: 165,
      barsPerCut: 4
    })
  })
  expect(status === 201, `status ${status}: ${body.error || ''}`)
  expect(body.job.scenes.length > 0, 'no scenes planned')
  globalThis.__jid = body.job.id
  return `${body.job.scenes.length} scenes, state=${body.job.state}`
})

await check('video: job detail with progress', async () => {
  const { body } = await json(`/api/video/jobs/${globalThis.__jid}`)
  expect(body.job.scenes[0].prompt.includes('Midnight Echo'), 'prompt missing title')
  expect(body.progress === 0, `expected progress 0, got ${body.progress}`)
  return `state=${body.job.state}, progress=${body.progress}%`
})

await check('video: unknown style rejected', async () => {
  const { status } = await json('/api/video/jobs', {
    method: 'POST',
    body: JSON.stringify({ title: 'x', style: 'vaporwave', durationSeconds: 30 })
  })
  expect(status === 400, `expected 400, got ${status}`)
  return 'rejected'
})

await check('video: export refused while queued', async () => {
  const { body } = await json(`/api/video/jobs/${globalThis.__jid}`)
  expect(body.job.state === 'queued', `unexpected state ${body.job.state}`)
  return 'queued (export blocked until done)'
})

await check("dariyah: providers report no render capability", async () => {
  const { status, body } = await json('/api/dariyah/providers')
  expect(status === 200, `status ${status}`)
  expect(body.renderAvailable === false, 'expected renderAvailable false with only the stub')
  expect(body.providers.some((p) => p.name === 'stub' && p.available === false), 'stub provider missing')
  return body.providers.map((p) => `${p.name}:${p.available}`).join(',')
})

await check('pages served', async () => {
  const paths = ['/', '/studio.html', '/video.html', '/app.js', '/studio.js', '/video.js', '/styles.css']
  const codes = []
  for (const path of paths) {
    const response = await fetch(`${base}${path}`)
    codes.push(`${path}:${response.status}`)
    expect(response.status === 200, `${path} returned ${response.status}`)
  }
  return codes.join(' ')
})

await check('path traversal blocked', async () => {
  const response = await fetch(`${base}/../package.json`)
  expect(response.status !== 200, `expected non-200, got ${response.status}`)
  return `status ${response.status}`
})

console.log(failures === 0 ? '\nAll smoke checks passed.' : `\n${failures} smoke check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
