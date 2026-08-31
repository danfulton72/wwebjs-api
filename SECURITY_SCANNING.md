# Security scanning

The repository uses layered security checks:

- npm production dependency audit on pull requests, release tags and a weekly schedule;
- GitHub Dependency Review for newly introduced vulnerable dependencies;
- CodeQL JavaScript/TypeScript analysis on pull requests, `main` and a weekly schedule;
- Trivy image scanning for high/critical container vulnerabilities on pull requests and a weekly schedule;
- CycloneDX SBOM generation for both the npm application dependency graph and the built container image.

All GitHub Actions references are pinned to immutable commit SHAs and are updated through reviewed dependency pull requests.
