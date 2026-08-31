require('./routes')
const express = require('express')
const cors = require('cors')
const { routes } = require('./routes')
const { sessions } = require('./sessions')
const { maxAttachmentSize, basePath, trustProxy, allowedOrigins } = require('./config')
const { securityHeaders, createRequestSecurity, securityRateLimiter } = require('./security')

const app = express()

app.disable('x-powered-by')

if (trustProxy) {
  app.set('trust proxy', true)
}

app.use(securityHeaders)
app.use(express.json({ limit: maxAttachmentSize + 1000000 }))
app.use(express.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }))

if (allowedOrigins.length > 0) {
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      callback(new Error('Origin not allowed by CORS policy'))
    },
    credentials: !allowedOrigins.includes('*')
  }))
} else {
  // Same-origin/server-to-server access works without CORS headers.
  app.use(cors({ origin: false }))
}

app.use(basePath, createRequestSecurity(sessions), securityRateLimiter, routes)

module.exports = app
