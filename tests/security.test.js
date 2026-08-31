const request = require('supertest')

const managedEnvKeys = [
  'API_KEY',
  'SESSIONS_PATH',
  'ENABLE_WEB_UI',
  'ALLOWED_ORIGINS',
  'ENABLE_UNSAFE_RUN_METHOD',
  'ENABLE_REMOTE_MEDIA_URL',
  'ALLOW_INSECURE_NO_AUTH'
]
const originalEnv = Object.fromEntries(managedEnvKeys.map(key => [key, process.env[key]]))

process.env.API_KEY = 'security_test_key'
process.env.SESSIONS_PATH = './sessions_security_test'
process.env.ENABLE_WEB_UI = 'TRUE'
process.env.ALLOWED_ORIGINS = 'https://trusted.example'
process.env.ENABLE_UNSAFE_RUN_METHOD = 'FALSE'
process.env.ENABLE_REMOTE_MEDIA_URL = 'FALSE'
process.env.ALLOW_INSECURE_NO_AUTH = 'FALSE'

const app = require('../src/app')
jest.mock('qrcode-terminal')

afterAll(() => {
  for (const key of managedEnvKeys) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
})

describe('security foundation', () => {
  it('keeps the legacy liveness endpoint public', async () => {
    const response = await request(app).get('/ping')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, message: 'pong' })
  })

  it('rejects protected API calls with a standardized error', async () => {
    const response = await request(app)
      .get('/session/getSessions')
      .set('x-api-key', 'wrong-key')

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      success: false,
      error: 'Invalid API key',
      code: 'INVALID_API_KEY'
    })
    expect(response.body.requestId).toEqual(expect.any(String))
    expect(response.headers['x-request-id']).toBe(response.body.requestId)
  })

  it('disables generic runMethod routes by default, including case variants', async () => {
    const response = await request(app)
      .post('/CLIENT/runMethod/example')
      .set('x-api-key', 'security_test_key')
      .send({ method: 'getChats' })

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      success: false,
      error: 'Endpoint disabled',
      code: 'ENDPOINT_DISABLED'
    })
  })

  it('disables remote media URL fetching by default', async () => {
    const response = await request(app)
      .post('/client/sendMessage/example')
      .set('x-api-key', 'security_test_key')
      .send({
        chatId: '123@c.us',
        contentType: 'MessageMediaFromURL',
        content: 'http://169.254.169.254/latest/meta-data/'
      })

    expect(response.status).toBe(403)
    expect(response.body).toMatchObject({
      success: false,
      code: 'REMOTE_MEDIA_DISABLED'
    })
    expect(response.body.error).toMatch(/Remote media URL fetching is disabled/)
  })

  it('validates pairing requests before they reach the controller', async () => {
    const response = await request(app)
      .post('/session/requestPairingCode/example')
      .set('x-api-key', 'security_test_key')
      .send({ phoneNumber: '+44 7700 900123' })

    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Request validation failed'
    })
    expect(response.body.details).toEqual(expect.any(Array))
  })

  it('does not expose validation details before authentication', async () => {
    const response = await request(app)
      .post('/session/requestPairingCode/example')
      .set('x-api-key', 'wrong-key')
      .send({ phoneNumber: 'bad' })

    expect(response.status).toBe(403)
    expect(response.body.code).toBe('INVALID_API_KEY')
  })

  it('does not emit permissive CORS headers for untrusted origins', async () => {
    const response = await request(app)
      .get('/ping')
      .set('Origin', 'https://evil.example')

    expect(response.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows configured CORS origins', async () => {
    const response = await request(app)
      .get('/ping')
      .set('Origin', 'https://trusted.example')

    expect(response.headers['access-control-allow-origin']).toBe('https://trusted.example')
  })

  it('sets CSP on the dashboard', async () => {
    const response = await request(app).get('/dashboard/')
    expect(response.status).toBe(200)
    expect(response.headers['content-security-policy']).toMatch(/default-src 'self'/)
  })
})
