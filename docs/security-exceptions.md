# Security exceptions

## whatsapp-web.js / Puppeteer browser extraction

The current upstream `whatsapp-web.js` release (1.34.7) depends on Puppeteer 24, whose browser installer still reaches `extract-zip@2.0.1`. npm reports GHSA-jmr9-qjv8-65gv for that extraction path. The repository keeps this as a narrow temporary exception because there is no patched `whatsapp-web.js` release using the newer Puppeteer browser stack yet.

The production audit gate only permits the dependency chain `whatsapp-web.js -> puppeteer -> puppeteer-core/@puppeteer/browsers -> extract-zip` when the underlying advisory is exactly GHSA-jmr9-qjv8-65gv and severity remains high. Any new advisory, critical severity, or unrelated high-severity finding fails CI.

Removal criteria: remove the exception as soon as a compatible `whatsapp-web.js` release adopts a Puppeteer version that no longer depends on the vulnerable `extract-zip` path. Dependabot and scheduled scans are expected to surface that upgrade.

Separately fixable transitive findings are not excepted. `basic-ftp`, `brace-expansion`, and `js-yaml` are pinned through npm overrides to patched maintenance releases.
