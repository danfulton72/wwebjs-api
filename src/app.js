require('./routes')
const express = require('express')
const cors = require('cors')
const { routes } = require('./routes')
const { sessions } = require('./sessions')
const healthController = require('./controllers/healthController')
const { maxAttachmentSize, basePath, trustProxy, allowedOrigins } = require('./config')
const { securityHeaders, createRequestSecurity, securityRateLimiter } = require('./security')
const { requestSchemaValidation } = require('./requestSchemas')
const { errorHandler, notFoundHandler, requestContext } = require('./errors')

const app = express()
const operationalRoutes = express.Router()

app.disable('x-powered-by')

if (trustProxy) app.set('trust proxy', true)

app.use(requestContext)
app.use(securityHeaders)
app.use(express.json({ limit: maxAttachmentSize + 1000000 }))
app.use(express.urlencoded({ limit: maxAttachmentSize + 1000000, extended: true }))

if (allowedOrigins.length > 0) {
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      callback(null, false)
    },
    credentials: !allowedOrigins.includes('*')
  }))
} else {
  app.use(cors({ origin: false }))
}

operationalRoutes.get('/health/live', healthController.live)
operationalRoutes.get('/health/ready', healthController.ready)

app.use(basePath, operationalRoutes)
app.use(
  basePath,
  createRequestSecurity(sessions),
  securityRateLimiter,
  requestSchemaValidation,
  routes
)

app.use(notFoundHandler)
app.use(errorHandler)

module.exports = app
