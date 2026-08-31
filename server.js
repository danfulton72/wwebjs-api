const app = require('./src/app')
const {
  servicePort,
  baseWebhookURL,
  enableWebHook,
  enableWebSocket,
  autoStartSessions,
  globalApiKey,
  allowInsecureNoAuth,
  maxSessions,
  allowedOrigins
} = require('./src/config')
const { logger } = require('./src/logger')
const { handleUpgrade } = require('./src/websocket')
const { restoreSessions } = require('./src/sessions')

if (!globalApiKey && !allowInsecureNoAuth) {
  logger.fatal('API_KEY is not configured. Refusing to start without authentication. Set ALLOW_INSECURE_NO_AUTH=TRUE only for isolated development environments.')
  process.exit(1)
}

if (!globalApiKey && allowInsecureNoAuth) {
  logger.warn('API authentication is explicitly disabled by ALLOW_INSECURE_NO_AUTH=TRUE')
}

if (!baseWebhookURL && enableWebHook) {
  logger.error('BASE_WEBHOOK_URL environment variable is not set. Exiting...')
  process.exit(1)
}

const server = app.listen(servicePort, () => {
  logger.info({
    port: servicePort,
    authenticationEnabled: Boolean(globalApiKey),
    websocketEnabled: enableWebSocket,
    webhookEnabled: enableWebHook,
    autoStartSessions,
    maxSessions,
    corsOriginCount: allowedOrigins.length
  }, 'Server started')

  if (autoStartSessions) {
    logger.info('Starting all sessions')
    restoreSessions()
  }
})

if (enableWebSocket) {
  server.on('upgrade', (request, socket, head) => {
    handleUpgrade(request, socket, head)
  })
}

// Puppeteer adds signal listeners per browser. Retain the existing behaviour
// until session lifecycle management is refactored, but do not log secrets.
process.setMaxListeners(0)
