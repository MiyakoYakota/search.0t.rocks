# Opt-in inherited-corpus validation

The repository retains the original `sample.jsonl`: **75,739 records and 12,208,094 bytes**. The owner explicitly requested that these records be used for testing. This procedure exercises every row in a separate local index, preserves the source bytes, and reports aggregate compatibility and latency results. Default CI and `bash run.sh --sample` continue to use the two fictional fixtures.

The complete local run on October 22, 2026 **passed**. Its [aggregate JSON report](corpus-validation-2026-10-22.json) contains counts, schema field names, the whole-file checksum, and timings. It contains no source records, original IDs, identifier values, credential values, or query strings.

## What the test proves

`scripts/test-corpus.mjs --allow-sensitive-corpus` reads all source rows twice. The first pass measures shapes and computes a validated projection; the second imports the same projection in batches of at most 200 documents and 1 MiB. Both passes must have identical row counts and projection accounting. The committed Solr document count must equal 75,739.

The test verifies the current application's display-allowed projection of this corpus. It does **not** establish unchanged compatibility with every historical raw field or validate the provenance of individual records. Original IDs are replaced with unique per-row test IDs. Supported display values remain actual source values, subject to the explicitly counted normalization below; they are not replaced with fabricated email addresses or usernames. Password fields and raw source lines remain in the original file and are never sent to the test index. No credential-exposure assertion is inferred from those fields.

For every source field, both accounting identities must hold:

```text
input values = indexed values + deliberately omitted values + rejected values
field occurrences = indexed occurrences + deliberately omitted occurrences + rejected occurrences
```

A rejected array member is counted as a rejected value even when other members of that field are indexed. An empty array has zero input values and one terminal field-occurrence disposition. Unknown input property names are reported in one fixed bucket; their names are never copied into reports.

The harness independently derives expected identifier hit counts from all projected rows, deduplicating repeated identical values within each row. It chooses 64 distinct emails and 64 distinct usernames deterministically by the smallest SHA-256 fingerprints and checks original, case-altered, and fragment queries through the authenticated HTTP application. It checks both exact total counts and the returned record's actual identifier field. Record-read checks use 101 generated IDs spread through the source and compare every projected field returned by the application. Timing measurements include the local application and HTTP client.

## Results from the full run

| Check | Result |
| --- | --- |
| Physical / parsed rows | 75,739 / 75,739 |
| Blank / rejected rows | 0 / 0 |
| Imported / committed documents | 75,739 / 75,739 |
| Batches | 379 |
| Duplicate / invalid original IDs | 0 / 0 |
| Source bytes before and after | Unchanged; checksum below |
| Record reads | 101; 407 field comparisons; 0 mismatches |
| Email exact / case / fragment checks | 64 / 64 / 64, all passed |
| Username exact / case / fragment checks | 64 / 63 / 64, all passed |
| Authentication | Bearer and Basic passed; missing/wrong tokens denied |
| Inventory / import including final commit | 0.88 s / 4.32 s |

| Local sequential operation | Samples | p50 | p95 |
| --- | ---: | ---: | ---: |
| Record read by generated ID | 101 | 3.03 ms | 4.72 ms |
| Email query, including case/fragment variants | 192 | 2.08 ms | 4.53 ms |
| Username query, including case/fragment variants | 191 | 1.69 ms | 2.97 ms |

These are observations from one local Node.js 24.22.1 process and one Solr 9.11.0 instance with a 512 MiB heap, using sequential requests after import. They are not a production capacity, concurrency, cold-cache, or availability benchmark. The native test instance uses the ZooKeeper bundled with the Solr archive; the deployment configuration separately pins ZooKeeper 3.9.6. Docker image builds and container-volume persistence are tested by the synthetic CI integration job, not by this native corpus run.

There are **63,777 distinct indexed email identifiers** and **16,649 distinct indexed usernames**. This corpus has no `domain` field, so domain coverage comes from the separate synthetic smoke suite. Case-folding checks sample ASCII emails/domains to avoid pretending JavaScript and Lucene have identical Unicode case mappings; one non-ASCII email identifier was indexed but excluded from that case-fold sample. Usernames retain exact case-sensitive matching. This is sampled query accuracy over the complete index, not an exhaustive query of every distinct identifier.

## Projection and loss accounting

All 75,739 rows are represented in the test index. **485 projected documents contain only their generated test ID**, because those rows have no retained display-allowed values. They remain in the record count and are explicitly accounted for; they do not become useful searchable records merely because the import succeeds.

- 75,739 original IDs were omitted and replaced with distinct generated test IDs.
- 74,460 scalar field occurrences were wrapped in arrays to match the explicit multivalued schema.
- 63 strings had surrounding whitespace removed.
- 44 blank strings were rejected: 37 phone-number values, five usernames, one last name, and one state.
- 18,981 password values across 15,877 rows were deliberately omitted from the test index.
- 21,847 historical search-alias fields (`address_search` and `city_search`) were omitted because they are not in the current schema.
- 30,022 field occurrences for gender, ethnicity, income, links, photos, notes, and party were omitted because the application does not expose those fields.

Other invalid scalar types, out-of-range integers, control characters, excessive string lengths, incompatible scalar cardinality, invalid coordinates, and invalid breach metadata would be counted and rejected by the projection. There were no such additional rejections in this run. Valid numeric zero and boolean false are preserved; synthetic projection tests enforce those cases.

The following table provides the complete field accounting. “Omitted” includes original IDs and deliberate field exclusions; “rejected” records invalid values rather than intentional exclusions. Array bounds describe the original input.

| Field | Source occurrences | Input shapes | Array length | Input values | Indexed values | Omitted values | Rejected values |
| --- | ---: | --- | --- | ---: | ---: | ---: | ---: |
| `VRN` | 1,999 | array: 1,999 | 1–44 | 4,933 | 4,933 | 0 | 0 |
| `address` | 8,577 | string: 8,577 | — | 8,577 | 8,577 | 0 | 0 |
| `address_search` | 8,577 | string: 8,577 | — | 8,577 | 0 | 8,577 | 0 |
| `autoBody` | 774 | string: 774 | — | 774 | 774 | 0 | 0 |
| `autoClass` | 774 | string: 774 | — | 774 | 774 | 0 | 0 |
| `autoMake` | 2,416 | string: 2,416 | — | 2,416 | 2,416 | 0 | 0 |
| `autoModel` | 2,400 | string: 2,400 | — | 2,400 | 2,400 | 0 | 0 |
| `autoYear` | 2,474 | string: 2,474 | — | 2,474 | 2,474 | 0 | 0 |
| `birthMonth` | 1,847 | string: 1,847 | — | 1,847 | 1,847 | 0 | 0 |
| `birthYear` | 1,850 | string: 1,850 | — | 1,850 | 1,850 | 0 | 0 |
| `birthday` | 657 | string: 657 | — | 657 | 657 | 0 | 0 |
| `city` | 13,457 | string: 13,457 | — | 13,457 | 13,457 | 0 | 0 |
| `city_search` | 13,270 | string: 13,270 | — | 13,270 | 0 | 13,270 | 0 |
| `dob` | 1,404 | array: 1,201, string: 203 | 1–1 | 1,404 | 1,404 | 0 | 0 |
| `emails` | 63,998 | array: 61,998, string: 2,000 | 1–9 | 64,539 | 64,539 | 0 | 0 |
| `ethnicity` | 2,000 | string: 2,000 | — | 2,000 | 0 | 2,000 | 0 |
| `firstName` | 21,404 | string: 21,404 | — | 21,404 | 21,404 | 0 | 0 |
| `gender` | 12,337 | array: 1,363, string: 10,974 | 1–1 | 12,337 | 0 | 12,337 | 0 |
| `id` | 75,739 | string: 75,739 | — | 75,739 | 0 | 75,739 | 0 |
| `income` | 844 | string: 844 | — | 844 | 0 | 844 | 0 |
| `lastName` | 21,177 | string: 21,177 | — | 21,177 | 21,176 | 0 | 1 |
| `latLong` | 2,000 | string: 2,000 | — | 2,000 | 2,000 | 0 | 0 |
| `links` | 9,812 | array: 9,812 | 1–2 | 13,848 | 0 | 13,848 | 0 |
| `location` | 3,014 | string: 3,014 | — | 3,014 | 3,014 | 0 | 0 |
| `middleName` | 2,203 | string: 2,203 | — | 2,203 | 2,203 | 0 | 0 |
| `notes` | 1,000 | array: 1,000 | 0–16 | 4,572 | 0 | 4,572 | 0 |
| `party` | 2,029 | string: 2,029 | — | 2,029 | 0 | 2,029 | 0 |
| `passwords` | 15,877 | array: 13,877, string: 2,000 | 1–3 | 18,981 | 0 | 18,981 | 0 |
| `phoneNumbers` | 9,744 | array: 9,744 | 1–9 | 10,209 | 10,172 | 0 | 37 |
| `photos` | 2,000 | array: 2,000 | 1–14 | 2,095 | 0 | 2,095 | 0 |
| `source` | 1,000 | string: 1,000 | — | 1,000 | 1,000 | 0 | 0 |
| `state` | 13,601 | string: 13,601 | — | 13,601 | 13,600 | 0 | 1 |
| `usernames` | 16,628 | array: 16,628 | 1–6 | 16,677 | 16,672 | 0 | 5 |
| `vin` | 2,425 | string: 2,425 | — | 2,425 | 2,425 | 0 | 0 |
| `zipCode` | 7,978 | string: 7,978 | — | 7,978 | 7,978 | 0 | 0 |

## Privacy and isolation requirements

The harness refuses to run without `--allow-sensitive-corpus`, an explicit application token, and literal loopback URLs with explicit ports. Accepted hosts are `127.0.0.1` and `[::1]`; DNS names, credentials in URLs, redirects, query/fragment components, and proxy mode are rejected. It requires a fresh `CorpusValidation` collection on an otherwise empty, single-node loopback SolrCloud instance. An existing collection causes refusal without deleting or clearing it. The normal `BigData` sample stack is separate.

Use the clean, dedicated Solr launch below. Its Log4j configuration has no appenders and a root level of `OFF`; Jetty request logging is disabled before startup. The harness verifies that all reported Log4j logger levels remain `OFF` before import and after testing, and that the stock launch command does not enable the `requestlog` module. This check is designed for this prepared stock Solr instance: it cannot prove that an arbitrary externally customized Jetty server has no additional logging sinks. Do not use an existing instrumented service, APM collector, reverse proxy, packet recorder, or remote Solr for this procedure.

The application has no request-body/query logging. The harness writes only aggregate reports and static failure codes with numeric progress counters, never upstream response bodies or exception stacks. The loopback test index still contains retained personal data and must stay in its private temporary directory. Do not publish that directory, send raw logs to CI, expose the app publicly, or point external browser/preview services at it. Test queries use real retained values only while these logging controls are active; repeated record-read timings use generated IDs.

## Reproduce on a local Linux/WSL host

Prepare Node.js 24.22.1, an already installed and checksum-verified Apache Solr 9.11.0 slim archive, and its supported Java runtime. Build the application before enabling the data test:

```bash
cd dataapp
npm ci --ignore-scripts
npm run build
cd ..
node --test scripts/corpus-projection.test.mjs
```

The dependency installation above is preparatory; the corpus harness itself performs no external network requests or package installation. Set `SOLR_DIST` to the directory containing the verified archive's `bin/solr`, then run these commands from the repository root in a local shell. Choose free loopback ports if 18984/3013 are occupied, updating both processes and URLs consistently. The native Solr launcher is intended to run as a normal local user.

```bash
export SOLR_DIST=/absolute/path/to/solr-9.11.0-slim
umask 077
export CORPUS_RUN=$(mktemp -d "${TMPDIR:-/tmp}/search-corpus.XXXXXX")
mkdir "$CORPUS_RUN/home" "$CORPUS_RUN/logs" "$CORPUS_RUN/pid"
cp "$SOLR_DIST/server/solr/solr.xml" "$CORPUS_RUN/home/"
cp -R "$SOLR_DIST/server/solr/configsets" "$CORPUS_RUN/home/"
cat > "$CORPUS_RUN/log4j2-private.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<Configuration status="OFF"><Appenders/><Loggers><Root level="OFF"/></Loggers></Configuration>
XML

SOLR_JETTY_HOST=127.0.0.1 SOLR_HOST=127.0.0.1 \
  SOLR_REQUESTLOG_ENABLED=false LOG4J_PROPS="$CORPUS_RUN/log4j2-private.xml" \
  SOLR_LOGS_DIR="$CORPUS_RUN/logs" SOLR_PID_DIR="$CORPUS_RUN/pid" \
  "$SOLR_DIST/bin/solr" start -c -f -p 18984 -s "$CORPUS_RUN/home" -m 512m \
  > "$CORPUS_RUN/solr-process.log" 2>&1 &
CORPUS_SOLR_PID=$!

export API_TOKEN=$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
export SOLR_URL=http://127.0.0.1:18984/solr
export SOLR_COLLECTION=CorpusValidation
export APP_URL=http://127.0.0.1:3013
HOST=127.0.0.1 PORT=3013 RATE_LIMIT_MAX=10000 node dataapp/dist/index.js \
  > "$CORPUS_RUN/app-process.log" 2>&1 &
CORPUS_APP_PID=$!
```

Wait for Solr's health endpoint to respond, then run the full test. The application becomes ready after the harness creates the collection. A successful test prints only its aggregate JSON and writes a private report with exclusive-create mode; it refuses to overwrite an existing report file.

```bash
curl --fail --silent --output /dev/null \
  'http://127.0.0.1:18984/solr/admin/info/system?wt=json'
CORPUS_REPORT="$CORPUS_RUN/aggregate-report.json" \
  node scripts/test-corpus.mjs --allow-sensitive-corpus
```

Failure prints a fixed error code, the failed stage, acknowledged imported rows/batches, parsed/rejected row counts where available, and the result of a source checksum recheck. A network failure after a batch was sent can make its outcome uncertain: inspect only aggregate document counts locally, and do not interpret acknowledged-row counters as a guaranteed rollback. The script neither deletes a partial collection nor retries against a pre-existing collection. Diagnose with synthetic fixtures, then use a new private Solr home for a clean retry.

Stop only the processes created by this shell after testing:

```bash
kill "$CORPUS_APP_PID" "$CORPUS_SOLR_PID"
wait "$CORPUS_APP_PID" "$CORPUS_SOLR_PID" || true
unset API_TOKEN
```

The source file is not modified or removed. The private temporary Solr home retains the test index after shutdown; apply your local test-data retention policy to that specific directory. Do not use collection-deletion or volume-removal commands against the normal application stack. Never reuse this intentionally logging-disabled setup for a shared production service.

## Source preservation checksum

The SHA-256 before and after the completed test was:

```text
f302ea3a8cab2461c4b001ab16a30f9be1adbb34745ee8e8c54fc64328c68410
```

The harness pins this checksum and 75,739 expected rows, so changing the inherited corpus requires an explicit review of the test's expectations. Synthetic CI does not open this file. See [operations](OPERATIONS.md) for the normal deployment and [development](DEVELOPMENT.md) for the automated pipeline.
