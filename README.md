# WWebJS REST API

A REST API wrapper for [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js), maintained at `danfulton72/wwebjs-api` and distributed through GitHub Container Registry.

> **Important:** this project uses WhatsApp Web through an unofficial client. WhatsApp may restrict or block accounts that use unofficial automation. Evaluate that risk before production use.

## Project status and provenance

This repository is maintained independently. It was originally derived from earlier MIT-licensed WWebJS API projects. The original copyright and MIT permission notice are retained in [`LICENSE`](./LICENSE).

## Runtime baseline

The production runtime targets **Node.js 24** and Express 5. The container image, pull-request CI and release CI use Node 24 so development validation and production execution use the same major runtime.

The service starts from a fail-closed posture:

- `API_KEY` is required unless `ALLOW_INSECURE_NO_AUTH=TRUE` is explicitly set.
- Cross-origin browser access is disabled unless `ALLOWED_ORIGINS` is configured.
- WebSocket upgrades require the API key and validate browser origins.
- Requests are rate limited globally.
- New session creation is bounded by `MAX_SESSIONS`.
- Generic `runMethod` API routes are disabled unless `ENABLE_UNSAFE_RUN_METHOD=TRUE` is explicitly set.
- `MessageMediaFromURL` is disabled unless `ENABLE_REMOTE_MEDIA_URL=TRUE` is explicitly set because server-side URL fetching carries SSRF risk.
- The production container runs as a non-root user and strips Chromium `--no-sandbox` flags before launch.
- The dashboard keeps its API key only in `sessionStorage`.
- API errors include a stable error code and request ID.
- High-risk request bodies are validated with runtime schemas before reaching controllers.

## Quick start with Docker Compose

```bash
git clone https://github.com/danfulton72/wwebjs-api.git
cd wwebjs-api
cp .env.example .env
```

Set a strong random `API_KEY` in `.env`, then start the service:

```bash
docker compose pull
docker compose up -d
```

The default image is:

```text
ghcr.io/danfulton72/wwebjs-api:latest
```

Authenticated API calls include the API key:

```bash
curl -H "x-api-key: $API_KEY" \
  http://localhost:3000/session/getSessions
```

Start a session:

```bash
curl -H "x-api-key: $API_KEY" \
  http://localhost:3000/session/start/example
```

Then retrieve the QR image or pairing code through the session endpoints and link the device from WhatsApp.

## Run locally

Requirements:

- Node.js 24
- Chromium/Chrome available for `whatsapp-web.js`

```bash
npm ci
cp .env.example .env
# set API_KEY and any required webhook configuration
npm start
```

For the full validation suite:

```bash
npm run check
```

## Health and readiness

Operational endpoints are intentionally unauthenticated so orchestrators can probe the service:

```text
GET /health/live
GET /health/ready
```

`/health/live` returns 200 while the HTTP process is alive. `/health/ready` returns 503 during startup/session restoration and graceful shutdown, and 200 only after the service is ready to accept work.

The legacy `/ping` endpoint remains available for compatibility. Docker Compose uses `/health/ready` and gives the application a graceful stop window.

When `BASE_PATH` is configured, the health endpoints are mounted beneath that path as well, for example `/api/v1/whatsapp/health/ready`.

## API errors and request IDs

Operational errors use a consistent JSON shape:

```json
{
  "success": false,
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "requestId": "f5d8e5f4-4a39-4e75-bbba-f9b2fd57263f",
  "details": [
    {
      "path": "phoneNumber",
      "message": "phoneNumber must use international digits-only format"
    }
  ]
}
```

Clients may send an `x-request-id` header (up to 128 characters); otherwise the service generates one. The same value is returned in the `X-Request-Id` response header and error body to make request tracing easier.

Schema validation currently covers the security- and lifecycle-sensitive legacy request surfaces, including session IDs, pairing-code requests, message sending, group creation, status updates and number lookups. The validation layer is designed to be expanded without changing controller contracts.

## Configuration

See [`.env.example`](./.env.example) for all options. Important production settings include:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_KEY` | required | Shared key for REST and server-side WebSocket access. |
| `ALLOW_INSECURE_NO_AUTH` | `FALSE` | Development-only opt-out from authentication. |
| `ALLOWED_ORIGINS` | empty | Exact browser origins allowed for CORS/cross-origin WebSockets. |
| `RATE_LIMIT_MAX` | `120` | Requests allowed per rate-limit window. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds. |
| `MAX_SESSIONS` | `10` | Maximum active or starting sessions in this process. |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | Maximum graceful shutdown drain period. |
| `WEBHOOK_SECRET` | required when webhooks enabled | HMAC signing secret for outbound webhook events. |
| `WEBHOOK_TIMEOUT_MS` | `5000` | Timeout for one webhook delivery attempt. |
| `WEBHOOK_MAX_ATTEMPTS` | `4` | Maximum webhook delivery attempts. |
| `WEBHOOK_RETRY_BASE_MS` | `500` | Initial exponential retry delay. |
| `ENABLE_UNSAFE_RUN_METHOD` | `FALSE` | Enables generic dynamic method execution routes. Not recommended. |
| `ENABLE_REMOTE_MEDIA_URL` | `FALSE` | Enables server-side remote media fetching. Not recommended. |

## Webhooks

Enable webhooks with:

```text
ENABLE_WEBHOOK=TRUE
BASE_WEBHOOK_URL=https://receiver.example/wwebjs/events
WEBHOOK_SECRET=<separate strong random secret>
```

A session-specific callback URL may be supplied as `<SESSION_ID>_WEBHOOK_URL`, and its signing key may be overridden with `<SESSION_ID>_WEBHOOK_SECRET`.

The outbound webhook payload includes an immutable event ID and timestamp:

```json
{
  "eventId": "7f82f5b1-ae47-4f81-b108-cfcd17620f47",
  "timestamp": "2026-08-31T20:00:00.000Z",
  "dataType": "message",
  "data": {},
  "sessionId": "example"
}
```

Every request includes:

```text
x-wwebjs-event-id: <eventId>
x-wwebjs-timestamp: <timestamp>
x-wwebjs-signature: sha256=<hex digest>
```

The signature is HMAC-SHA256 over the exact string `<timestamp>.<raw JSON body>` using `WEBHOOK_SECRET`. Verify the signature before parsing/trusting the event, reject stale timestamps according to your replay policy, and deduplicate using `eventId`.

Webhook delivery has a bounded timeout and retries network errors, HTTP 408, 429 and 5xx responses with exponential backoff. Redirects are not followed. The inbound API key is never reused as the outbound webhook credential.

Use `DISABLED_CALLBACKS` to suppress event types you do not need.

## Graceful shutdown

On `SIGTERM` or `SIGINT`, the service:

1. marks readiness false;
2. stops accepting new HTTP work;
3. closes idle connections;
4. destroys active WhatsApp sessions and their WebSocket servers;
5. exits after cleanup, or forcibly closes remaining HTTP connections when `SHUTDOWN_TIMEOUT_MS` is reached.

Set your container/orchestrator termination grace period longer than `SHUTDOWN_TIMEOUT_MS`. The supplied Compose configuration uses a 35-second stop grace period for the default 30-second application timeout.

## WebSocket mode

Set `ENABLE_WEBSOCKET=TRUE`. Each session is exposed at:

```text
/ws/:sessionId
```

Server-side WebSocket clients must include the same `x-api-key` header used by the REST API:

```js
const WebSocket = require('ws')

const ws = new WebSocket('ws://127.0.0.1:3000/ws/example', {
  headers: {
    'x-api-key': process.env.API_KEY
  }
})

ws.on('message', data => {
  console.log(data.toString())
})
```

Browser WebSocket clients cannot set arbitrary request headers. Put a trusted backend or authenticated reverse proxy in front if direct browser WebSocket access is required.

## Dashboard

Set `ENABLE_WEB_UI=TRUE` and visit `/dashboard/`. The dashboard itself can load without an API key, but management API calls require the key. The key is stored only in `sessionStorage` for the current browser tab/session.

## Home Assistant

The repository includes a HACS-compatible Home Assistant custom integration at `custom_components/wwebjs_api`.

Add this repository to HACS as a custom **Integration**, install **WWebJS API**, restart Home Assistant, then add the integration from **Settings → Devices & services**. Supply the reachable WWebJS API URL and API key. The config flow verifies credentials against the API before creating the entry.

Home Assistant compatibility is continuously checked with both Hassfest and HACS validation in GitHub Actions.

## OpenAPI documentation

The checked-in OpenAPI document is [`swagger.json`](./swagger.json). Set `ENABLE_SWAGGER_ENDPOINT=TRUE` to expose `/api-docs` from the running service.

## Testing and CI

```bash
npm run lint
npm test
npm run audit:prod
```

Pull-request CI uses Node 24 and gates changes on linting, tests and dependency audits. Live WhatsApp tests can require Chromium and network access, so deterministic tests should stay separate from live smoke tests where possible.

## Production notes

- Keep `ALLOW_INSECURE_NO_AUTH=FALSE`.
- Use distinct random values for `API_KEY` and `WEBHOOK_SECRET`.
- Keep `ENABLE_UNSAFE_RUN_METHOD=FALSE`.
- Keep `ENABLE_REMOTE_MEDIA_URL=FALSE` unless outbound requests are additionally isolated and filtered at the network layer.
- Restrict `ALLOWED_ORIGINS` to exact trusted origins when browser access is required.
- Terminate TLS at a trusted reverse proxy or load balancer.
- Persist `/usr/src/app/sessions` on protected storage.
- Treat WhatsApp session files as credentials and protect backups accordingly.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). Please make changes through pull requests and include tests for security-sensitive behaviour.

## Disclaimer

This project is not affiliated, associated, authorised, endorsed by, or in any way officially connected with WhatsApp or its subsidiaries or affiliates. "WhatsApp" and related names and marks belong to their respective owners.

## License

MIT. See [`LICENSE`](./LICENSE).
