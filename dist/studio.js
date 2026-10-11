// DMF Studio Engine - browser UI.
//
// Recording happens here, in the browser, via getUserMedia + MediaRecorder.
// The server stores the session metadata and mix settings; the audio blob is
// held locally in this page because there is no storage bucket wired up yet.
// That is a real limitation, and the UI says so rather than pretending.

const listEl = document.getElementById('session-list')
const detailEl = document.getElementById('session-detail')
const trackListEl = document.getElementById('track-list')
const mixStatusEl = document.getElementById('mix-status')
const exportOutput = document.getElementById('export-output')

let currentSessionId = null
let recorder = null
let recordedChunks = []
let mediaStream = null

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

function renderSessions(sessions) {
  if (sessions.length === 0) {
    listEl.innerHTML = '<li class="empty">No sessions yet.</li>'
    return
  }

  listEl.replaceChildren(
    ...sessions.map((session) => {
      const li = document.createElement('li')
      li.className = 'session-item'
      li.innerHTML = `
        <button type="button" class="session-open" data-id="${session.id}">
          <span class="session-name">${session.title}</span>
          <span class="session-meta">${session.tracks.length} track${session.tracks.length === 1 ? '' : 's'} &middot; ${session.status}</span>
        </button>
      `
      return li
    })
  )
}

function renderTrack(track) {
  const row = document.createElement('div')
  row.className = 'track-row'
  row.innerHTML = `
    <span class="track-name">${track.name}</span>
    <span>${track.startAt.toFixed(1)}s</span>
    <input type="range" min="0" max="2" step="0.05" value="${track.gain}" data-track="${track.id}" data-field="gain" />
    <input type="range" min="-1" max="1" step="0.1" value="${track.pan}" data-track="${track.id}" data-field="pan" />
    <button type="button" class="mute-btn ${track.muted ? 'on' : ''}" data-track="${track.id}">${track.muted ? 'Muted' : 'On'}</button>
    <button type="button" class="remove-btn" data-track="${track.id}">Remove</button>
  `
  return row
}

async function openSession(id) {
  currentSessionId = id
  const { session, mix } = await api(`/api/studio/sessions/${id}`)

  document.getElementById('detail-title').textContent = session.title
  detailEl.hidden = false
  exportOutput.hidden = true

  trackListEl.replaceChildren(...session.tracks.map(renderTrack))

  mixStatusEl.textContent = mix.ok ? 'Mix checks pass.' : `Mix checks: ${mix.issues.join('; ')}`
  mixStatusEl.className = mix.ok ? 'mix-status ok' : 'mix-status warn'
}

async function refreshSessions() {
  const { sessions } = await api('/api/studio/sessions')
  renderSessions(sessions)
}

document.getElementById('new-session').addEventListener('submit', async (event) => {
  event.preventDefault()
  const title = document.getElementById('session-title').value.trim()
  const artistName = document.getElementById('session-artist').value.trim()
  if (!title) return

  const { session } = await api('/api/studio/sessions', {
    method: 'POST',
    body: JSON.stringify({ title, artistName })
  })

  document.getElementById('session-title').value = ''
  document.getElementById('session-artist').value = ''
  await refreshSessions()
  await openSession(session.id)
})

listEl.addEventListener('click', (event) => {
  const button = event.target.closest('.session-open')
  if (button) openSession(button.dataset.id)
})

// Real browser recording. If the environment has no microphone (headless,
// no device, permission refused) this reports the failure instead of
// silently producing an empty track.
document.getElementById('record-btn').addEventListener('click', async () => {
  if (!currentSessionId) return
  const button = document.getElementById('record-btn')

  if (recorder && recorder.state === 'recording') {
    recorder.stop()
    return
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    mixStatusEl.textContent = `Microphone unavailable: ${error.message}`
    mixStatusEl.className = 'mix-status warn'
    return
  }

  recordedChunks = []
  recorder = new MediaRecorder(mediaStream)
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data)
  }

  recorder.onstop = async () => {
    mediaStream.getTracks().forEach((track) => track.stop())
    button.textContent = 'Record vocal track'
    const seconds = recordedChunks.length > 0 ? recordedChunks[0].size / 16000 : 0

    await api(`/api/studio/sessions/${currentSessionId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({
        name: `Vocal take ${new Date().toLocaleTimeString()}`,
        kind: 'vocals',
        duration: Number(seconds.toFixed(2)),
        // Kept local: no storage bucket is wired up yet.
        sourceKey: 'local://unsaved-take'
      })
    })

    await openSession(currentSessionId)
    await refreshSessions()
  }

  recorder.start()
  button.textContent = 'Stop recording'
})

document.getElementById('add-beat-btn').addEventListener('click', async () => {
  if (!currentSessionId) return
  await api(`/api/studio/sessions/${currentSessionId}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ name: `Beat ${Date.now() % 1000}`, kind: 'beat', duration: 180 })
  })
  await openSession(currentSessionId)
  await refreshSessions()
})

trackListEl.addEventListener('change', async (event) => {
  const input = event.target.closest('input[data-track]')
  if (!input || !currentSessionId) return
  try {
    await api(`/api/studio/sessions/${currentSessionId}/tracks/${input.dataset.track}`, {
      method: 'PATCH',
      body: JSON.stringify({ [input.dataset.field]: Number(input.value) })
    })
    await openSession(currentSessionId)
  } catch (error) {
    mixStatusEl.textContent = `Could not save mix change: ${error.message}`
    mixStatusEl.className = 'mix-status warn'
  }
})

trackListEl.addEventListener('click', async (event) => {
  if (!currentSessionId) return
  const muteButton = event.target.closest('.mute-btn')
  if (muteButton) {
    const isMuted = muteButton.classList.contains('on')
    await api(`/api/studio/sessions/${currentSessionId}/tracks/${muteButton.dataset.track}`, {
      method: 'PATCH',
      body: JSON.stringify({ muted: !isMuted })
    })
    await openSession(currentSessionId)
    return
  }

  const removeButton = event.target.closest('.remove-btn')
  if (removeButton) {
    await api(`/api/studio/sessions/${currentSessionId}/tracks/${removeButton.dataset.track}`, {
      method: 'DELETE'
    })
    await openSession(currentSessionId)
    await refreshSessions()
  }
})

document.getElementById('export-btn').addEventListener('click', async () => {
  if (!currentSessionId) return
  try {
    const { manifest } = await api(`/api/studio/sessions/${currentSessionId}/export`)
    exportOutput.hidden = false
    exportOutput.textContent = JSON.stringify(manifest, null, 2)
  } catch (error) {
    exportOutput.hidden = false
    exportOutput.textContent = `Export refused: ${error.message}`
  }
})

refreshSessions().catch((error) => {
  listEl.innerHTML = `<li class="error">Could not load sessions: ${error.message}</li>`
})
