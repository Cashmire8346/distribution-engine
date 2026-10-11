// DMF Visual Engine - browser UI.
//
// This page builds a scene plan: it maps the beat grid to cuts, assigns a
// style-driven prompt to each scene, and queues a render job. It does NOT
// generate video. The render notice on the page says so explicitly.

const jobListEl = document.getElementById('job-list')
const jobDetailEl = document.getElementById('job-detail')
const sceneListEl = document.getElementById('scene-list')
const styleSelect = document.getElementById('project-style')

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`)
  return body
}

function renderJobs(jobs) {
  if (jobs.length === 0) {
    jobListEl.innerHTML = '<li class="empty">No jobs yet.</li>'
    return
  }

  jobListEl.replaceChildren(
    ...jobs.map((job) => {
      const li = document.createElement('li')
      li.className = 'session-item'
      li.innerHTML = `
        <button type="button" class="job-open" data-id="${job.id}">
          <span class="session-name">${job.title}</span>
          <span class="session-meta">${job.scenes.length} scenes &middot; ${job.style} &middot; ${job.state}</span>
        </button>
      `
      return li
    })
  )
}

function sceneRow(scene) {
  const row = document.createElement('div')
  row.className = 'scene-row'
  row.innerHTML = `
    <span>${scene.index + 1}</span>
    <span>${scene.startAt.toFixed(2)}s</span>
    <span>${scene.endAt.toFixed(2)}s</span>
    <span>${scene.bar}</span>
    <span>${scene.transition}</span>
    <span class="scene-prompt">${scene.prompt}</span>
  `
  return row
}

async function openJob(id) {
  const { job, progress } = await api(`/api/video/jobs/${id}`)

  document.getElementById('job-title').textContent = job.title
  jobDetailEl.hidden = false

  const notice = document.getElementById('render-notice')
  notice.textContent = job.state === 'done'
    ? `Rendered ${job.renderedFrames}/${job.totalFrames} frames (${progress}%).`
    : `State: ${job.state}. Frames are not rendered - no video model is connected. Scene plan is complete.`

  sceneListEl.replaceChildren(...job.scenes.map(sceneRow))
}

async function refreshJobs() {
  const { jobs } = await api('/api/video/jobs')
  renderJobs(jobs)
}

async function loadPresets() {
  const { presets } = await api('/api/video/presets')
  styleSelect.replaceChildren(
    ...Object.entries(presets).map(([key, preset]) => {
      const option = document.createElement('option')
      option.value = key
      option.textContent = preset.label
      return option
    })
  )
}

// States plainly whether any render provider can produce frames. With only the
// stub registered this reads "no provider available", which is the truth.
async function loadProviders() {
  const { providers, renderAvailable } = await api('/api/dariyah/providers')
  const notice = document.getElementById('provider-notice')
  const names = providers.map((p) => `${p.name}${p.available ? ' (available)' : ' (unavailable)'}`).join(', ')
  notice.textContent = renderAvailable
    ? `Render providers: ${names}`
    : `Render providers: ${names || 'none'} - frame generation is not available.`
  notice.className = renderAvailable ? 'mix-status ok' : 'mix-status warn'
}

document.getElementById('new-project').addEventListener('submit', async (event) => {
  event.preventDefault()

  try {
    const { job } = await api('/api/video/jobs', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('project-title').value.trim(),
        artistName: document.getElementById('project-artist').value.trim(),
        bpm: Number(document.getElementById('project-bpm').value),
        durationSeconds: Number(document.getElementById('project-duration').value),
        style: styleSelect.value,
        barsPerCut: Number(document.getElementById('project-bars').value)
      })
    })

    await refreshJobs()
    await openJob(job.id)
  } catch (error) {
    sceneListEl.innerHTML = `<p class="error">Could not build scene plan: ${error.message}</p>`
    jobDetailEl.hidden = false
  }
})

jobListEl.addEventListener('click', (event) => {
  const button = event.target.closest('.job-open')
  if (button) openJob(button.dataset.id)
})

Promise.all([loadPresets(), loadProviders(), refreshJobs()]).catch((error) => {
  jobListEl.innerHTML = `<li class="error">Could not load queue: ${error.message}</li>`
})
