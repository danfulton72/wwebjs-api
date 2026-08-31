# Test suites

`npm test` and `npm run test:coverage` run deterministic tests only. They must not initialize Chromium, require a WhatsApp account, or depend on external network services.

`npm run test:integration` runs `tests/integration/**` and is intentionally opt-in because it may initialize Chromium and exercise live WhatsApp Web behavior.

When adding regression coverage, prefer deterministic tests with mocked boundaries. Add a live integration test only when behavior cannot be meaningfully verified at the HTTP/wwebjs adapter boundary.
