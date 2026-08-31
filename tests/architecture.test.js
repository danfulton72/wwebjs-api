'use strict'

const fs = require('fs')
const path = require('path')

const srcRoot = path.resolve(__dirname, '..', 'src')
const boundaryRoot = path.join(srcRoot, 'wwebjs')

const walkJavaScript = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(dir, entry.name)
  if (entry.isDirectory()) return walkJavaScript(fullPath)
  return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : []
})

describe('wwebjs architecture boundary', () => {
  it('keeps undocumented wwebjs and Puppeteer internals inside src/wwebjs', () => {
    const violations = []
    const privatePatterns = [
      /whatsapp-web\.js\/src\//,
      /\.pupPage\b/,
      /\.pupBrowser\b/,
      /\.interface\.(?:openChatWindow|openChatWindowAt)\b/
    ]

    for (const file of walkJavaScript(srcRoot)) {
      if (file.startsWith(`${boundaryRoot}${path.sep}`)) continue
      const source = fs.readFileSync(file, 'utf8')
      if (privatePatterns.some(pattern => pattern.test(source))) {
        violations.push(path.relative(srcRoot, file))
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps route-facing large controllers as small composition facades', () => {
    for (const filename of [
      'clientController.js',
      'messageController.js',
      'channelController.js',
      'groupChatController.js'
    ]) {
      const source = fs.readFileSync(path.join(srcRoot, 'controllers', filename), 'utf8')
      expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(10)
    }
  })
})
