# Development and delivery workflow

This repository uses a small, reproducible pipeline: a locked dependency install, a strict TypeScript build, regression tests, dependency advisory checks, and an isolated Docker/Solr smoke test. A successful pull request prepares a change for maintainer review; it does not merge, publish a release, or deploy a service.

The product direction is a paid breach-intelligence service for authorized cybersecurity analysts, investigators, and law-enforcement users. This prerelease supplies the private search and deployment foundation. Its shared operator token does not provide customer accounts, tenant isolation, subscription enforcement, billing, or a defensible usage ledger. Those capabilities require a reviewed multiuser implementation before selling hosted access. The retired wallet and export callbacks must not be re-enabled as a shortcut to charging users.

## Supported toolchain

The baseline was verified on October 22, 2026 against official release information and the npm registry.

| Component | Baseline | Decision |
| --- | --- | --- |
| Node.js | 24.22.1 LTS | Current security release on the supported Node 24 line; production and CI use the same patch. |
| npm | Bundled with Node 24.22.1; compatible major 11 or 12 | `npm ci` installs the committed lockfile; no global package manager is required. |
| Express | 5.3.0 | Current stable release; async route failures flow to error middleware. |
| TypeScript | 7.0.2 | Current stable compiler; invoked through its CLI with strict checking. |
| Mustache | 4.2.0 | Current published release; escaped template output remains the default. |
| Type declarations | Express 5.0.6, Mustache 4.2.6, Node 24.19.2 | Development-only packages; Node declaration package versions do not track runtime patch numbers. |

Node 26 was still the Current release line at this audit date. It is not required for this application and is outside the tested runtime range. TypeScript 7 is the native compiler; the project does not depend on its compiler API. Tools that require the old TypeScript API need a compatibility review before adoption.

Sources: [Node 24.22.1 release](https://nodejs.org/en/blog/release/v24.22.1), [Node support schedule](https://github.com/nodejs/Release#release-schedule), [Express support](https://expressjs.com/en/support/), [Express 5 migration](https://expressjs.com/en/guide/migrating-5/), [TypeScript 7 release](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), and the npm registry metadata for [Express](https://registry.npmjs.org/express/latest), [TypeScript](https://registry.npmjs.org/typescript/latest), and [Mustache](https://registry.npmjs.org/mustache/latest). Registry `latest` links change over time; the lockfile records the audited versions.

## Local development

```sh
# Repository root; use nvm if it is installed, or install the version in .nvmrc.
nvm install
nvm use
cd dataapp
npm ci --ignore-scripts
npm run check
```

`npm start` runs `dist/index.js`. Build before starting. Runtime assets are loaded from the application root, so Docker copies both `dist` and the `templates`/`static` directories. The application intentionally refuses missing or invalid credentials.

`npm start` and `npm run dev` inherit exported environment variables; they do **not** automatically load the repository-root `.env`. To use that file explicitly, configure it for native execution and run from `dataapp`:

```sh
node --env-file=../.env dist/index.js
```

Set `SOLR_URL` to a Solr endpoint reachable from the host and `SOLR_COLLECTION` to the initialized collection. The Compose hostname `solr` is internal to Docker, and the supplied Compose stack does not publish its database port. Native development therefore needs a separately reachable local test backend; use the Compose application when working with the default isolated stack. Keep native `HOST` on loopback and choose an unused `PORT` if the Compose application is also running. The operations guide describes the container workflow.

For active development with exported settings, run `npm run watch` in one terminal and `npm run dev` in another. The first command recompiles TypeScript; the second builds once and restarts Node when the compiled output changes. For the explicit `.env` workflow, use `node --env-file=../.env --watch dist/index.js` in the second terminal after the initial build. `npm run clean` removes only generated `dist` and `dist-test` directories.

The unit/regression tests use Node's built-in test runner, local HTTP servers, and synthetic Solr responses. They do not need a live database or operator records. A unit test pass establishes application behavior against those fixtures; it does not establish database or production readiness.

### Authorized inherited-corpus testing

The repository owner has explicitly authorized the existing `sample.jsonl` for a separate, opt-in compatibility and performance test. Follow [CORPUS-TESTING.md](CORPUS-TESTING.md) for its isolated procedure. Preserve the original file byte for byte and verify its hash; use loopback services and a separate collection. Account for every input record and any field transformations or rejections. Report aggregate counts, timings, and validation results only. Do not print identifiers, credentials, raw records, upstream response bodies, or logs that could contain them.

This authorization covers the inherited file already present in the repository. It does not authorize acquiring another dataset or sending records to an external service. Keep default tests, newly committed fixtures, and GitHub Actions synthetic. The inherited corpus must not become a CI input, cache, uploaded artifact, or diagnostic attachment.

## Delivery stages

| Stage | Required work | Exit condition |
| --- | --- | --- |
| Triage | Reproduce the bug or define the maintenance goal; record affected endpoints and versions. | Concrete acceptance criteria and risk assessment. |
| Branch | Create one focused branch from current `main`; inspect local changes first. | Clean ownership of the intended diff. |
| Implement | Use typed modules, bounded upstream requests, validated configuration, and synthetic fixtures. | Behavior matches acceptance criteria; errors have explicit responses. |
| Verify | Run `npm ci`, `npm run check`, `npm audit`, and relevant container smoke checks. | Successful logs for the actual commit; unavailable checks are stated. |
| Review | Inspect the full diff and lockfile; explain compatibility, security, operations, and rollback. | Maintainer accepts a concrete pull request. |
| Stage | Restore a backup into an isolated environment for stateful changes; validate representative data and access controls. | Rehearsed migration and rollback without changing production. |
| Release | Record commit, image digest, configuration changes, migrations, and known limitations. | Explicit maintainer authorization to merge or deploy. |
| Observe | Check readiness, errors, latency, resource use, and restore ability. | Service behaves as expected; rollback remains available. |

Use a small active backlog. Prefer at most five open dependency update PRs across the configured ecosystems and remove merged working branches after confirming they are no longer needed. Do not delete unmerged branches just to meet a quota.

## GitHub Actions

`.github/workflows/ci.yml` runs on pull requests, pushes to `main`, and manual dispatch. It uses read-only repository permissions, does not receive deployment secrets, and disables checkout credential persistence. Third-party actions are pinned to full commit SHAs; Dependabot can update those pins.

The application job runs the same locked install, typecheck, browser JavaScript syntax checks, regression tests, build, and advisory check on Ubuntu 24.04 and Windows 2025 with Node 24.22.1. This matrix is configured coverage, not proof of a successful Windows run until GitHub reports it for a commit. Syntax checks do not replace browser interaction or accessibility review.

The container job validates Compose and exercises a synthetic collection through the deployment entry point. Diagnostic logs are bounded. Cleanup stops the isolated CI services without deleting named volumes. No workflow deploys to a live environment or invokes `pull_request_target` with contributor code.

Action pins verified from official Git refs on the audit date:

- `actions/checkout` v7.0.1: `3d3c42e5aac5ba805825da76410c181273ba90b1`
- `actions/setup-node` v7.1.0: `949feb2413d6458794dcd2491c4babbbce0c15c1`

GitHub references: [hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [setup-node](https://github.com/actions/setup-node), and [Dependabot supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories).

## Repository settings to apply separately

Files in this change do not configure GitHub rulesets or turn on repository features. The owner should review these settings after the first CI run supplies valid check names:

1. Protect `main` from force pushes and deletion; require pull requests.
2. Require `Application (ubuntu-24.04)`, `Application (windows-2025)`, and `Container integration` checks on the latest commit before merging.
3. Require resolved review conversations. Require an independent approval and CODEOWNERS review when another reviewer is available; a sole owner cannot approve their own PR.
4. Enable Dependabot alerts and security updates, and private vulnerability reporting if available. Confirm the reporting link works before advertising it.
5. Enable Issues only if the maintainer intends to operate a public bug queue. The supplied form then becomes usable.

Do not describe protections as enforced until the actual repository settings have been verified. Maintainer bypasses, if needed for emergency recovery, should be narrow and documented in the release record.

## Dependency maintenance

Dependabot checks npm, Dockerfile images, Compose images, and GitHub Actions weekly. Minor/patch npm changes are grouped by runtime versus development use; major changes remain separate for compatibility review. Total configured open-update limits are five. A vulnerable dependency requires a reproducer or advisory assessment, the smallest supported update or removal, and regression tests for the affected behavior. Do not use `npm audit fix --force` as an unattended release strategy.

When updating Node, keep `.nvmrc`, the package engine range, and Docker image consistent. Update image tags and digests together after verifying the official registry manifest. Refresh the lockfile with the intended Node/npm toolchain and review the resulting tree. The advisory check reports known registry advisories at the time it runs; it is not a complete security assessment.

Solr and ZooKeeper updates additionally follow the operations guide. A major Solr upgrade is a migration project with its own staged restore and reindex validation, not a routine image substitution.
