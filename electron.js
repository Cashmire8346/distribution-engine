import { app, BrowserWindow } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const port = process.env.PORT || '3000'
const appUrl = `http://localhost:${port}`
let serverProcess = null

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

  win.loadURL(appUrl)
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
