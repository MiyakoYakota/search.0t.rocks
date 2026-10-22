# Contributing

Use a short-lived branch and a pull request for code, dependency, schema, and deployment changes. Keep each pull request focused on one outcome. Explain the original problem, the resulting behavior, the checks run, and any migration or rollback requirements.

The product serves authorized cybersecurity analysts, investigators, and law-enforcement users investigating breach exposure. Treat customer identity, tenant boundaries, search audit trails, and subscription enforcement as explicit acceptance criteria when developing the paid service; the current shared operator login is a private development foundation.

## Before changing code

1. Read the [development workflow](docs/DEVELOPMENT.md), [operations guide](docs/OPERATIONS.md), and [security policy](SECURITY.md).
2. Inspect `git status` and preserve unrelated work. Start from the latest `main` and record the base commit.
3. Define observable acceptance criteria. For a bug, capture a minimal reproduction using synthetic records.
4. Identify compatibility risks before updating Node, Express, TypeScript, Solr, or a container base image.

## Local checks

Use the Node version in `.nvmrc`. From `dataapp`:

```sh
npm ci --ignore-scripts
npm run check
npm audit --audit-level=high
```

`npm run check` performs strict TypeScript checking, browser JavaScript syntax checks, regression tests, and a production JavaScript build. Add tests for externally observable behavior and failure handling. Avoid tests that only duplicate implementation details. Changes affecting schema, imports, Docker, or Solr integration also require the container smoke test described in the operations guide.

Do not commit `.env`, API tokens, logs containing search terms, database volumes, exports, or additional real personal data. New fixtures and default CI must be clearly synthetic and use reserved domains such as `example.invalid`.

The owner has explicitly authorized the inherited `sample.jsonl` for an opt-in local corpus test. Preserve its original bytes and use the isolated procedure in [CORPUS-TESTING.md](docs/CORPUS-TESTING.md). Keep raw values out of terminal output, reports, new artifacts, and GitHub Actions. Aggregate transformation/rejection accounting and a preserved-file hash are required. This exception does not authorize new data acquisition or third-party transmission.

## Review and delivery

The CI checks must pass before merge. Review the complete diff, including the lockfile and generated configuration. Keep the Apache-2.0 license and upstream attribution. A maintainer must authorize merge and any deployment; passing checks does not deploy the application.

Major database upgrades require a separate migration plan, backup, restore rehearsal, and staging validation. An older container image may not be able to read a newer index. Do not treat an image downgrade as a database rollback.

GitHub Issues was disabled at the October 22, 2026 audit. The included issue form is ready for use if the owner enables Issues; it does not change that repository setting. Report security problems only through the route described in `SECURITY.md`.
