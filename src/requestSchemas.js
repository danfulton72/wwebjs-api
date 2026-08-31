const { z } = require('zod')
const { sendError } = require('./errors')
const { sessions } = require('./sessions')

const sessionIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/, 'Session ID may contain only letters, numbers, underscore, and hyphen')

const recordSchema = z.record(z.string(), z.unknown())
const whatsappIdSchema = z.string().min(1).max(256)

const pairingSchema = z.object({
  phoneNumber: z.string().regex(/^\d{6,20}$/, 'phoneNumber must use international digits-only format'),
  showNotification: z.boolean().optional()
}).passthrough()

const numberSchema = z.object({
  number: z.string().min(1).max(64)
}).passthrough()

const createGroupSchema = z.object({
  title: z.string().min(1).max(256),
  participants: z.union([
    whatsappIdSchema,
    z.array(whatsappIdSchema).min(1).max(1024)
  ]),
  options: recordSchema.optional()
}).passthrough()

const statusSchema = z.object({
  status: z.string().min(1).max(4096)
}).passthrough()

const localCallbackSchema = z.object({
  dataType: z.string().min(1).max(128),
  data: z.unknown().optional(),
  sessionId: sessionIdSchema.optional()
}).passthrough()

const httpUrlSchema = z.string().url().refine((input) => {
  try {
    const protocol = new URL(input).protocol
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}, 'Remote media URL must use http or https')

const sendMessageSchema = z.object({
  chatId: whatsappIdSchema,
  contentType: z.enum([
    'string',
    'MessageMedia',
    'MessageMediaFromURL',
    'Location',
    'Contact',
    'Poll'
  ]),
  content: z.unknown(),
  options: recordSchema.optional(),
  mediaFromURLOptions: recordSchema.optional()
}).passthrough().superRefine((value, ctx) => {
  let result

  switch (value.contentType) {
    case 'string':
      result = z.string().safeParse(value.content)
      break
    case 'MessageMedia':
      result = z.object({
        mimetype: z.string().min(1).max(256),
        data: z.string().min(1),
        filename: z.string().max(1024).nullish(),
        filesize: z.number().int().nonnegative().nullish()
      }).passthrough().safeParse(value.content)
      break
    case 'MessageMediaFromURL':
      result = httpUrlSchema.safeParse(value.content)
      break
    case 'Location':
      result = z.object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        description: z.string().max(4096).optional()
      }).passthrough().safeParse(value.content)
      break
    case 'Contact':
      result = z.object({ contactId: whatsappIdSchema }).passthrough().safeParse(value.content)
      break
    case 'Poll':
      result = z.object({
        pollName: z.string().min(1).max(1024),
        pollOptions: z.array(z.string().min(1).max(1024)).min(2).max(12),
        options: recordSchema.optional()
      }).passthrough().safeParse(value.content)
      break
    default:
      result = { success: false }
  }

  if (!result.success) {
    ctx.addIssue({
      code: 'custom',
      path: ['content'],
      message: `Invalid content for contentType ${value.contentType}`
    })
  }
})

const bodySchemas = [
  { method: 'POST', prefix: '/session/requestpairingcode/', schema: pairingSchema },
  { method: 'POST', prefix: '/client/sendmessage/', schema: sendMessageSchema },
  { method: 'POST', prefix: '/client/creategroup/', schema: createGroupSchema },
  { method: 'POST', prefix: '/client/setstatus/', schema: statusSchema },
  { method: 'POST', prefix: '/client/isregistereduser/', schema: numberSchema },
  { method: 'POST', prefix: '/client/getnumberid/', schema: numberSchema },
  { method: 'POST', prefix: '/localcallbackexample', schema: localCallbackSchema }
]

const resourcesWithSessionId = new Set([
  'session',
  'client',
  'chat',
  'groupchat',
  'message',
  'contact',
  'channel'
])

const formatIssues = (issues) => issues.map(issue => ({
  path: issue.path.join('.'),
  message: issue.message
}))

const requestSchemaValidation = (req, res, next) => {
  const normalizedPath = req.path.toLowerCase()
  const segments = req.path.split('/').filter(Boolean)
  const resource = segments[0]?.toLowerCase()
  const sessionId = segments[2]

  if (resourcesWithSessionId.has(resource) && sessionId) {
    const sessionResult = sessionIdSchema.safeParse(sessionId)
    if (!sessionResult.success) {
      return sendError(res, 422, 'Request validation failed', {
        code: 'VALIDATION_ERROR',
        details: formatIssues(sessionResult.error.issues)
      })
    }

    // Preserve legacy resource semantics: for non-session resources, let the
    // route-level session middleware return 404 before validating the body.
    if (resource !== 'session' && !sessions.has(sessionId)) return next()
  }

  const bodyRule = bodySchemas.find(rule => (
    rule.method === req.method && normalizedPath.startsWith(rule.prefix)
  ))

  if (!bodyRule) return next()

  const bodyResult = bodyRule.schema.safeParse(req.body)
  if (!bodyResult.success) {
    return sendError(res, 422, 'Request validation failed', {
      code: 'VALIDATION_ERROR',
      details: formatIssues(bodyResult.error.issues)
    })
  }

  // Validation is non-transforming: keep the original object so field order,
  // unknown passthrough properties and legacy controller semantics are stable.
  next()
}

module.exports = {
  requestSchemaValidation,
  schemas: {
    createGroupSchema,
    pairingSchema,
    sendMessageSchema,
    sessionIdSchema
  }
}
