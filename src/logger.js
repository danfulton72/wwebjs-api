const { logLevel } = require('./config')
const pino = require('pino')

const logger = pino({
  level: logLevel,
  redact: {
    paths: [
      'apiKey',
      'globalApiKey',
      'proxyPassword',
      'webhookSecret',
      '*.apiKey',
      '*.globalApiKey',
      '*.proxyPassword',
      '*.webhookSecret',
      'req.headers.x-api-key',
      'headers.x-api-key'
    ],
    censor: '[REDACTED]'
  }
}, pino.destination(1, { sync: false }))

logger.on('level-change', (lvl, val, prevLvl, prevVal) => {
  logger.info('%s (%d) was changed to %s (%d)', prevLvl, prevVal, lvl, val)
})

module.exports = { logger }
