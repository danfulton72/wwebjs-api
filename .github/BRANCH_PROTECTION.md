# Main branch protection

The `main` branch should require pull requests and the engineering-quality status checks before merge.

Required checks:

- `Quality / Validate`
- `Quality / Dependency Review`
- `Quality / Container Scan`
- `CodeQL / Analyze JavaScript`
- `Home Assistant / Hassfest`
- `Home Assistant / HACS`

Recommended repository rules:

- Require a pull request before merging.
- Require at least one approving review for non-owner contributions.
- Dismiss stale approvals when new commits are pushed.
- Require conversation resolution before merging.
- Require branches to be up to date before merging.
- Block force pushes and branch deletion.
- Do not allow required checks to be bypassed.

This file documents the intended repository rule configuration; the repository rules themselves must be enabled in GitHub settings or through an authorized branch-protection/ruleset API.
