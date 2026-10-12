import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = process.env.PORT || '3000'
const appUrl = `http://localhost:${port}`
let serverProcess = null

// Credentials for the dashboard live in <userData>/.env (KEY=VALUE per line):
//   DMF_ADMIN_EMAIL, DMF_ADMIN_PASSWORD_HASH, DMF_SESSION_SECRET
// Generate the last two with: node scripts/hash-password.mjs '<password>'
// Nothing is bundled with the app; without them login is disabled.
function readUserEnv() {
  try {
    const raw = fs.readFileSync(path.join(app.getPath('userData'), '.env'), 'utf8')
    const env = {}
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (match && !line.trim().startsWith('#')) env[match[1]] = match[2].replace(/^["']|["']$/g, '')
    }
    return env
  } catch {
    return {}
  }
}

async function isServerAvailable() {
  try {
    const response = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

async function startServer() {
  if (serverProcess) return

  if (await isServerAvailable()) {
    console.log(`Using existing server at ${appUrl}`)
    return
  }

  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...readUserEnv(),
      PORT: port,
      DATA_DIR: app.getPath('userData'),
      ELECTRON_RUN_AS_NODE: '1'
    }
  })

  serverProcess.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Server exited with code ${code}`)
    }
  })
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    autoHideMenuBar: true,
    backgroundColor: '#111827',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // The built dashboard if present, otherwise the plain roster pages.
  win.loadURL(fs.existsSync(path.join(__dirname, 'dist', 'index.html')) ? `${appUrl}/app/` : appUrl)
}

app.whenReady().then(async () => {
  await startServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM')
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
