const crypto = require('crypto')

class AppError extends Error {
  constructor (statusCode, code, message, details = undefined) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
  }
}

const statusCodeToCode = (statusCode) => {
  if (statusCode === 400) return 'BAD_REQUEST'
  if (statusCode === 401) return 'UNAUTHORIZED'
  if (statusCode === 403) return 'FORBIDDEN'
  if (statusCode === 404) return 'NOT_FOUND'
  if (statusCode === 409) return 'CONFLICT'
  if (statusCode === 413) return 'PAYLOAD_TOO_LARGE'
  if (statusCode === 422) return 'VALIDATION_ERROR'
  if (statusCode === 429) return 'RATE_LIMITED'
  if (statusCode === 503) return 'SERVICE_UNAVAILABLE'
  return 'INTERNAL_ERROR'
}

const requestContext = (req, res, next) => {
  const suppliedId = req.headers['x-request-id']
  const requestId = typeof suppliedId === 'string' && suppliedId.length <= 128
    ? suppliedId
    : crypto.randomUUID()

  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}

const sendError = (res, statusCode, message, options = {}) => {
  const payload = {
    success: false,
    error: String(message),
    code: options.code || statusCodeToCode(statusCode),
    requestId: res.req?.requestId
  }

  if (options.details !== undefined) payload.details = options.details
  return res.status(statusCode).json(payload)
}

const notFoundHandler = (req, res) => {
  return sendError(res, 404, 'Route not found', { code: 'ROUTE_NOT_FOUND' })
}

const errorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error)

  if (error?.type === 'entity.parse.failed') {
    return sendError(res, 400, 'Request body contains invalid JSON', { code: 'INVALID_JSON' })
  }

  if (error?.type === 'entity.too.large') {
    return sendError(res, 413, 'Request payload is too large', { code: 'PAYLOAD_TOO_LARGE' })
  }

  if (error instanceof AppError) {
    return sendError(res, error.statusCode, error.message, {
      code: error.code,
      details: error.details
    })
  }

  req.log?.error?.({ err: error, requestId: req.requestId }, 'Unhandled request error')
  return sendError(res, 500, 'Internal server error')
}

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

module.exports = {
  AppError,
  asyncHandler,
  errorHandler,
  notFoundHandler,
  requestContext,
  sendError,
  statusCodeToCode
}
