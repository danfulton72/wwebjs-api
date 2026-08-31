const fs = require('fs')
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
  allowedOrigins,
  sessionFolderPath
} = require('./src/config')
const { logger } = require('./src/logger')
const { handleUpgrade } = require('./src/websocket')
const { setupSession } = require('./src/sessions')

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

const restoreSessionsBounded = async () => {
  await fs.promises.mkdir(sessionFolderPath, { recursive: true })
  const files = await fs.promises.readdir(sessionFolderPath)
  const sessionIds = files
    .map(file => file.match(/^session-([\w-]+)$/))
    .filter(Boolean)
    .map(match => match[1])

  if (sessionIds.length > maxSessions) {
    logger.warn({ discovered: sessionIds.length, maxSessions }, 'Stored sessions exceed MAX_SESSIONS; only the first configured maximum will be restored')
  }

  for (const sessionId of sessionIds.slice(0, maxSessions)) {
    logger.info({ sessionId }, 'Restoring stored session')
    const result = await setupSession(sessionId)
    if (!result.success) {
      logger.error({ sessionId, error: result.message }, 'Failed to restore stored session')
    }
  }
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
    restoreSessionsBounded().catch(error => {
      logger.error({ err: error }, 'Failed to restore stored sessions')
    })
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
