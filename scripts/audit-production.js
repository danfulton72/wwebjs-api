'use strict'

const { spawnSync } = require('node:child_process')

const allowedPackages = new Set([
  '@puppeteer/browsers',
  'extract-zip',
  'puppeteer',
  'puppeteer-core',
  'whatsapp-web.js'
])
const allowedAdvisoryUrls = new Set([
  'https://github.com/advisories/GHSA-jmr9-qjv8-65gv'
])

const result = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32'
})

if (result.error) throw result.error

let report
try {
  report = JSON.parse(result.stdout || '{}')
} catch (error) {
  console.error(result.stdout)
  console.error(result.stderr)
  throw new Error(`Unable to parse npm audit output: ${error.message}`)
}

const vulnerabilities = report.vulnerabilities || {}
const rejected = []
const accepted = []

const viaIsApproved = (via) => {
  if (typeof via === 'string') return allowedPackages.has(via)
  return via && allowedAdvisoryUrls.has(via.url) && via.severity === 'high'
}

for (const [name, finding] of Object.entries(vulnerabilities)) {
  const approved = allowedPackages.has(name) &&
    finding.severity === 'high' &&
    Array.isArray(finding.via) &&
    finding.via.every(viaIsApproved)

  if (approved) accepted.push(name)
  else rejected.push({ name, severity: finding.severity, via: finding.via })
}

if (accepted.length) {
  console.warn(`Accepted upstream audit exception: ${accepted.sort().join(', ')}`)
  console.warn('See docs/security-exceptions.md for scope and removal criteria.')
}

if (rejected.length) {
  console.error('Unapproved production dependency vulnerabilities detected:')
  console.error(JSON.stringify(rejected, null, 2))
  process.exit(1)
}

console.log('Production dependency audit passed with no unapproved high/critical findings.')
