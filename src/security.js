const crypto = require('crypto')
const rateLimiting = require('express-rate-limit')
const {
  globalApiKey,
  allowInsecureNoAuth,
  allowedOrigins,
  enableUnsafeRunMethod,
  enableRemoteMediaUrl,
  enableSwaggerEndpoint,
  enableWebUI,
  rateLimitMax,
  rateLimitWindowMs,
  maxSessions
} = require('./config')

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
  if (enableWebUI && req.method === 'GET' && req.path.startsWith('/dashboard')) return true
  if (enableSwaggerEndpoint && (req.method === 'GET' || req.method === 'HEAD') && req.path.startsWith('/api-docs')) return true
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
        return res.status(503).json({ success: false, error: 'API authentication is not configured' })
      }

      if (globalApiKey && !apiKeyMatches(req.headers['x-api-key'])) {
        return res.status(403).json({ success: false, error: 'Invalid API key' })
      }
    }

    if (!enableUnsafeRunMethod && /^\/(client|chat|groupChat|message)\/runMethod\/[^/]+\/?$/i.test(req.path)) {
      return res.status(404).json({ success: false, error: 'Endpoint disabled' })
    }

    if (!enableRemoteMediaUrl && req.body?.contentType === 'MessageMediaFromURL') {
      return res.status(403).json({
        success: false,
        error: 'Remote media URL fetching is disabled. Upload media content directly or explicitly enable ENABLE_REMOTE_MEDIA_URL.'
      })
    }

    const startMatch = req.path.match(/^\/session\/start\/([\w-]+)\/?$/i)
    if (req.method === 'GET' && startMatch) {
      const sessionId = startMatch[1]
      if (!sessions.has(sessionId) && !startingSessions.has(sessionId)) {
        if (sessions.size + startingSessions.size >= maxSessions) {
          return res.status(429).json({ success: false, error: 'Maximum session limit reached' })
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
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isPublicHttpPath,
  message: { success: false, error: 'Rate limit exceeded' }
})

module.exports = {
  apiKeyMatches,
  isAllowedOrigin,
  securityHeaders,
  createRequestSecurity,
  securityRateLimiter
}
