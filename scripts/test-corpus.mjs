/** Explicit, local-only compatibility test for the unchanged inherited corpus. */
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { bootstrap } from './bootstrap-solr.mjs';
import { createSolrClient, isMain } from './solr-client.mjs';
import { createProjectionStats, projectRecord, projectionAccountingMatches, requireLoopbackUrl } from './corpus-projection.mjs';

const EXPECTED_HASH = 'f302ea3a8cab2461c4b001ab16a30f9be1adbb34745ee8e8c54fc64328c68410';
const EXPECTED_ROWS = 75739;
const IDENTIFIER_FIELDS = ['emails', 'domain', 'usernames'];
const SAMPLE_COUNT = 64;
const source = new URL('../sample.jsonl', import.meta.url);
let activeReport;
class CorpusFailure extends Error { constructor(code) { super(code); this.code = code; } }
function check(condition, code) { if (!condition) throw new CorpusFailure(code); }
const fingerprint = (value) => createHash('sha256').update(value).digest('hex');
const canonical = (field, value) => field === 'usernames' ? value : value.toLowerCase();
const identifierKey = (field, value) => fingerprint(canonical(field, value));
async function fileHash() {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(source)) hash.update(chunk);
  return hash.digest('hex');
}
async function eachRecord(visit) {
  const counts = { physicalLines: 0, blankLines: 0, parsedRows: 0, rejectedRows: 0 };
  const lines = createInterface({ input: createReadStream(source), crlfDelay: Infinity });
  for await (const line of lines) {
    counts.physicalLines += 1;
    if (!line.trim()) { counts.blankLines += 1; continue; }
    let record;
    try { record = JSON.parse(line); } catch { counts.rejectedRows += 1; continue; }
    if (!record || typeof record !== 'object' || Array.isArray(record)) { counts.rejectedRows += 1; continue; }
    counts.parsedRows += 1;
    await visit(record, counts.parsedRows);
  }
  return counts;
}
function percentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (percent) => sorted[Math.max(0, Math.ceil(sorted.length * percent) - 1)];
  return { samples: sorted.length, p50Ms: Number(at(0.5).toFixed(2)), p95Ms: Number(at(0.95).toFixed(2)) };
}
function sameValue(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    return JSON.stringify(left.map((item) => JSON.stringify(item)).sort()) === JSON.stringify(right.map((item) => JSON.stringify(item)).sort());
  }
  return left === right;
}
async function loggingIsDisabled(solr) {
  const logging = await solr('admin/info/logging');
  const properties = await solr('admin/info/properties');
  const command = properties['system.properties']?.['sun.java.command'];
  check(Array.isArray(logging.loggers) && logging.loggers.some((entry) => entry.name === 'root' && entry.level === 'OFF')
    && logging.loggers.every((entry) => entry.level === 'OFF'), 'SOLR_LOGGING_MUST_BE_OFF');
  check(typeof command === 'string' && !/requestlog/i.test(command), 'SOLR_REQUEST_LOGGING_MUST_BE_OFF');
}

export async function runCorpusTest(env = process.env, args = process.argv.slice(2)) {
  check(args.length === 1 && args[0] === '--allow-sensitive-corpus', 'EXPLICIT_CORPUS_OPT_IN_REQUIRED');
  check(env.NODE_USE_ENV_PROXY !== '1' && !process.execArgv.some((arg) => arg.includes('use-env-proxy'))
    && !(env.NODE_OPTIONS || '').includes('use-env-proxy'), 'PROXY_MODE_NOT_ALLOWED');
  let solrBase; let appBase;
  try {
    solrBase = requireLoopbackUrl(env.SOLR_URL, 'solr');
    appBase = requireLoopbackUrl(env.APP_URL, 'app');
  } catch { throw new CorpusFailure('LITERAL_LOOPBACK_ENDPOINTS_REQUIRED'); }
  const collection = env.SOLR_COLLECTION || 'CorpusValidation';
  check(/^CorpusValidation(?:_[A-Za-z0-9_-]{1,40})?$/.test(collection), 'ISOLATED_COLLECTION_NAME_REQUIRED');
  check(typeof env.API_TOKEN === 'string' && /^[\x21-\x7e]{32,512}$/.test(env.API_TOKEN), 'TEST_API_TOKEN_REQUIRED');
  const config = { base: solrBase, collection };
  const solr = createSolrClient(config);
  const prefix = encodeURIComponent(collection);
  const report = {
    status: 'running', stage: 'preflight', source: { bytes: (await stat(source)).size, sha256Before: await fileHash() },
    importedRows: 0, completedBatches: 0, projection: createProjectionStats(),
  };
  activeReport = report;
  check(report.source.sha256Before === EXPECTED_HASH, 'CORPUS_SOURCE_HASH_MISMATCH');
  const system = await solr('admin/info/system');
  check(system.mode === 'solrcloud' && system.lucene?.['solr-spec-version'] === '9.11.0', 'EXPECTED_ISOLATED_SOLR_VERSION_REQUIRED');
  await loggingIsDisabled(solr);
  const cluster = await solr('admin/collections', { query: { action: 'CLUSTERSTATUS' } });
  check(!cluster.cluster?.collections?.[collection], 'COLLECTION_ALREADY_EXISTS_NO_CHANGES_MADE');
  // Require a wholly separate Solr instance. Its distributed request destinations must all be loopback.
  check(Object.keys(cluster.cluster?.collections || {}).length === 0, 'EMPTY_ISOLATED_SOLR_REQUIRED');
  check(Array.isArray(cluster.cluster?.live_nodes) && cluster.cluster.live_nodes.length === 1
    && /^(?:127\.0\.0\.1|\[::1\]):\d+_solr$/.test(cluster.cluster.live_nodes[0]), 'LOOPBACK_SINGLE_SOLR_NODE_REQUIRED');
  const require = createRequire(import.meta.url);
  const { DISPLAY_FIELDS } = require('../dataapp/dist/src/solr.js');
  const allowed = new Set(DISPLAY_FIELDS);
  const fields = new Map(JSON.parse(await readFile(new URL('../solr/fields.json', import.meta.url), 'utf8')).map((field) => [field.name, field]));
  const frequencies = new Map(IDENTIFIER_FIELDS.map((field) => [field, new Map()]));
  const candidates = new Map(IDENTIFIER_FIELDS.map((field) => [field, new Map()]));
  const nonAsciiEmailValues = new Set();
  const originalIds = new Set();
  const recordsToRead = new Map();
  let duplicateOriginalIds = 0; let invalidOriginalIds = 0;
  const interval = Math.ceil(EXPECTED_ROWS / 100);
  report.stage = 'inventory';
  const inventoryStart = performance.now();
  report.rows = await eachRecord(async (input, ordinal) => {
    if (typeof input.id === 'string' && input.id.length) {
      const key = fingerprint(input.id);
      if (originalIds.has(key)) duplicateOriginalIds += 1;
      originalIds.add(key);
    } else invalidOriginalIds += 1;
    const doc = projectRecord(input, ordinal, fields, allowed, report.projection);
    if (ordinal === 1 || ordinal === EXPECTED_ROWS || ordinal % interval === 0) recordsToRead.set(doc.id, doc);
    for (const field of IDENTIFIER_FIELDS) {
      const frequency = frequencies.get(field);
      const selected = candidates.get(field);
      const perRecord = new Set();
      for (const value of doc[field] || []) {
        const key = identifierKey(field, value);
        if (!perRecord.has(key)) frequency.set(key, (frequency.get(key) || 0) + 1);
        perRecord.add(key);
        if (value.length > 256) continue; // App query validation has an explicit 256-character bound.
        if (field !== 'usernames' && /[^\x00-\x7f]/.test(value)) { nonAsciiEmailValues.add(key); continue; }
        if (selected.has(key)) continue;
        if (selected.size < SAMPLE_COUNT) selected.set(key, value);
        else {
          const largest = [...selected.keys()].sort().at(-1);
          if (key < largest) { selected.delete(largest); selected.set(key, value); }
        }
      }
    }
  });
  report.inventoryMs = Number((performance.now() - inventoryStart).toFixed(2));
  report.originalIds = { distinct: originalIds.size, duplicateOccurrences: duplicateOriginalIds, invalidOrMissing: invalidOriginalIds, replacedWithUniqueTestIds: report.rows.parsedRows };
  check(projectionAccountingMatches(report.projection), 'PROJECTION_VALUE_ACCOUNTING_FAILED');
  check(report.rows.rejectedRows === 0 && report.rows.parsedRows === EXPECTED_ROWS, 'CORPUS_ROW_ACCOUNTING_FAILED');
  check(await fileHash() === report.source.sha256Before, 'SOURCE_CHANGED_DURING_INVENTORY');
  report.stage = 'bootstrap';
  await bootstrap({ config, request: solr, log: () => {} });
  await loggingIsDisabled(solr);
  const indexedBefore = await solr(`${prefix}/select`, { query: { q: '*:*', rows: '0' } });
  check(indexedBefore.response?.numFound === 0, 'ISOLATED_COLLECTION_MUST_BE_EMPTY');
  report.stage = 'import';
  let batch = []; let batchBytes = 2;
  const projectedAgain = createProjectionStats();
  const importStart = performance.now();
  const flush = async () => {
    if (!batch.length) return;
    await solr(`${prefix}/update`, { body: batch, timeout: 30000 });
    report.importedRows += batch.length;
    report.completedBatches += 1;
    batch = []; batchBytes = 2;
  };
  const secondPass = await eachRecord(async (input, ordinal) => {
    const doc = projectRecord(input, ordinal, fields, allowed, projectedAgain);
    const bytes = Buffer.byteLength(JSON.stringify(doc)) + 1;
    check(bytes <= 1024 * 1024, 'PROJECTED_RECORD_EXCEEDS_BATCH_LIMIT');
    if (batch.length >= 200 || batchBytes + bytes > 1024 * 1024) await flush();
    batch.push(doc); batchBytes += bytes;
  });
  await flush();
  await solr(`${prefix}/update`, { body: { commit: { waitSearcher: true } }, timeout: 60000 });
  report.importMs = Number((performance.now() - importStart).toFixed(2));
  check(JSON.stringify(secondPass) === JSON.stringify(report.rows)
    && JSON.stringify(projectedAgain) === JSON.stringify(report.projection), 'SOURCE_PROJECTION_CHANGED_BETWEEN_PASSES');
  const indexedAfter = await solr(`${prefix}/select`, { query: { q: '*:*', rows: '0' } });
  check(Number.isSafeInteger(indexedAfter.response?.numFound) && indexedAfter.response.numFound >= 0, 'INDEX_COUNT_RESPONSE_INVALID');
  report.indexedRows = indexedAfter.response.numFound;
  check(report.importedRows === EXPECTED_ROWS && report.indexedRows === EXPECTED_ROWS, 'INDEXED_ROW_COUNT_MISMATCH');
  await loggingIsDisabled(solr);
  report.stage = 'http_validation';
  async function app(path, query = {}, mode = 'bearer') {
    const url = new URL(path, appBase);
    url.search = new URLSearchParams(query).toString();
    const authorization = mode === 'bearer' ? `Bearer ${env.API_TOKEN}`
      : mode === 'basic' ? `Basic ${Buffer.from(`operator:${env.API_TOKEN}`).toString('base64')}`
      : mode === 'wrong' ? 'Bearer fabricated-invalid-corpus-test-token' : undefined;
    return fetch(url, { headers: authorization ? { authorization } : {}, redirect: 'error', signal: AbortSignal.timeout(30000) });
  }
  async function appJson(path, query = {}, mode = 'bearer') {
    const response = await app(path, query, mode);
    check(response.status === 200, 'APPLICATION_REQUEST_FAILED');
    return response.json();
  }
  const generatedLookup = '/documents/by_id/corpus-test-00000001';
  check((await app('/health/ready', {}, 'none')).status === 200, 'APPLICATION_NOT_READY');
  check((await app(generatedLookup, { wt: 'json' }, 'none')).status === 401, 'ANONYMOUS_RECORD_ACCESS_NOT_REJECTED');
  check((await app(generatedLookup, { wt: 'json' }, 'wrong')).status === 401, 'WRONG_TOKEN_NOT_REJECTED');
  check((await app('/records', { emails: 'fabricated-auth-check@example.invalid', wt: 'json' }, 'none')).status === 401, 'ANONYMOUS_SEARCH_NOT_REJECTED');
  const basic = await appJson(generatedLookup, { wt: 'json' }, 'basic');
  check(basic.record?.id === 'corpus-test-00000001', 'BASIC_AUTH_RECORD_LOOKUP_FAILED');
  const recordTimings = [];
  let checkedFieldValues = 0;
  for (const [id, expected] of recordsToRead) {
    const start = performance.now();
    const response = await appJson(`/documents/by_id/${encodeURIComponent(id)}`, { wt: 'json' });
    recordTimings.push(performance.now() - start);
    const actual = response.record;
    check(actual && typeof actual === 'object' && !Array.isArray(actual), 'RECORD_RESPONSE_INVALID');
    check(Object.keys(actual).every((key) => allowed.has(key)) && Object.keys(actual).length === Object.keys(expected).length, 'RECORD_FIELD_ALLOWLIST_MISMATCH');
    for (const [field, value] of Object.entries(expected)) {
      check(sameValue(actual[field], value), 'PROJECTED_RECORD_READ_MISMATCH');
      checkedFieldValues += 1;
    }
  }
  const lookupReport = {};
  for (const field of IDENTIFIER_FIELDS) {
    const frequency = frequencies.get(field);
    const selected = candidates.get(field);
    let queries = 0; let caseQueries = 0; let fragmentQueries = 0; const times = [];
    for (const value of selected.values()) {
      const variations = [{ value, kind: 'exact' }];
      const altered = value === value.toUpperCase() ? value.toLowerCase() : value.toUpperCase();
      if (altered !== value && altered.length <= 256) variations.push({ value: altered, kind: 'case' });
      const fragment = field === 'emails' && value.includes('@') ? value.slice(0, value.indexOf('@')) : value.slice(0, Math.max(1, Math.floor(value.length / 2)));
      if (fragment && fragment !== value) variations.push({ value: fragment, kind: 'fragment' });
      for (const variant of variations) {
        const expectedCount = frequency.get(identifierKey(field, variant.value)) || 0;
        const start = performance.now();
        const result = await appJson('/records', { [field]: variant.value, wt: 'json', rows: '1' });
        times.push(performance.now() - start);
        check(result.resultCount === expectedCount && Array.isArray(result.records)
          && result.count === result.records.length && result.records.length === (expectedCount ? 1 : 0), 'EXACT_IDENTIFIER_COUNT_MISMATCH');
        check(result.records.every((record) => typeof record.id === 'string' && /^corpus-test-\d{8}$/.test(record.id)
          && Object.keys(record).every((key) => allowed.has(key))
          && Array.isArray(record[field]) && record[field].some((item) => typeof item === 'string'
            && canonical(field, item) === canonical(field, variant.value))), 'IDENTIFIER_RESPONSE_FIELDS_INVALID');
        queries += 1;
        if (variant.kind === 'case') caseQueries += 1;
        if (variant.kind === 'fragment') fragmentQueries += 1;
      }
    }
    lookupReport[field] = {
      distinctIndexedIdentifiers: frequency.size, selectedIdentifiers: selected.size, queries,
      caseVariantQueries: caseQueries, fragmentQueries,
      ...(times.length ? { latency: percentiles(times) } : { result: 'not_present_in_corpus' }),
    };
  }
  report.authentication = { bearer: true, basic: true, missingTokenRejected: true, wrongTokenRejected: true };
  report.recordReads = { ...percentiles(recordTimings), comparedFieldValues: checkedFieldValues, mismatches: 0 };
  report.exactIdentifierLookups = lookupReport;
  report.caseFoldSampling = { asciiEmailAndDomainOnly: true, nonAsciiCaseFoldIdentifiersExcluded: nonAsciiEmailValues.size, usernamesCaseSensitive: true };
  report.source.sha256After = await fileHash();
  check(report.source.sha256After === report.source.sha256Before, 'SOURCE_CHANGED_DURING_TEST');
  await loggingIsDisabled(solr);
  report.logging = { log4jAllOffBeforeAndAfter: true, httpRequestLogModuleAbsent: true };
  report.environment = { node: process.version, solr: '9.11.0', execution: 'single-node-loopback-sequential' };
  report.stage = 'complete'; report.status = 'passed';
  if (env.CORPUS_REPORT) await writeFile(env.CORPUS_REPORT, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return report;
}

if (isMain(import.meta.url)) {
  runCorpusTest().then((report) => console.log(JSON.stringify(report, null, 2))).catch(async (error) => {
    let sourceUnchanged = null;
    if (activeReport) {
      try { sourceUnchanged = await fileHash() === activeReport.source.sha256Before; } catch { sourceUnchanged = null; }
    }
    // Never serialize Error.message/stack, HTTP response bodies, records, or assertion diffs.
    console.error(JSON.stringify({
      status: 'failed', code: error instanceof CorpusFailure ? error.code : 'CORPUS_TEST_FAILED_REDACTED',
      stage: activeReport?.stage || 'preflight', importedRows: activeReport?.importedRows || 0,
      completedBatches: activeReport?.completedBatches || 0, parsedRows: activeReport?.rows?.parsedRows || 0,
      rejectedRows: activeReport?.rows?.rejectedRows || 0, sourceUnchanged,
    }));
    process.exitCode = 1;
  });
}
