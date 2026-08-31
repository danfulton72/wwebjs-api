const crypto = require('crypto')
const axios = require('axios')
const {
  disabledCallbacks,
  enableWebHook,
  webhookSecret,
  webhookTimeoutMs,
  webhookMaxAttempts,
  webhookRetryBaseMs
} = require('./config')
const { logger } = require('./logger')
const { sendError } = require('./errors')
const { exposeFunctionIfAbsent, patchWWebLibrary } = require('./wwebjs/privateInternals')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const getWebhookSecret = (sessionId) => {
  const sessionSecret = process.env[`${sessionId.toUpperCase()}_WEBHOOK_SECRET`]
  return sessionSecret || webhookSecret
}

const webhookSignature = (secret, timestamp, body) => {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
  return `sha256=${digest}`
}

const shouldRetryWebhook = (error) => {
  const status = error.response?.status
  if (!status) return true
  return status === 408 || status === 429 || status >= 500
}

const deliverWebhook = async (webhookURL, sessionId, dataType, data) => {
  const secret = getWebhookSecret(sessionId)
  if (!secret) {
    logger.error({ sessionId, dataType }, 'Webhook delivery skipped because no webhook signing secret is configured')
    return
  }

  const eventId = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const payload = { eventId, timestamp, dataType, data, sessionId }
  const body = JSON.stringify(payload)
  const headers = {
    'content-type': 'application/json',
    'x-wwebjs-event-id': eventId,
    'x-wwebjs-timestamp': timestamp,
    'x-wwebjs-signature': webhookSignature(secret, timestamp, body)
  }

  for (let attempt = 1; attempt <= webhookMaxAttempts; attempt++) {
    try {
      await axios.post(webhookURL, body, {
        headers,
        timeout: webhookTimeoutMs,
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 300
      })
      logger.debug({ sessionId, dataType, eventId, attempt }, 'Webhook delivered')
      return
    } catch (error) {
      const finalAttempt = attempt === webhookMaxAttempts
      if (finalAttempt || !shouldRetryWebhook(error)) {
        logger.error({
          sessionId,
          dataType,
          eventId,
          attempt,
          status: error.response?.status,
          err: error
        }, 'Webhook delivery failed')
        return
      }

      const backoffMs = Math.min(webhookRetryBaseMs * (2 ** (attempt - 1)), 10000)
      logger.warn({
        sessionId,
        dataType,
        eventId,
        attempt,
        backoffMs,
        status: error.response?.status
      }, 'Webhook delivery failed; retrying')
      await delay(backoffMs)
    }
  }
}

const triggerWebhook = (webhookURL, sessionId, dataType, data) => {
  if (!enableWebHook || !webhookURL) return
  void deliverWebhook(webhookURL, sessionId, dataType, data)
}

const sendErrorResponse = (res, status, error, code) => {
  const message = error instanceof Error ? error.message : error
  if (error instanceof Error) logger.error({ err: error }, message)
  return sendError(res, status, message, { code })
}

const waitForNestedObject = (rootObj, nestedPath, maxWaitTime = 10000, interval = 100) => {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const checkObject = () => {
      const nestedObj = nestedPath.split('.').reduce((obj, key) => obj ? obj[key] : undefined, rootObj)
      if (nestedObj) {
        resolve()
      } else if (Date.now() - start > maxWaitTime) {
        logger.error('Timed out waiting for nested object')
        reject(new Error('Timeout waiting for nested object'))
      } else {
        setTimeout(checkObject, interval)
      }
    }
    checkObject()
  })
}

const isEventEnabled = (event) => {
  return !disabledCallbacks.includes(event)
}

const sendMessageSeenStatus = async (message) => {
  try {
    const chat = await message.getChat()
    await chat.sendSeen()
  } catch (error) {
    logger.error(error, 'Failed to send seen status')
  }
}

const decodeBase64 = function * (base64String) {
  const chunkSize = 1024
  for (let i = 0; i < base64String.length; i += chunkSize) {
    const chunk = base64String.slice(i, i + chunkSize)
    yield Buffer.from(chunk, 'base64')
  }
}

const sleep = function (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = {
  decodeBase64,
  deliverWebhook,
  exposeFunctionIfAbsent,
  isEventEnabled,
  patchWWebLibrary,
  sendErrorResponse,
  sendMessageSeenStatus,
  sleep,
  triggerWebhook,
  webhookSignature,
  waitForNestedObject
}
