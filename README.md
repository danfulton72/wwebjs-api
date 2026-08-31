# WWebJS REST API

A REST API wrapper for [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js), maintained at `danfulton72/wwebjs-api` and distributed as a container through GitHub Container Registry.

> **Important:** this project uses WhatsApp Web through an unofficial client. WhatsApp may restrict or block accounts that use unofficial automation. Evaluate that risk before production use.

## Project status and provenance

This repository is maintained independently. It was originally derived from earlier MIT-licensed WWebJS API projects. The original copyright and MIT permission notice are retained in [`LICENSE`](./LICENSE) as required by the licence.

## Secure defaults

The service now starts from a fail-closed posture:

- `API_KEY` is required unless `ALLOW_INSECURE_NO_AUTH=TRUE` is explicitly set.
- Cross-origin browser access is disabled unless `ALLOWED_ORIGINS` is configured.
- WebSocket upgrades require the API key and validate browser origins.
- Requests are rate limited globally.
- New session creation is bounded by `MAX_SESSIONS`.
- Generic `runMethod` API routes are disabled unless `ENABLE_UNSAFE_RUN_METHOD=TRUE` is explicitly set.
- `MessageMediaFromURL` is disabled unless `ENABLE_REMOTE_MEDIA_URL=TRUE` is explicitly set because server-side URL fetching carries SSRF risk.
- The production container runs as a non-root user and strips Chromium `--no-sandbox` flags before launch.
- The dashboard keeps its API key only for the current browser tab/session rather than persistent local storage.

The two unsafe compatibility switches are intended only for trusted environments. Prefer explicit API endpoints and upload media content directly.

## Quick start with Docker Compose

Clone the standalone repository:

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

Check liveness without authentication:

```bash
curl http://localhost:3000/ping
```

Authenticated API calls must include the key:

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

- Node.js 20 or newer
- Chromium/Chrome available for `whatsapp-web.js`

```bash
npm ci
cp .env.example .env
# set API_KEY and any required webhook configuration
npm start
```

## Configuration

See [`.env.example`](./.env.example) for the full set of options. Security-related settings include:

| Variable | Default | Purpose |
| --- | --- | --- |
| `API_KEY` | required | Shared key for REST and WebSocket access. |
| `ALLOW_INSECURE_NO_AUTH` | `FALSE` | Explicit development-only opt-out from API authentication. |
| `ALLOWED_ORIGINS` | empty | Comma-separated browser origins allowed for CORS and cross-origin WebSockets. |
| `RATE_LIMIT_MAX` | `120` | Requests allowed per rate-limit window. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds. |
| `MAX_SESSIONS` | `10` | Maximum number of active or starting sessions in this process. |
| `ENABLE_UNSAFE_RUN_METHOD` | `FALSE` | Enables generic dynamic method execution routes. Not recommended. |
| `ENABLE_REMOTE_MEDIA_URL` | `FALSE` | Enables server-side remote media fetching. Not recommended on untrusted networks. |

## Webhooks

Enable webhooks with `ENABLE_WEBHOOK=TRUE` and set `BASE_WEBHOOK_URL`. A session-specific URL can be supplied with `<SESSION_ID>_WEBHOOK_URL`.

Use `DISABLED_CALLBACKS` to suppress event types you do not need.

## WebSocket mode

Set `ENABLE_WEBSOCKET=TRUE`. Each session is exposed at:

```text
/ws/:sessionId
```

WebSocket upgrades must include the same `x-api-key` header used by the REST API. Example with the Node `ws` client:

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

Browser WebSocket clients cannot set arbitrary request headers, so direct browser WebSocket connections are not supported by the API-key transport. Put a trusted backend or authenticated reverse proxy in front if browser WebSocket access is required.

## Dashboard

Set `ENABLE_WEB_UI=TRUE` and visit `/dashboard/`. The dashboard itself can load without an API key, but management API calls require the key. The key is stored only in `sessionStorage` for the current browser tab/session.

## OpenAPI documentation

The generated OpenAPI document is [`swagger.json`](./swagger.json). The raw document is available from this repository at:

```text
https://raw.githubusercontent.com/danfulton72/wwebjs-api/main/swagger.json
```

Set `ENABLE_SWAGGER_ENDPOINT=TRUE` to expose `/api-docs` from the running service.

## Testing

```bash
npm test
```

The live WhatsApp integration tests can require Chromium and network access, so keep deterministic/unit tests separate from live smoke tests when extending the project.

## Production notes

- Keep `ALLOW_INSECURE_NO_AUTH=FALSE`.
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
