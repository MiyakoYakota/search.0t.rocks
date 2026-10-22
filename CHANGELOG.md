# Changelog

## 2.0.0-dev.0 — unreleased maintenance preview (2026-10-22)

### Product direction

- Define the restricted paid breach-intelligence product for cybersecurity analysts, investigators, and law enforcement.
- Separate the tested operator preview from future vetted identities, MFA, investigation scopes, auditing, paid entitlements, and controlled evidence exports.

### Changed

- Move to Node 24.22.1 LTS, Express 5.3.0, and TypeScript 7.0.2 with locked dependencies and compiled production output.
- Split the application into typed configuration, authentication, query, transport, and route modules.
- Replace legacy browser/CDN dependencies with responsive local assets and escaped templates.
- Use a private persistent Solr 9.11.0 / ZooKeeper 3.9.6 stack and explicit idempotent bootstrap.
- Add whole-identifier email/domain search, bounded pagination, and declared breach metadata.

### Fixed

- Broken quickstart/setup quoting and ignored operator input, incomplete responses, invalid input handling, incorrect postal-code exclusion, and false zero-result responses on backend failure.
- Unauthenticated wallet/export callback exposure, spoofable user-agent/proxy identity, unbounded requests, and unsafe output fields.
- Reproducibility, runtime dependency/license inconsistencies, missing CI, dependency maintenance, and security documentation.

### Removed from the current preview

- Old credit/export worker and callbacks, automatic related-record expansion, former operator payment/policy pages, and unrelated correspondence. History is preserved; commercial replacement features are tracked in the product plan.

### Added

- Application, transport, bootstrap, and synthetic integration tests; readiness/liveness; failure and restart checks.
- An explicit isolated testing path for the owner's retained 75,739-record corpus; no source-data modification or record-value reporting.
- SHA-pinned read-only CI, Dependabot, CODEOWNERS, contribution templates, operational/migration guidance, API reference, and an audit record.

This is not a published production release. See [migration notes](docs/MIGRATION.md) before using it with an existing installation.
