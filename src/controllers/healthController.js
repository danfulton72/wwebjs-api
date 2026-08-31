const fsp = require('fs').promises
const qrcode = require('qrcode-terminal')
const { sessionFolderPath } = require('../config')
const { logger } = require('../logger')
const { sessions } = require('../sessions')
const { getRuntimeState } = require('../runtime')

const ping = async (req, res) => {
  res.json({ success: true, message: 'pong' })
}

const live = async (req, res) => {
  const state = getRuntimeState()
  res.json({
    success: true,
    status: 'live',
    phase: state.phase,
    uptimeSeconds: state.uptimeSeconds
  })
}

const ready = async (req, res) => {
  const state = getRuntimeState()
  const statusCode = state.ready ? 200 : 503

  res.status(statusCode).json({
    success: state.ready,
    status: state.ready ? 'ready' : 'not_ready',
    phase: state.phase,
    reason: state.reason,
    sessions: sessions.size,
    uptimeSeconds: state.uptimeSeconds
  })
}

const localCallbackExample = async (req, res) => {
  try {
    const { dataType, data } = req.body
    if (dataType === 'qr') qrcode.generate(data.qr, { small: true })
    await fsp.mkdir(sessionFolderPath, { recursive: true })
    await fsp.writeFile(`${sessionFolderPath}/message_log.txt`, `${JSON.stringify(req.body)}\r\n`, { flag: 'a+' })
    res.json({ success: true })
  } catch (error) {
    logger.error({ err: error }, 'Failed to handle local callback')
    res.status(500).json({ success: false, error: 'Failed to handle local callback' })
  }
}

module.exports = { live, localCallbackExample, ping, ready }
