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
const ChatFactory = require('whatsapp-web.js/src/factories/ChatFactory')
const Client = require('whatsapp-web.js').Client
const { Chat, Message } = require('whatsapp-web.js/src/structures')

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

const exposeFunctionIfAbsent = async (page, name, fn) => {
  const exist = await page.evaluate((name) => {
    return !!window[name]
  }, name)
  if (exist) {
    return
  }
  await page.exposeFunction(name, fn)
}

const patchWWebLibrary = async (client) => {
  Client.prototype.getChats = async function (searchOptions = {}) {
    const chats = await this.pupPage.evaluate(async (searchOptions) => {
      return await window.WWebJS.getChats({ ...searchOptions })
    }, searchOptions)

    return chats.map(chat => ChatFactory.create(this, chat))
  }

  Chat.prototype.fetchMessages = async function (searchOptions) {
    const messages = await this.client.pupPage.evaluate(async (chatId, searchOptions) => {
      const msgFilter = (m) => {
        if (m.isNotification) {
          return false
        }
        if (searchOptions && searchOptions.fromMe !== undefined && m.id.fromMe !== searchOptions.fromMe) {
          return false
        }
        if (searchOptions && searchOptions.since !== undefined && Number.isFinite(searchOptions.since) && m.t < searchOptions.since) {
          return false
        }
        if (searchOptions && searchOptions.messageId !== undefined && m.id.id !== searchOptions.messageId) {
          return false
        }
        return true
      }

      const chat = await window.WWebJS.getChat(chatId, { getAsModel: false })
      let msgs = chat.msgs.getModelsArray().filter(msgFilter)

      if (searchOptions && searchOptions.limit > 0) {
        while (msgs.length < searchOptions.limit) {
          const loadedMessages = await (window.require('WAWebChatLoadMessages')).loadEarlierMsgs({ chat })

          if (!loadedMessages || !loadedMessages.length) break
          msgs = [...loadedMessages.filter(msgFilter), ...msgs]
        }

        if (msgs.length > searchOptions.limit) {
          msgs.sort((a, b) => (a.t > b.t) ? 1 : -1)
          msgs = msgs.splice(msgs.length - searchOptions.limit)
        }
      }

      return msgs.map(m => window.WWebJS.getMessageModel(m))
    }, this.id._serialized, searchOptions)

    return messages.map(m => new Message(this.client, m))
  }

  await client.pupPage.evaluate(() => {
    window.WWebJS.getChats = async (searchOptions = {}) => {
      const chatFilter = (c) => {
        if (searchOptions && searchOptions.unread === true && c.unreadCount === 0) {
          return false
        }
        if (searchOptions && searchOptions.since !== undefined && Number.isFinite(searchOptions.since) && c.t < searchOptions.since) {
          return false
        }
        return true
      }

      const allChats = window.require('WAWebCollections').Chat.getModelsArray()
      const filteredChats = allChats.filter(chatFilter)

      return await Promise.all(
        filteredChats.map(chat => window.WWebJS.getChatModel(chat))
      )
    }
  })
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
