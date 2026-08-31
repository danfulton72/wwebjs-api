const startedAt = Date.now()

let phase = 'starting'
let reason = 'service_starting'

const setRuntimePhase = (nextPhase, nextReason = null) => {
  phase = nextPhase
  reason = nextReason
}

const markRestoring = () => setRuntimePhase('restoring', 'session_restore_in_progress')
const markReady = () => setRuntimePhase('ready', null)
const markNotReady = (nextReason = 'service_not_ready') => setRuntimePhase('not_ready', nextReason)
const markShuttingDown = () => setRuntimePhase('shutting_down', 'service_shutting_down')

const isReady = () => phase === 'ready'
const isShuttingDown = () => phase === 'shutting_down'

const getRuntimeState = () => ({
  phase,
  ready: isReady(),
  reason,
  uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
})

module.exports = {
  getRuntimeState,
  isReady,
  isShuttingDown,
  markNotReady,
  markReady,
  markRestoring,
  markShuttingDown
}
