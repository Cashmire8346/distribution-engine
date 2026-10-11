const list = document.getElementById('item-list')
const errorEl = document.getElementById('item-error')

async function load() {
  const { items } = await (await fetch('/api/workshop')).json()
  list.replaceChildren()
  if (items.length === 0) {
    const li = document.createElement('li')
    li.className = 'empty'
    li.textContent = 'Nothing yet.'
    list.append(li)
    return
  }
  for (const item of items) {
    const li = document.createElement('li')
    li.textContent = `${item.title} [${item.status}]${item.notes ? ' - ' + item.notes : ''}`
    list.append(li)
  }
}

document.getElementById('new-item').addEventListener('submit', async (event) => {
  event.preventDefault()
  errorEl.textContent = ''
  const response = await fetch('/api/workshop', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: document.getElementById('item-title').value,
      notes: document.getElementById('item-notes').value,
      status: document.getElementById('item-status').value
    })
  })
  if (!response.ok) {
    errorEl.textContent = (await response.json()).error
    return
  }
  event.target.reset()
  load()
})

load()
