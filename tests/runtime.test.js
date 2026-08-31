const request = require('supertest')

process.env.API_KEY = 'runtime_test_key'
process.env.ENABLE_WEBHOOK = 'FALSE'
process.env.SESSIONS_PATH = './sessions_runtime_test'

const app = require('../src/app')
const {
  markNotReady,
  markReady,
  markShuttingDown
} = require('../src/runtime')

describe('runtime health', () => {
  beforeEach(() => {
    markNotReady('test_not_ready')
  })

  it('reports liveness independently of readiness', async () => {
    const response = await request(app).get('/health/live')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      status: 'live'
    })
  })

  it('returns 503 until the service is ready', async () => {
    const response = await request(app).get('/health/ready')
    expect(response.status).toBe(503)
    expect(response.body).toMatchObject({
      success: false,
      status: 'not_ready',
      reason: 'test_not_ready'
    })
  })

  it('returns 200 after readiness is established', async () => {
    markReady()
    const response = await request(app).get('/health/ready')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      status: 'ready',
      phase: 'ready'
    })
  })

  it('drops readiness while shutting down', async () => {
    markReady()
    markShuttingDown()
    const response = await request(app).get('/health/ready')
    expect(response.status).toBe(503)
    expect(response.body.phase).toBe('shutting_down')
  })
})
