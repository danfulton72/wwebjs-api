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
  sessionFolderPath,
  shutdownTimeoutMs,
  webhookSecret
} = require('./src/config')
const { logger } = require('./src/logger')
const { handleUpgrade } = require('./src/websocket')
const { destroySession, sessions, setupSession } = require('./src/sessions')
const {
  markNotReady,
  markReady,
  markRestoring,
  markShuttingDown
} = require('./src/runtime')

if (!globalApiKey && !allowInsecureNoAuth) {
  logger.fatal('API_KEY is not configured. Refusing to start without authentication. Set ALLOW_INSECURE_NO_AUTH=TRUE only for isolated development environments.')
  process.exit(1)
}

if (!globalApiKey && allowInsecureNoAuth) {
  logger.warn('API authentication is explicitly disabled by ALLOW_INSECURE_NO_AUTH=TRUE')
}

if (enableWebHook && !baseWebhookURL) {
  logger.fatal('BASE_WEBHOOK_URL is required when ENABLE_WEBHOOK=TRUE')
  process.exit(1)
}

if (enableWebHook && !webhookSecret) {
  logger.fatal('WEBHOOK_SECRET is required when ENABLE_WEBHOOK=TRUE')
  process.exit(1)
}

if (enableWebHook && globalApiKey && webhookSecret === globalApiKey) {
  logger.warn('WEBHOOK_SECRET should be different from API_KEY so inbound and outbound credentials are separated')
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

let shutdownPromise = null
let server

const closeHttpServer = () => new Promise((resolve) => {
  if (!server?.listening) return resolve()
  server.close(error => {
    if (error) logger.error({ err: error }, 'HTTP server close returned an error')
    resolve()
  })
})

const gracefulShutdown = (signal, exitCode = 0) => {
  if (shutdownPromise) return shutdownPromise

  shutdownPromise = (async () => {
    markShuttingDown()
    logger.info({ signal, activeSessions: sessions.size }, 'Graceful shutdown started')

    server?.closeIdleConnections?.()
    const serverClosed = closeHttpServer()
    const sessionIds = Array.from(sessions.keys())

    const sessionShutdown = Promise.allSettled(
      sessionIds.map(sessionId => destroySession(sessionId))
    )

    let timedOut = false
    const timeout = new Promise(resolve => {
      const timer = setTimeout(() => {
        timedOut = true
        resolve()
      }, shutdownTimeoutMs)
      timer.unref()
    })

    await Promise.race([
      Promise.all([serverClosed, sessionShutdown]),
      timeout
    ])

    if (timedOut) {
      logger.error({ shutdownTimeoutMs }, 'Graceful shutdown timed out; terminating remaining connections')
      server?.closeAllConnections?.()
      process.exitCode = 1
      return
    }

    logger.info('Graceful shutdown completed')
    process.exitCode = exitCode
  })()

  return shutdownPromise
}

server = app.listen(servicePort, () => {
  logger.info({
    port: servicePort,
    node: process.version,
    authenticationEnabled: Boolean(globalApiKey),
    websocketEnabled: enableWebSocket,
    webhookEnabled: enableWebHook,
    autoStartSessions,
    maxSessions,
    corsOriginCount: allowedOrigins.length
  }, 'Server started')

  const initialize = async () => {
    if (!autoStartSessions) {
      markReady()
      return
    }

    markRestoring()
    try {
      await restoreSessionsBounded()
      markReady()
      logger.info({ activeSessions: sessions.size }, 'Session restoration completed; service is ready')
    } catch (error) {
      markNotReady('session_restore_failed')
      logger.error({ err: error }, 'Session restoration failed; service remains not ready')
    }
  }

  void initialize()
})

if (enableWebSocket) {
  server.on('upgrade', (request, socket, head) => {
    handleUpgrade(request, socket, head)
  })
}

process.setMaxListeners(Math.max(20, (maxSessions * 4) + 10))

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    void gracefulShutdown(signal)
  })
}

process.on('unhandledRejection', error => {
  logger.error({ err: error }, 'Unhandled promise rejection')
})

process.on('uncaughtException', error => {
  logger.fatal({ err: error }, 'Uncaught exception')
  void gracefulShutdown('uncaughtException', 1)
})

module.exports = { gracefulShutdown, server }
