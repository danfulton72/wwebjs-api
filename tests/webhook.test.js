jest.mock('axios', () => ({
  post: jest.fn()
}))

const managedEnvKeys = [
  'ENABLE_WEBHOOK',
  'WEBHOOK_SECRET',
  'WEBHOOK_TIMEOUT_MS',
  'WEBHOOK_MAX_ATTEMPTS',
  'WEBHOOK_RETRY_BASE_MS'
]
const originalEnv = Object.fromEntries(managedEnvKeys.map(key => [key, process.env[key]]))

process.env.ENABLE_WEBHOOK = 'TRUE'
process.env.WEBHOOK_SECRET = 'webhook-test-secret'
process.env.WEBHOOK_TIMEOUT_MS = '50'
process.env.WEBHOOK_MAX_ATTEMPTS = '2'
process.env.WEBHOOK_RETRY_BASE_MS = '1'

const axios = require('axios')
const { deliverWebhook, webhookSignature } = require('../src/utils')

afterAll(() => {
  for (const key of managedEnvKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

describe('webhook delivery', () => {
  beforeEach(() => {
    axios.post.mockReset()
  })

  it('signs the exact JSON body with event metadata', async () => {
    axios.post.mockResolvedValue({ status: 204 })

    await deliverWebhook('https://example.test/events', 'demo', 'ready', { ok: true })

    expect(axios.post).toHaveBeenCalledTimes(1)
    const [url, body, options] = axios.post.mock.calls[0]
    const payload = JSON.parse(body)

    expect(url).toBe('https://example.test/events')
    expect(payload).toMatchObject({
      sessionId: 'demo',
      dataType: 'ready',
      data: { ok: true }
    })
    expect(payload.eventId).toEqual(expect.any(String))
    expect(payload.timestamp).toEqual(expect.any(String))
    expect(options.timeout).toBe(50)
    expect(options.maxRedirects).toBe(0)
    expect(options.headers['x-wwebjs-event-id']).toBe(payload.eventId)
    expect(options.headers['x-wwebjs-timestamp']).toBe(payload.timestamp)
    expect(options.headers['x-wwebjs-signature']).toBe(
      webhookSignature('webhook-test-secret', payload.timestamp, body)
    )
  })

  it('retries retryable server failures', async () => {
    const serverError = Object.assign(new Error('server error'), {
      response: { status: 503 }
    })
    axios.post
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce({ status: 204 })

    await deliverWebhook('https://example.test/events', 'demo', 'message', { id: 1 })

    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-retryable client failures', async () => {
    const clientError = Object.assign(new Error('bad request'), {
      response: { status: 400 }
    })
    axios.post.mockRejectedValue(clientError)

    await deliverWebhook('https://example.test/events', 'demo', 'message', { id: 1 })

    expect(axios.post).toHaveBeenCalledTimes(1)
  })
})
