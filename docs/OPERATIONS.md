# Operations and deployment

This maintenance preview is the private, single-operator foundation for the
[professional breach-intelligence product](PRODUCT.md). Its stack is a single-host
starting point: one application, one Solr node,
and one ZooKeeper node. It has persistent storage but no high availability. The
application is published only on the host's loopback interface. Database and
coordination ports remain inside an isolated Docker network.

## Start locally

Install Docker Engine/Desktop with Compose v2. On Windows, run the shell wrapper
from WSL or Git Bash with Docker Desktop integration enabled.

```bash
bash run.sh
```

The wrapper creates `.env` with a random 256-bit token when no token or `.env`
already exists. It never overwrites that file or prints its token. Open
`http://127.0.0.1:3000` and use browser username `operator`, with the value of
`API_TOKEN` as the password. Keep `.env` private; it is ignored by Git.

For the two fictional demonstration records:

```bash
bash run.sh --sample
```

Repeated sample imports update the same fixed IDs. They do not clear a collection.
An empty new collection without samples is normal. The default importer imports
only the two fictional fixtures. The inherited 75,739-record `sample.jsonl` remains
available for a separate [opt-in local corpus test](CORPUS-TESTING.md).

The equivalent manual sequence, after setting `API_TOKEN` in `.env` or your shell,
is:

```bash
docker compose config --quiet
docker compose up -d --wait --wait-timeout 180 solr
docker compose run --rm bootstrap
docker compose up -d --build --wait --wait-timeout 120 web
```

`docker compose up` alone does not initialize the schema. Run the bootstrap before
starting the application on a new volume. `.env.example` lists the supported local
settings. Changing `WEB_PORT` changes the host port only. `SOLR_HEAP` defaults to
512 MB; increase it only after measuring your own indexing/query workload. Leave
memory available for the JVM's other allocations, the file cache, ZooKeeper, and
the application.

For a second independent checkout or test environment, set a unique
`COMPOSE_PROJECT_NAME` and `WEB_PORT` before starting. The default project name is
`zero-trust-search`; reusing it intentionally shares the same named volumes and
services on that Docker host. CI uses its own `search-ci` project.

## Health and ordinary maintenance

```bash
docker compose ps
docker compose logs --tail=100 web solr zookeeper
curl --fail http://127.0.0.1:3000/health/live
curl --fail http://127.0.0.1:3000/health/ready
```

Liveness checks the application process. Readiness also checks the configured Solr
collection and fails when it is unavailable. Responses contain no index data or
credentials. Treat database logs as sensitive because a backend may log query
details; do not attach raw logs or real records to public issues.

```bash
docker compose stop
docker compose start
```

The named `solr_data_v2`, `zookeeper_data_v2`, and `zookeeper_log_v2` volumes survive
container recreation. `docker compose down` also retains these named volumes.
Do not use volume-removal flags for normal maintenance. A restart is not a backup.

## Schema and authorized data

`solr/fields.json` defines explicit fields and `solr/field-types.json` defines the
identifier analyzer. `scripts/bootstrap-solr.mjs` creates a
dedicated configset, a one-shard/one-replica collection, and the missing fields. It
disables automatic field creation and then verifies that the collection can be
queried. A second run makes no schema changes.

Bootstrap refuses incompatible field definitions, a legacy configset, or a configset
shared with another collection. It never replaces a field, drops a collection,
deletes records, or silently changes the representation of existing data. A
failure requires a reviewed migration, not repeated retries with error suppression.
The fresh schema intentionally has no password/credential field. The analyst
metadata fields `breachName`, `breachDate` (a `YYYY-MM-DD` string),
`sourceReference`, `dataClasses` (an array of strings), and `credentialExposure`
(a boolean) describe operator-supplied breach context. Operators are responsible
for reviewing the source and accuracy; the application does not independently
verify those declarations. Exposure metadata does not contain passwords and is
never inferred from a populated field name.

Email addresses and domains use a keyword tokenizer with lowercase normalization:
the full identifier matches without case sensitivity, while fragments do not.
Usernames use exact, case-sensitive string matching. The old `text_general` email
schema does not provide these semantics. Bootstrap refuses that incompatible field
type; reindex into a fresh collection instead of changing an existing index in place.
The two demonstration records refer to a fictional breach, use reserved
`example.invalid` addresses, and explicitly declare no credential exposure.

Use `samples/sample.json` as the format reference. IDs must be stable and unique.
Fields marked `multiValued` accept JSON arrays; keep latitude and longitude within
their geographic ranges. Confirm the source is authorized, minimize retained
personal data, and establish retention and deletion procedures before import.

For a reviewed JSON array on the host, upload through the internal Solr container:

```bash
docker compose exec -T solr curl --fail --silent --show-error \
  -H 'Content-Type: application/json' --data-binary @- \
  'http://localhost:8983/solr/BigData/update?commit=true' < '/path/to/authorized.json'
```

This is an administrator operation, not a public application endpoint. Begin with
a small synthetic or otherwise authorized batch and verify fields and counts before
a large import. The sample importer and smoke suite use only fictional records. Disabling
automatic field creation does not remove the default configset's dynamic-field
definitions; a production ingestion service must enforce its own approved field
allowlist, types, provenance, and retention rules before indexing.

## Verification

The [inherited-corpus procedure](CORPUS-TESTING.md) documents the separate opt-in
75,739-record compatibility run, its explicit projection, and its aggregate results.
It is not part of the synthetic CI job.

Run bootstrap/client regression tests with Node.js 24.22.1:

```bash
node --test scripts/*.test.mjs
```

On a synthetic test stack, set the same `API_TOKEN` in the shell used by the smoke
test, then run:

```bash
bash run.sh --sample
docker compose run --rm bootstrap
node scripts/smoke.mjs
docker compose up -d --force-recreate --wait --wait-timeout 180 zookeeper solr
docker compose up -d --wait --wait-timeout 120 web
node scripts/smoke.mjs
```

These checks cover a second bootstrap pass, authentication, search, record lookup,
spatial input validation, HTML responses, and persistence through backend container
recreation with the same named volumes.
CI runs this sequence on a fresh project. Never point a smoke test at a live customer
collection. `APP_URL` can override the test's default `http://127.0.0.1:3000`.

## Version policy and the Solr 10 migration

Verified on October 22, 2026:

| Component | Default | Reason |
| --- | --- | --- |
| Node.js | 24.22.1, Debian Bookworm slim | Patched supported LTS; compile TypeScript during the build. |
| Apache Solr | 9.11.0 slim | Current final 9.x maintenance release; preserves the legacy major version while migrating the application and schema workflow. |
| Apache ZooKeeper | 3.9.6 | Current 3.9 release; explicitly versioned and persisted. |

Images use a tag plus a verified manifest digest. Dependabot updates the container
definitions; review both version and digest changes together. Apache lists Solr
10.0.0 as the current major release and keeps the previous major line eligible for
critical fixes. Solr 9.11 is an intentional compatibility step, not a claim that it
is the newest major release.

When updating Node, also align the short-lived token-generator image in `run.sh`
with the Dockerfile and Compose tool image. That shell reference is reviewed
manually; a Dependabot change to a Dockerfile does not automatically rewrite it.

The old Compose file had no declared persistent volumes and exposed Solr and
ZooKeeper ports on all interfaces. Do not assume that old container writable layers
contain no data. Inventory and back them up before removing any old container. The
new `_v2` volume names prevent this setup from silently reusing a historical index.

For any existing 9.2.1 deployment, record the exact image, schema/configset,
collection/shard configuration, document counts, data location, and recovery method.
Restore a copy into a separate environment and validate the 9.x upgrade before
cutover. A successful fresh-install test does not prove an existing large index can
be upgraded in place.

Move to Solr 10 in a separate migration:

1. Read all intervening Solr 9.x and 10.0 upgrade notes and identify changed/removed
   configuration and query options. Solr 10 requires Java 21 or newer.
2. Back up the current collection, configsets, ZooKeeper metadata, and the exact
   application build. Restore and query that backup in isolation.
3. Create a fresh Solr 10 test collection using a reviewed schema. Reindex from the
   authorized source data when needed; compare counts, known queries, geographic
   behavior, latency, and disk/memory use.
4. Test failure recovery and cut over only after the application and import checks
   pass. Retain the old environment and backup until the agreed rollback window
   ends. Do not point an older Solr image at a volume already upgraded by a newer
   major release.

Solr 9.10+ protects against lower-version nodes rejoining an upgraded cluster.
Do not disable that protection to force a rollback; restore the prior complete
environment and compatible backup instead.

## Before shared or production use

The shared operator token is suitable for a private local instance. Shared
deployments need an authenticated HTTPS gateway or individual user identity,
authorization rules, token rotation, and access logging without record contents or
credentials. Configure trusted proxy addresses explicitly if a reverse proxy is
introduced; do not trust arbitrary forwarded-IP headers.

Keep the internal network and avoid publishing Solr or ZooKeeper. A compromised
application container on the backend network can still reach Solr administration;
production defense in depth requires Solr authentication/authorization, scoped
application credentials, and ZooKeeper access controls. These require an operator
specific secret and identity design and are not claimed by this local Compose file.

For resilient production use, deploy Solr replicas and an odd-numbered ZooKeeper
ensemble across independent failure domains. Four Solr containers on one host do
not protect against loss of that host. Choose capacity and replicas from measured
requirements instead of copying the old four-node layout.

Define recovery-point and recovery-time objectives. Use the Solr collection backup
API with an appropriate backup repository and retain configset/ZooKeeper backups,
or take coordinated snapshots while all writers and services are stopped. Copy
backups off-host, encrypt them, apply retention, and prove restoration into a fresh
isolated stack. A live uncoordinated copy of index or ZooKeeper files is not a
verified recovery procedure.

## Primary references

- [Node.js 24.22.1 release](https://nodejs.org/en/blog/release/v24.22.1)
- [Apache Solr downloads and support policy](https://solr.apache.org/downloads.html)
- [Solr 9.11 Docker deployment](https://solr.apache.org/guide/solr/9_11/deployment-guide/solr-in-docker.html)
- [Solr Schema API](https://solr.apache.org/guide/solr/9_11/indexing-guide/schema-api.html)
- [Solr Configsets API](https://solr.apache.org/guide/solr/9_11/configuration-guide/configsets-api.html)
- [Solr 9.x upgrade notes](https://solr.apache.org/guide/solr/9_11/upgrade-notes/solr-upgrade-notes.html)
- [Major changes in Solr 10](https://solr.apache.org/guide/solr/latest/upgrade-notes/major-changes-in-solr-10.html)
- [ZooKeeper current releases](https://zookeeper.apache.org/releases/)
- [Solr ZooKeeper ensemble guidance](https://solr.apache.org/guide/solr/9_11/deployment-guide/zookeeper-ensemble.html)
