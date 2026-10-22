# Security policy

This project is being modernized as a breach-intelligence platform for cybersecurity analysts. The current maintenance preview supports a single trusted operator. It is not a released, multi-tenant paid service.

## Supported versions

Security fixes target the latest maintained `main` and its active modernization pull request. The inherited Node 18 / Solr 9.2.1 implementation is unsupported for deployment. There are no commercial support or response-time commitments.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/Legatto2/search.0t.rocks/security/advisories/new) **only if the repository presents an enabled reporting form**. This capability has not been verified as enabled during the October 22, 2026 audit. The maintainer must enable it or publish a monitored private security contact before a public release.

If that form is unavailable, use an existing private contact with the maintainer to request a secure reporting channel. Do not post exploit details in a public issue, pull request, or discussion. A minimal public request to enable private reporting must not contain vulnerability details. Repository Issues is currently disabled as well.

Include the affected commit, component, impact, and a minimal reproduction using synthetic records. The separately authorized inherited-corpus test is an internal validation workflow, not material to include in a vulnerability report. Never send real leaked credentials, customer records, access tokens, or a full database. Ask for a protected transfer channel if an artifact is necessary. Do not test a deployed instance without its operator's authorization.

The missing verified reporting channel is a release blocker, not an instruction to disclose publicly. Adding this file does not enable a GitHub feature or establish a monitored inbox.

## Deployment boundaries

- Keep the default loopback port binding. Remote access requires TLS and an appropriate access gateway.
- Treat the shared operator token as administrative access to the displayed collection. It is not tenant isolation, an analyst account system, or payment authorization.
- Scope any analyst investigation to authorized subjects, clients, and data sources. Establish provenance, retention, correction, deletion, and incident processes before real data is imported.
- Do not expose Solr, ZooKeeper, database administration, or backups to the public network. Container-network isolation is not database authentication or encryption.
- The preview does not return password material, raw source lines, or arbitrary indexed fields. Credential exposure flags and breach metadata are operator-supplied evidence labels, not independently verified findings.
- The historical wallet/export callbacks are disabled. Payment processing requires signed, replay-resistant webhooks, a transactional ledger, tenant entitlements, and independent testing before activation.
- The built-in rate limiter is per process. Multiple replicas require shared enforcement at the gateway or a shared store.
- Do not put identifiers, tokens, or record bodies in application/proxy logs. GET search terms can still remain in browser history; configure infrastructure retention separately.

## Authorized inherited-corpus testing

The owner explicitly requested preserving and using the existing `sample.jsonl` for testing. That authorization applies to this inherited file in an isolated local validation environment; it does not authorize new data acquisition or third-party transmission. Preserve its source bytes and compare its checksum before and after testing. Use a separate collection and loopback-only services, suppress record/query logging, and report aggregate counts, transformation/rejection accounting, correctness checks, and timings. Never copy records, identifiers, passwords, or raw errors into new fixtures, reports, screenshots, or public CI artifacts. Default CI remains synthetic. Follow [CORPUS-TESTING.md](docs/CORPUS-TESTING.md).

## Supply-chain policy

Use the committed npm lockfile and the runtime version in `.nvmrc`. Images and GitHub Actions are pinned; Dependabot proposes updates. Run the regression, integration, and advisory checks for the actual commit. A clean dependency audit reports known advisories at a point in time and is not a security certification.

Major Solr changes require the migration and restore process in [OPERATIONS.md](docs/OPERATIONS.md). Never test an upgrade against the sole copy of a production index.
