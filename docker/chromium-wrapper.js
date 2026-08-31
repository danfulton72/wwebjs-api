#!/usr/bin/env node

const { spawn } = require('child_process')

const blockedArgs = new Set([
  '--no-sandbox',
  '--disable-setuid-sandbox'
])

const args = process.argv.slice(2).filter(arg => !blockedArgs.has(arg))
const child = spawn('/usr/bin/chromium', args, { stdio: 'inherit' })

const forwardSignal = signal => {
  if (!child.killed) child.kill(signal)
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => forwardSignal(signal))
}

child.on('error', error => {
  console.error(`Failed to launch Chromium: ${error.message}`)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
