# Migration from the inherited application

This preview is a breaking modernization, versioned `2.0.0-dev.0`. Start with a fresh test environment. Nothing in the startup script migrates an existing deployment or authorizes production cutover.

## Preserve the current installation first

1. Record the running application commit, container/image digests, configuration, collection names, schemas, shard/replica topology, volumes, and document counts. The old Compose file does not declare persistent storage, so data may exist in old container writable layers.
2. Back up the index, configsets, ZooKeeper metadata, and authorized source data with a tested method. Rehearse restore separately. Do not run `down -v`, prune volumes, remove old containers, or assume a container can be recreated without losing its contents.
3. Keep old and new Compose projects, ports, and storage separate. The new stack uses a distinct project name and `_v2` volumes; inspect your actual existing names before starting. Set a distinct `COMPOSE_PROJECT_NAME` for independent copies of the new stack.
4. Run the new stack with fictional fixtures. Confirm authentication, precise identifiers, health failures, repeat bootstrap, and persistence before importing anything else.
5. Reindex a reviewed staging dataset into the new schema. Compare representative search results and provenance metadata. Only plan a cutover after reviewing the differences.

## API and product changes

- Node 18, Express 4, runtime `ts-node`, and PM2 are replaced with supported Node 24, Express 5, a strict compiler, and compiled JavaScript.
- API authentication moves from user-agent/query-string conventions to an Authorization header. Browser login uses username `operator` and the configured token. Shared operator login is a preview mechanism, not paid-user authorization.
- Query parameters are allowlisted. Search values are literal, result count and offset are bounded, malformed input fails explicitly, and backend errors no longer become fake empty results.
- Email/domain matching requires the new keyword/lowercase schema. Username matching is exact and case-sensitive. Legacy tokenized fields are incompatible and require a fresh index/reindex.
- Response fields are allowlisted. Passwords, raw source lines, and arbitrary indexed properties are not exposed. The current schema includes optional operator-supplied breach metadata instead.
- Legacy wallet, export, and callback routes return 410. Automatic related-record expansion returns 501. The paid analyst product remains the intended direction; these components must be rebuilt with account, scope, audit, ledger, and webhook controls.
- The browser has no legacy CDN framework, payment UI, external map layers, hardcoded database-size claim, or former operator policies. It uses local assets and authenticated routes.

## Data and schema changes

`scripts/bootstrap-solr.mjs` refuses incompatible fields and legacy/shared configuration. It does not alter or delete an existing index to make a test pass. Treat refusal as a migration requirement. The schema contains explicit fields and identifier types; the fresh setup uses one shard and one replica.

Use the new two-record `samples/sample.json` for ordinary demonstration and CI. The inherited root `sample.jsonl` is preserved unchanged at the owner's explicit request. Its separate opt-in corpus workflow tests compatibility and performance without publishing record values; see [CORPUS-TESTING.md](CORPUS-TESTING.md). Do not treat the inherited file as verified synthetic data, a licensed data service, or a reason to log credentials.

Automatic field creation is disabled, but inherited dynamic-field patterns still exist in the Solr configset. The application response allowlist limits output; it does not make arbitrary administrator imports an approved data-ingestion process. A production importer requires explicit input-field validation, source approval, and retention controls.

## Solr versions and rollback

Solr 9.11.0 is the supported 9.x bridge used by this preview; Solr 10.0.0 is the current major. The [operations guide](OPERATIONS.md) defines the staged Solr 10 migration. A fresh synthetic integration pass does not certify a large legacy index upgrade.

Rollback means restoring the previously verified application, schema, database, and compatible backup together. Do not downgrade a container image against a volume already upgraded by a newer major, and do not bypass Solr's lower-version-node protection. Retain the old environment until the review and rollback window is complete.
