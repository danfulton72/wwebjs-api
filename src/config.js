// Load environment variables from .env file
require('dotenv').config({ path: process.env.ENV_PATH || '.env' })

const parseBoolean = (value, fallback = false) => {
  if (value == null || value === '') return fallback
  return String(value).toLowerCase() === 'true'
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeBasePath = (value) => {
  if (!value || value === '/') return '/'
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.replace(/\/+$/, '') || '/'
}

const servicePort = parsePositiveInt(process.env.PORT, 3000)
const sessionFolderPath = process.env.SESSIONS_PATH || './sessions'
const enableLocalCallbackExample = parseBoolean(process.env.ENABLE_LOCAL_CALLBACK_EXAMPLE)
const globalApiKey = process.env.API_KEY
const allowInsecureNoAuth = parseBoolean(process.env.ALLOW_INSECURE_NO_AUTH)
const baseWebhookURL = process.env.BASE_WEBHOOK_URL
const webhookSecret = process.env.WEBHOOK_SECRET
const webhookTimeoutMs = parsePositiveInt(process.env.WEBHOOK_TIMEOUT_MS, 5000)
const webhookMaxAttempts = parsePositiveInt(process.env.WEBHOOK_MAX_ATTEMPTS, 4)
const webhookRetryBaseMs = parsePositiveInt(process.env.WEBHOOK_RETRY_BASE_MS, 500)
const maxAttachmentSize = parsePositiveInt(process.env.MAX_ATTACHMENT_SIZE, 10000000)
const setMessagesAsSeen = parseBoolean(process.env.SET_MESSAGES_AS_SEEN)
const disabledCallbacks = process.env.DISABLED_CALLBACKS ? process.env.DISABLED_CALLBACKS.split('|') : []
const enableSwaggerEndpoint = parseBoolean(process.env.ENABLE_SWAGGER_ENDPOINT)
const enableWebUI = parseBoolean(process.env.ENABLE_WEB_UI)
const webVersion = process.env.WEB_VERSION
const webVersionCacheType = process.env.WEB_VERSION_CACHE_TYPE || 'none'
const rateLimitMax = parsePositiveInt(process.env.RATE_LIMIT_MAX, 120)
const rateLimitWindowMs = parsePositiveInt(process.env.RATE_LIMIT_WINDOW_MS, 60000)
const maxSessions = parsePositiveInt(process.env.MAX_SESSIONS, 10)
const shutdownTimeoutMs = parsePositiveInt(process.env.SHUTDOWN_TIMEOUT_MS, 30000)
const recoverSessions = parseBoolean(process.env.RECOVER_SESSIONS)
const chromeBin = process.env.CHROME_BIN || null
const headless = process.env.HEADLESS ? parseBoolean(process.env.HEADLESS) : true
const releaseBrowserLock = process.env.RELEASE_BROWSER_LOCK ? parseBoolean(process.env.RELEASE_BROWSER_LOCK) : true
const logLevel = process.env.LOG_LEVEL || 'info'
const enableWebHook = process.env.ENABLE_WEBHOOK ? parseBoolean(process.env.ENABLE_WEBHOOK) : true
const enableWebSocket = parseBoolean(process.env.ENABLE_WEBSOCKET)
const autoStartSessions = process.env.AUTO_START_SESSIONS ? parseBoolean(process.env.AUTO_START_SESSIONS) : true
const basePath = normalizeBasePath(process.env.BASE_PATH)
const trustProxy = parseBoolean(process.env.TRUST_PROXY)
const proxyUrl = process.env.PROXY_URL || null
const proxyUsername = process.env.PROXY_USERNAME ?? null
const proxyPassword = process.env.PROXY_PASSWORD ?? null
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : []
const enableUnsafeRunMethod = parseBoolean(process.env.ENABLE_UNSAFE_RUN_METHOD)
const enableRemoteMediaUrl = parseBoolean(process.env.ENABLE_REMOTE_MEDIA_URL)

module.exports = {
  servicePort,
  sessionFolderPath,
  enableLocalCallbackExample,
  globalApiKey,
  allowInsecureNoAuth,
  baseWebhookURL,
  webhookSecret,
  webhookTimeoutMs,
  webhookMaxAttempts,
  webhookRetryBaseMs,
  maxAttachmentSize,
  setMessagesAsSeen,
  disabledCallbacks,
  enableSwaggerEndpoint,
  enableWebUI,
  webVersion,
  webVersionCacheType,
  rateLimitMax,
  rateLimitWindowMs,
  maxSessions,
  shutdownTimeoutMs,
  recoverSessions,
  chromeBin,
  headless,
  releaseBrowserLock,
  logLevel,
  enableWebHook,
  enableWebSocket,
  autoStartSessions,
  basePath,
  trustProxy,
  proxyUrl,
  proxyUsername,
  proxyPassword,
  allowedOrigins,
  enableUnsafeRunMethod,
  enableRemoteMediaUrl
}
