(function () {
  const API_BASE = window.location.pathname.slice(0, window.location.pathname.lastIndexOf('/dashboard'))
  const STORAGE_KEY = 'wwebjsApiKey'
  const SESSION_ID_PATTERN = /^[\w-]+$/
  const POLL_INTERVAL_MS = 5000
  const QR_POLL_INTERVAL_MS = 3000
  const $ = id => document.getElementById(id)

  let pollTimer = null
  let qrTimer = null
  let qrSessionId = null
  let qrObjectUrl = null
  let authFailed = false

  async function apiFetch (path, options = {}) {
    const headers = Object.assign({}, options.headers)
    const apiKey = window.sessionStorage.getItem(STORAGE_KEY)
    if (apiKey) headers['x-api-key'] = apiKey

    const response = await window.fetch(API_BASE + path, Object.assign({}, options, {
      headers,
      cache: 'no-store'
    }))

    if (response.status === 403 || response.status === 503) {
      authFailed = true
      $('apiKeyBanner').classList.remove('hidden')
      throw new Error('Invalid, missing, or unconfigured API key')
    }
    return response
  }

  async function apiJson (path, options) {
    const response = await apiFetch(path, options)
    return response.json()
  }

  function showToast (message, isError) {
    const toast = document.createElement('div')
    toast.className = 'toast' + (isError ? ' toast-error' : '')
    toast.textContent = message
    $('toasts').appendChild(toast)
    setTimeout(() => toast.remove(), 4000)
  }

  function actionButton (label, onClick, extraClass) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'secondary' + (extraClass ? ' ' + extraClass : '')
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  async function refreshSessions () {
    const body = await apiJson('/session/getSessions')
    if (!body.success) throw new Error(body.error || 'Failed to fetch sessions')

    const ids = body.result.sort()
    const statuses = await Promise.all(ids.map(id =>
      apiJson('/session/status/' + encodeURIComponent(id)).catch(() => null)
    ))
    renderSessions(ids, statuses)
  }

  function renderSessions (ids, statuses) {
    const tbody = $('sessionsBody')
    tbody.textContent = ''
    $('emptyState').classList.toggle('hidden', ids.length > 0)

    ids.forEach((id, index) => {
      const status = statuses[index]
      const connected = Boolean(status && status.success && status.state === 'CONNECTED')
      const row = document.createElement('tr')

      const idCell = document.createElement('td')
      idCell.className = 'session-id'
      idCell.textContent = id
      row.appendChild(idCell)

      const statusCell = document.createElement('td')
      const badge = document.createElement('span')
      badge.className = 'badge ' + (connected ? 'badge-connected' : 'badge-pending')
      badge.textContent = (status && status.state) || 'STARTING'
      statusCell.appendChild(badge)
      row.appendChild(statusCell)

      const actionsCell = document.createElement('td')
      actionsCell.className = 'actions-cell'
      const actions = document.createElement('div')
      actions.className = 'actions'
      actions.appendChild(actionButton(connected ? 'Details' : 'Show QR', () => {
        if (connected) openDetailsModal(id)
        else openQrModal(id)
      }))
      actions.appendChild(actionButton('Restart', () => sessionAction(id, 'restart')))
      actions.appendChild(actionButton('Stop', () => sessionAction(id, 'stop')))
      actions.appendChild(actionButton(
        'Terminate',
        () => sessionAction(id, 'terminate', 'Terminate session "' + id + '"? This logs out the linked device.'),
        'danger'
      ))
      actionsCell.appendChild(actions)
      row.appendChild(actionsCell)
      tbody.appendChild(row)
    })
  }

  async function sessionAction (id, action, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return
    try {
      const body = await apiJson('/session/' + action + '/' + encodeURIComponent(id))
      showToast(id + ': ' + (body.message || body.error || action), !body.success)
    } catch (error) {
      showToast(error.message, true)
    }
    refreshNow()
  }

  async function globalAction (path, confirmMessage) {
    if (confirmMessage && !window.confirm(confirmMessage)) return
    try {
      const body = await apiJson(path)
      showToast(body.message || body.error || 'Done', !body.success)
    } catch (error) {
      showToast(error.message, true)
    }
    refreshNow()
  }

  function refreshNow () {
    clearTimeout(pollTimer)
    pollLoop()
  }

  async function pollLoop () {
    if (!document.hidden && !authFailed) {
      try {
        await refreshSessions()
      } catch (_) {}
    }
    pollTimer = setTimeout(pollLoop, POLL_INTERVAL_MS)
  }

  function openStartModal () {
    $('newSessionId').value = ''
    $('addSessionError').classList.add('hidden')
    $('startModal').classList.remove('hidden')
    $('newSessionId').focus()
  }

  function closeStartModal () {
    $('startModal').classList.add('hidden')
  }

  async function startNewSession (event) {
    event.preventDefault()
    const id = $('newSessionId').value.trim()
    if (!SESSION_ID_PATTERN.test(id)) {
      $('addSessionError').textContent = 'Session id should be alphanumerical or -'
      $('addSessionError').classList.remove('hidden')
      return
    }

    const button = $('startSubmitBtn')
    button.disabled = true
    button.textContent = 'Starting…'
    try {
      const body = await apiJson('/session/start/' + encodeURIComponent(id))
      if (body.success) {
        showToast(id + ': ' + body.message)
        closeStartModal()
        openQrModal(id)
      } else {
        showToast(id + ': ' + (body.error || body.message), true)
      }
    } catch (error) {
      showToast(error.message, true)
    } finally {
      button.disabled = false
      button.textContent = 'Start'
      refreshNow()
    }
  }

  function openQrModal (id) {
    clearTimeout(qrTimer)
    qrSessionId = id
    $('qrSessionName').textContent = id
    $('qrImage').classList.add('hidden')
    $('qrConnected').classList.add('hidden')
    $('qrWaiting').textContent = 'Waiting for QR code…'
    $('qrWaiting').classList.remove('hidden')
    $('pairingCode').classList.add('hidden')
    $('pairingPhone').value = ''
    $('qrModal').classList.remove('hidden')
    qrTick()
  }

  async function qrTick () {
    try {
      const status = await apiJson('/session/status/' + encodeURIComponent(qrSessionId))
      if (status.message === 'session_not_found') {
        $('qrWaiting').textContent = 'Session no longer exists'
        return
      }
      if (status.success && status.state === 'CONNECTED') {
        $('qrWaiting').classList.add('hidden')
        $('qrImage').classList.add('hidden')
        $('qrConnected').classList.remove('hidden')
        refreshNow()
        return
      }

      const response = await apiFetch('/session/qr/' + encodeURIComponent(qrSessionId) + '/image')
      if ((response.headers.get('content-type') || '').startsWith('image/png')) {
        const blob = await response.blob()
        if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl)
        qrObjectUrl = URL.createObjectURL(blob)
        $('qrImage').src = qrObjectUrl
        $('qrImage').classList.remove('hidden')
        $('qrWaiting').classList.add('hidden')
      }
    } catch (_) {}
    qrTimer = setTimeout(qrTick, QR_POLL_INTERVAL_MS)
  }

  function closeQrModal () {
    clearTimeout(qrTimer)
    if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl)
    qrObjectUrl = null
    $('qrModal').classList.add('hidden')
    refreshNow()
  }

  async function requestPairingCode () {
    const phoneNumber = $('pairingPhone').value.replace(/\D/g, '')
    if (!phoneNumber) return showToast('Enter a phone number in international digits-only format', true)

    const button = $('pairingBtn')
    button.disabled = true
    try {
      const body = await apiJson('/session/requestPairingCode/' + encodeURIComponent(qrSessionId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, showNotification: true })
      })
      if (body.success) {
        $('pairingCode').textContent = body.result
        $('pairingCode').classList.remove('hidden')
      } else {
        showToast(body.error || body.message || 'Failed to request pairing code', true)
      }
    } catch (error) {
      showToast(error.message, true)
    } finally {
      button.disabled = false
    }
  }

  function addDetail (list, label, value) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value || '—'
    list.appendChild(dt)
    list.appendChild(dd)
  }

  async function openDetailsModal (id) {
    $('detailsSessionName').textContent = id
    $('detailsList').textContent = ''
    $('detailsModal').classList.remove('hidden')
    try {
      const status = await apiJson('/session/status/' + encodeURIComponent(id))
      addDetail($('detailsList'), 'State', status.state || status.message)
      if (status.success && status.state === 'CONNECTED') {
        const body = await apiJson('/client/getClassInfo/' + encodeURIComponent(id))
        const info = body.sessionInfo || {}
        addDetail($('detailsList'), 'Phone number', info.wid && info.wid.user)
        addDetail($('detailsList'), 'Push name', info.pushname)
        addDetail($('detailsList'), 'Platform', info.platform)
      }
    } catch (error) {
      showToast(error.message, true)
    }
  }

  function saveApiKey () {
    const value = $('apiKeyInput').value.trim()
    if (value) window.sessionStorage.setItem(STORAGE_KEY, value)
    else window.sessionStorage.removeItem(STORAGE_KEY)
    authFailed = false
    $('apiKeyBanner').classList.add('hidden')
    showToast('API key saved for this browser session')
    refreshNow()
  }

  async function checkApiDocs () {
    try {
      const response = await window.fetch(API_BASE + '/api-docs', { method: 'HEAD', cache: 'no-store' })
      if (response.ok) $('apiDocsLink').classList.remove('hidden')
    } catch (_) {}
  }

  function init () {
    $('apiKeyInput').value = window.sessionStorage.getItem(STORAGE_KEY) || ''
    checkApiDocs()
    $('apiKeySaveBtn').addEventListener('click', saveApiKey)
    $('addSessionBtn').addEventListener('click', openStartModal)
    $('addSessionForm').addEventListener('submit', startNewSession)
    $('startCloseBtn').addEventListener('click', closeStartModal)
    $('refreshBtn').addEventListener('click', refreshNow)
    $('terminateInactiveBtn').addEventListener('click', () => globalAction('/session/terminateInactive', 'Terminate all inactive sessions?'))
    $('terminateAllBtn').addEventListener('click', () => globalAction('/session/terminateAll', 'Terminate ALL sessions? This logs out every linked device.'))
    $('qrCloseBtn').addEventListener('click', closeQrModal)
    $('pairingBtn').addEventListener('click', requestPairingCode)
    $('detailsCloseBtn').addEventListener('click', () => $('detailsModal').classList.add('hidden'))

    for (const id of ['startModal', 'qrModal', 'detailsModal']) {
      $(id).addEventListener('click', event => {
        if (event.target !== $(id)) return
        if (id === 'startModal') closeStartModal()
        else if (id === 'qrModal') closeQrModal()
        else $(id).classList.add('hidden')
      })
    }

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshNow()
    })
    pollLoop()
  }

  init()
})()
