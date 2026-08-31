const request = require('supertest')

process.env.API_KEY = 'security_test_key'
process.env.SESSIONS_PATH = './sessions_security_test'
process.env.ENABLE_WEBHOOK = 'FALSE'
process.env.ENABLE_WEB_UI = 'TRUE'
process.env.ALLOWED_ORIGINS = 'https://trusted.example'
process.env.ENABLE_UNSAFE_RUN_METHOD = 'FALSE'
process.env.ENABLE_REMOTE_MEDIA_URL = 'FALSE'

const app = require('../src/app')
jest.mock('qrcode-terminal')

describe('security foundation', () => {
  it('keeps the liveness endpoint public', async () => {
    const response = await request(app).get('/ping')
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, message: 'pong' })
  })

  it('rejects protected API calls with an invalid key', async () => {
    const response = await request(app)
      .get('/session/getSessions')
      .set('x-api-key', 'wrong-key')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ success: false, error: 'Invalid API key' })
  })

  it('disables generic runMethod routes by default', async () => {
    const response = await request(app)
      .post('/client/runMethod/example')
      .set('x-api-key', 'security_test_key')
      .send({ method: 'getChats' })

    expect(response.status).toBe(404)
    expect(response.body).toEqual({ success: false, error: 'Endpoint disabled' })
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
    expect(response.body.error).toMatch(/Remote media URL fetching is disabled/)
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
