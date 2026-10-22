# Repository development instructions

## Product and scope

This is a breach-intelligence platform for authorized cybersecurity analysts. Read `docs/PRODUCT.md`, `docs/DEVELOPMENT.md`, `docs/OPERATIONS.md`, and `SECURITY.md` before changing behavior. The maintenance preview is a single-operator foundation; do not claim that paid access, tenant isolation, source acquisition, or production readiness is implemented.

## Workflow

1. Inspect the branch, working tree, current requirements, and existing tests. Preserve unrelated work.
2. Define observable acceptance criteria and the smallest maintainable change. Record API/schema compatibility changes.
3. Use the runtime in `.nvmrc`, `npm ci --ignore-scripts`, and repository-native TypeScript modules. Verify current versions from primary sources before updates.
4. Use synthetic fixtures for default CI. The owner explicitly authorizes the inherited sample.jsonl for isolated corpus compatibility/performance testing; preserve its original bytes, keep all services loopback/private, and report aggregate results only. Do not query live breach services, acquire additional datasets, or print record/credential values.
5. Run `npm run check` and the relevant bootstrap/container checks. Review the full diff, including dependency and schema changes. State any check that could not run.
6. Update product/API/operations documentation and the changelog. Prepare a reviewable pull request. Merge and deployment require owner authorization.

## Security and compatibility

- Validate input, bound requests, and complete error responses. Preserve authentication on all data routes.
- Never accept API credentials in URLs, user-agent strings, or untrusted proxy headers.
- Do not introduce password material, raw source lines, operator tokens, or customer records into new output, fixtures, logs, or Git artifacts. The byte-preserved inherited sample.jsonl is an explicit owner-authorized exception at its existing path; use it only through the isolated opt-in corpus workflow.
- Preserve Apache-2.0 licensing and upstream attribution. Do not invent ownership of upstream code or datasets.
- Do not re-enable the old wallet/export worker. A new paid service needs the identity, scope, ledger, webhook, and evidence gates in `docs/PRODUCT.md`.
- Never attach or upgrade an existing production index by default. Use a backed-up staging copy and a documented restore path.
- Do not change repository administration settings or advertise them as enforced merely because corresponding files exist.
