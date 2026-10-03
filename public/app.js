// Roster dashboard frontend.
//
// Rule enforced here as well as on the server: a number is only rendered
// alongside its source and date. `tracked: false` renders "Not tracked",
// never a zero and never an estimate.

const grid = document.getElementById('roster-grid')

const ROLE_LABELS = { owner: 'Founder & Owner', core: 'Core Roster', affiliate: 'Affiliate' }
const SOURCE_LABELS = { spotify: 'Spotify', apple: 'Apple Music', youtube: 'YouTube Music', amazon: 'Amazon Music', tidal: 'Tidal', chartmetric: 'Chartmetric', manual: 'Manual entry' }

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}

function metricLine(artist) {
  if (!artist.tracked) {
    return `<p class="metric metric-untracked">
      <span class="metric-value">Not tracked</span>
      <span class="metric-source">No sourced reading yet</span>
    </p>`
  }

  const metric = artist.metrics.find((m) => m.source === 'spotify' && m.metricType === 'monthly_listeners')
  return `<p class="metric">
    <span class="metric-value">${metric.value.toLocaleString('en-US')}</span>
    <span class="metric-source">monthly listeners &middot; ${SOURCE_LABELS[metric.source] || metric.source} &middot; ${formatDate(metric.asOf)}</span>
 </p>`
}

function actionLine(artist) {
  if (!artist.spotifyUrl) {
    return `<span class="action action-missing" aria-disabled="true">Spotify profile not linked</span>`
  }
  return `<a class="action" href="${artist.spotifyUrl}" target="_blank" rel="noopener noreferrer">Stream on Spotify</a>`
}

function artistCard(artist) {
  const card = document.createElement('article')
  card.className = 'card'

  card.innerHTML = `
    <header class="card-head">
      <h3>${artist.name}</h3>
      <p class="role">${ROLE_LABELS[artist.role] || artist.role}</p>
    </header>
    <p class="meta">${artist.location ? artist.location : 'Location not specified'}</p>
    <p class="vibe">${artist.vibe ? artist.vibe : ''}</p>
    ${metricLine(artist)}
    <blockquote class="bio">${artist.bio ? artist.bio : ''}</blockquote>
    <div class="card-actions">${actionLine(artist)}</div>
  `

  return card
}

function renderStats(data) {
  document.getElementById('subtitle').textContent = data.header

  document.getElementById('stat-artists').textContent = String(data.artists.length)

  const totalEl = document.getElementById('stat-total')
  const totalNote = document.getElementById('stat-total-note')
  if (data.aggregate.complete) {
    totalEl.textContent = data.aggregate.total.toLocaleString('en-US')
    totalNote.textContent = `oldest reading ${formatDate(data.aggregate.asOf)}`
  } else {
    totalEl.textContent = 'Collecting'
    totalNote.textContent = `no reading for ${data.aggregate.missing.length} artist${data.aggregate.missing.length === 1 ? '' : 's'}`
  }

  const unlinkedEl = document.getElementById('stat-unlinked')
  const unlinkedNote = document.getElementById('stat-unlinked-note')
  unlinkedEl.textContent = String(data.unlinked.length)
  unlinkedNote.textContent = data.unlinked.length > 0 ? data.unlinked.join(', ') : 'all profiles linked'
}

async function boot() {
  const response = await fetch('/api/roster')
  if (!response.ok) {
    grid.innerHTML = `<p class="error">Could not load roster: HTTP ${response.status}</p>`
    return
  }

  const data = await response.json()
  renderStats(data)

  grid.replaceChildren(...data.artists.map(artistCard))
}

boot().catch((error) => {
  grid.innerHTML = `<p class="error">Could not load roster: ${error.message}</p>`
})
