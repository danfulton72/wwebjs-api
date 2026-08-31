const crypto = require('crypto')
const rateLimiting = require('express-rate-limit')
const {
  globalApiKey,
  allowInsecureNoAuth,
  allowedOrigins,
  enableUnsafeRunMethod,
  enableRemoteMediaUrl,
  rateLimitMax,
  rateLimitWindowMs,
  maxSessions
} = require('./config')
const { sendError } = require('./errors')

const safeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

const apiKeyMatches = value => Boolean(globalApiKey) && safeEqual(value, globalApiKey)

const isPublicHttpPath = (req) => {
  if (req.method === 'GET' && req.path === '/ping') return true
  if (req.method === 'GET' && req.path === '/health/live') return true
  if (req.method === 'GET' && req.path === '/health/ready') return true
  if (req.method === 'GET' && req.path.startsWith('/dashboard')) return true
  if ((req.method === 'GET' || req.method === 'HEAD') && req.path.startsWith('/api-docs')) return true
  return false
}

const isAllowedOrigin = (origin, host) => {
  if (!origin) return true
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true

  try {
    const parsed = new URL(origin)
    return Boolean(host) && parsed.host === host
  } catch {
    return false
  }
}

const securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')

  if (req.path.includes('/dashboard')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'"
    )
  }
  next()
}

const createRequestSecurity = (sessions) => {
  const startingSessions = new Set()

  return (req, res, next) => {
    if (!isPublicHttpPath(req)) {
      if (!globalApiKey && !allowInsecureNoAuth) {
        return sendError(res, 503, 'API authentication is not configured', {
          code: 'AUTH_NOT_CONFIGURED'
        })
      }

      if (globalApiKey && !apiKeyMatches(req.headers['x-api-key'])) {
        return sendError(res, 403, 'Invalid API key', { code: 'INVALID_API_KEY' })
      }
    }

    if (!enableUnsafeRunMethod && /^\/(client|chat|groupChat|message)\/runMethod\/[^/]+\/?$/i.test(req.path)) {
      return sendError(res, 404, 'Endpoint disabled', { code: 'ENDPOINT_DISABLED' })
    }

    if (!enableRemoteMediaUrl && req.body?.contentType === 'MessageMediaFromURL') {
      return sendError(
        res,
        403,
        'Remote media URL fetching is disabled. Upload media content directly or explicitly enable ENABLE_REMOTE_MEDIA_URL.',
        { code: 'REMOTE_MEDIA_DISABLED' }
      )
    }

    const startMatch = req.path.match(/^\/session\/start\/([\w-]+)\/?$/i)
    if (req.method === 'GET' && startMatch) {
      const sessionId = startMatch[1]
      if (!sessions.has(sessionId) && !startingSessions.has(sessionId)) {
        if (sessions.size + startingSessions.size >= maxSessions) {
          return sendError(res, 429, 'Maximum session limit reached', {
            code: 'SESSION_LIMIT_REACHED'
          })
        }

        startingSessions.add(sessionId)
        const release = () => startingSessions.delete(sessionId)
        res.once('finish', release)
        res.once('close', release)
      }
    }

    next()
  }
}

const securityRateLimiter = rateLimiting({
  limit: rateLimitMax,
  windowMs: rateLimitWindowMs,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: isPublicHttpPath,
  handler: (req, res) => sendError(res, 429, 'Rate limit exceeded', { code: 'RATE_LIMITED' })
})

module.exports = {
  apiKeyMatches,
  createRequestSecurity,
  isAllowedOrigin,
  securityHeaders,
  securityRateLimiter
}
