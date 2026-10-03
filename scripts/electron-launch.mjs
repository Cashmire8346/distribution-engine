import { spawn } from 'node:child_process'

const electronBin = process.platform === 'win32' ? 'electron.cmd' : 'electron'
const args = ['.']

const useXvfb = process.platform === 'linux' && !process.env.DISPLAY

const child = spawn(
  useXvfb ? 'xvfb-run' : electronBin,
  useXvfb ? ['-a', electronBin, ...args] : args,
  {
    stdio: 'inherit',
    env: process.env,
    shell: false
  }
)

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error('Failed to launch Electron:', error)
  process.exit(1)
})
