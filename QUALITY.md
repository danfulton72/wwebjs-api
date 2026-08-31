# Engineering quality gates

The default validation path is deterministic and does not launch Chromium or connect to WhatsApp.

## Local checks

```bash
npm ci
npm run lint
npm run test:coverage
npm run audit:prod
npm run sbom
```

Live WhatsApp/browser integration tests are explicit:

```bash
npm run test:integration
```

## CI evidence

Pull requests run deterministic coverage, production dependency audit, dependency review, container vulnerability scanning, CodeQL, Hassfest and HACS. CI publishes LCOV/coverage data, an npm CycloneDX application SBOM and a Trivy CycloneDX container SBOM.

## Architecture boundary

Undocumented whatsapp-web.js imports, prototype patches, Puppeteer page/browser handles and other private integration details belong under `src/wwebjs/`. Route-facing controllers are split by feature and expose the existing API through small composition facades.

## Action pinning

All `uses:` entries in repository workflows are pinned to full commit SHAs. Dependabot tracks GitHub Actions and npm updates so pins can be advanced through reviewed pull requests.
