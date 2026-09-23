# Security exceptions

## whatsapp-web.js / Puppeteer browser extraction

The current upstream `whatsapp-web.js` release (1.34.7) depends on Puppeteer 24, whose browser installer reaches `extract-zip@2.0.1`. npm and Trivy report GHSA-jmr9-qjv8-65gv for that extraction path.

Trivy currently reports `2.0.2` as the fixed version, but npm publishes `2.0.1` as the latest `extract-zip` release and has no `2.0.2` version. Because the reported fixed package cannot be installed, this is maintained as a narrow, temporary upstream exception rather than an invalid dependency override.

The npm production audit gate provides the package/path scope: it only permits the dependency chain `whatsapp-web.js -> puppeteer -> puppeteer-core/@puppeteer/browsers -> extract-zip` when the underlying advisory is exactly GHSA-jmr9-qjv8-65gv and severity remains high. Trivy separately suppresses only that exact advisory ID in `.trivyignore.yaml`; the exception expires on 2026-11-29. This advisory-level Trivy rule is intentionally scan-mode portable, while the npm gate independently constrains which package chain may use it. Any new advisory, critical severity, unrelated high-severity finding, or expired exception fails CI.

Removal criteria: remove the exception as soon as a compatible upstream dependency no longer uses the affected `extract-zip` path, or earlier if a real patched npm release becomes available. Dependabot and scheduled scans are expected to surface that change.

Separately fixable transitive findings are not excepted. `basic-ftp`, `brace-expansion`, and `js-yaml` are pinned through npm overrides to patched maintenance releases.
