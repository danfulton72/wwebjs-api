const { WebSocketServer } = require('ws')
const { enableWebSocket, basePath, globalApiKey, allowInsecureNoAuth } = require('./config')
const { apiKeyMatches, isAllowedOrigin } = require('./security')
const { logger } = require('./logger')
const wssMap = new Map()

const initWebSocketServer = (sessionId) => {
  if (enableWebSocket) {
    const server = wssMap.get(sessionId)
    if (server) return

    const wss = new WebSocketServer({ noServer: true })
    wssMap.set(sessionId, wss)
    wss.on('connection', (ws) => {
      logger.debug({ sessionId }, 'WebSocket connection established')
      ws.on('close', () => logger.debug({ sessionId }, 'WebSocket connection closed'))
      ws.on('error', () => logger.error({ sessionId }, 'WebSocket connection error'))
    })
  }
}

const terminateWebSocketServer = async (sessionId) => {
  const server = wssMap.get(sessionId)
  if (!server) return Promise.resolve()

  const closeEventSignal = new Promise((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve(undefined)))
  )

  for (const ws of server.clients) ws.terminate()
  wssMap.delete(sessionId)
  await closeEventSignal
}

const triggerWebSocket = (sessionId, dataType, data) => {
  const server = wssMap.get(sessionId)
  if (!server) return

  for (const ws of server.clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ dataType, data, sessionId }))
    }
  }
}

const rejectUpgrade = (socket, statusCode, message) => {
  if (socket.destroyed) return
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  socket.destroy()
}

const handleUpgrade = (request, socket, head) => {
  const host = request.headers['x-forwarded-host'] || request.headers.host
  const origin = request.headers.origin

  if (!globalApiKey && !allowInsecureNoAuth) {
    return rejectUpgrade(socket, 503, 'Service Unavailable')
  }

  if (globalApiKey && !apiKeyMatches(request.headers['x-api-key'])) {
    return rejectUpgrade(socket, 401, 'Unauthorized')
  }

  if (!isAllowedOrigin(origin, host)) {
    return rejectUpgrade(socket, 403, 'Forbidden')
  }

  const baseUrl = 'ws://' + host + '/'
  let pathname
  try {
    pathname = new URL(request.url, baseUrl).pathname
  } catch {
    return rejectUpgrade(socket, 400, 'Bad Request')
  }

  const normalizedBasePath = basePath === '/' ? '' : basePath.replace(/\/$/, '')
  const wsPrefix = `${normalizedBasePath}/ws/`
  if (!pathname.startsWith(wsPrefix)) {
    return rejectUpgrade(socket, 404, 'Not Found')
  }

  const sessionId = pathname.slice(wsPrefix.length)
  if (!/^[\w-]+$/.test(sessionId)) {
    return rejectUpgrade(socket, 400, 'Bad Request')
  }

  const server = wssMap.get(sessionId)
  if (!server) {
    return rejectUpgrade(socket, 404, 'Not Found')
  }

  server.handleUpgrade(request, socket, head, (ws) => {
    server.emit('connection', ws, request)
  })
}

module.exports = { initWebSocketServer, terminateWebSocketServer, handleUpgrade, triggerWebSocket }
