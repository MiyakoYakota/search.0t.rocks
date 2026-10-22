import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { bootstrap } from './bootstrap-solr.mjs';
import { createSolrClient, readSolrConfig } from './solr-client.mjs';

const fields = JSON.parse(await readFile(new URL('../solr/fields.json', import.meta.url), 'utf8'));
const fieldTypes = JSON.parse(await readFile(new URL('../solr/field-types.json', import.meta.url), 'utf8'));
const idField = { name: 'id', type: 'string', stored: true, indexed: true, multiValued: false };
const config = readSolrConfig({ SOLR_URL: 'http://localhost:8983/solr', SOLR_COLLECTION: 'BigData' });

function fakeSolr({ existing = false, configName = 'BigData.AUTOCREATED', schema = [idField], shared = false } = {}) {
  const collections = existing ? { BigData: { configName } } : {};
  if (shared) collections.Other = { configName: 'BigData.AUTOCREATED' };
  const state = { collections, configs: ['_default'], fields: structuredClone(schema), fieldTypes: [], overlay: {}, mutations: [] };
  const request = async (path, options = {}) => {
    const { query = {}, body } = options;
    if (query.action === 'CREATE' || body) state.mutations.push({ path, query, body });
    if (path === 'admin/collections' && query.action === 'CLUSTERSTATUS') {
      return { cluster: { live_nodes: ['test-node'], collections: state.collections } };
    }
    if (path === 'admin/collections' && query.action === 'CREATE') state.collections[query.name] = { configName: `${query.name}.AUTOCREATED` };
    else if (path === 'BigData/schema/fields') return { fields: state.fields };
    else if (path === 'BigData/schema/fieldtypes') return { fieldTypes: state.fieldTypes };
    else if (path === 'BigData/schema/uniquekey') return { uniqueKey: 'id' };
    else if (path === 'BigData/schema' && body) {
      state.fields.push(...body['add-field'] || []);
      state.fieldTypes.push(...body['add-field-type'] || []);
    }
    else if (path === 'BigData/config/overlay') return { overlay: state.overlay };
    else if (path === 'BigData/config' && body) state.overlay.userProps = body['set-user-property'];
    else if (path === 'BigData/select') return { response: { numFound: 2, docs: [] } };
    else throw new Error(`Unexpected operation: ${path}`);
    return { responseHeader: { status: 0 } };
  };
  return { state, request };
}

test('bootstrap creates a dedicated configset and schema; second pass makes no writes', async () => {
  const { request, state } = fakeSolr();
  await bootstrap({ config, request, log() {} });
  assert.equal(state.collections.BigData.configName, 'BigData.AUTOCREATED');
  assert.equal(state.fields.length, fields.length + 1);
  assert.deepEqual(state.fieldTypes, fieldTypes);
  assert.equal(state.overlay.userProps['update.autoCreateFields'], 'false');
  assert.equal(state.mutations.length, 3);
  state.mutations.length = 0;
  await bootstrap({ config, request, log() {} });
  assert.deepEqual(state.mutations, []);
});

test('incompatible field definitions fail before a schema or configuration write', async () => {
  const schema = [idField, ...structuredClone(fields)];
  schema.find((field) => field.name === 'emails').multiValued = false;
  const { state, request } = fakeSolr({ existing: true, schema });
  await assert.rejects(bootstrap({ config, request, log() {} }), /Incompatible field emails.multiValued/);
  assert.deepEqual(state.mutations, []);
});

test('legacy and shared configsets are never silently altered', async () => {
  for (const options of [{ existing: true, configName: '_default' }, { existing: true, shared: true }]) {
    const { state, request } = fakeSolr(options);
    await assert.rejects(bootstrap({ config, request, log() {} }), /different configset|shared/);
    assert.deepEqual(state.mutations, []);
  }
});

test('identifier analyzer drift is rejected before any write', async () => {
  const { state, request } = fakeSolr({ existing: true, schema: [idField, ...fields] });
  const changed = structuredClone(fieldTypes[0]);
  changed.analyzer.tokenizer.class = 'solr.StandardTokenizerFactory';
  state.fieldTypes.push(changed);
  await assert.rejects(bootstrap({ config, request, log() {} }), /Incompatible field type text_identifier/);
  assert.deepEqual(state.mutations, []);
});

test('credentials are excluded from the new schema and fixtures are synthetic', async () => {
  assert.ok(!fields.some((field) => /password|secret|token/i.test(field.name)));
  const fixtures = JSON.parse(await readFile(new URL('../samples/sample.json', import.meta.url), 'utf8'));
  assert.equal(fixtures.length, 2);
  assert.ok(fixtures.every((record) => record.source === 'synthetic-fixture' && record.emails.every((email) => email.toLowerCase().endsWith('@example.invalid'))));
  assert.ok(fixtures.every((record) => record.credentialExposure === false && record.breachName === 'Synthetic demonstration breach'));
});

test('upstream readiness retries are bounded and never create a collection on failure', async () => {
  let requests = 0;
  let pauses = 0;
  await assert.rejects(bootstrap({ config, request: async () => { requests += 1; throw new Error('Unavailable'); }, pause: async () => { pauses += 1; }, log() {} }), /Unavailable/);
  assert.equal(requests, 30);
  assert.equal(pauses, 29);
});

test('invalid Solr URLs and collection traversal are rejected', () => {
  for (const SOLR_URL of ['file:///etc/passwd', 'http://user:password@localhost/solr', 'http://localhost/solr?x=1', 'http://localhost/solr#fragment']) {
    assert.throws(() => readSolrConfig({ SOLR_URL }));
  }
  for (const SOLR_COLLECTION of ['../admin', 'space name', 'x'.repeat(65)]) {
    assert.throws(() => readSolrConfig({ SOLR_COLLECTION }));
  }
});

test('Solr client rejects HTTP failures and Solr-level errors', async () => {
  for (const response of [new Response('{}', { status: 503 }), new Response('{"responseHeader":{"status":1}}'), new Response('{"error":{"msg":"hidden internal details"}}')]) {
    const request = createSolrClient(config, async () => response);
    await assert.rejects(request('BigData/select'), /HTTP 503|rejected the operation/);
  }
});

test('Solr client sends JSON and prevents redirects', async () => {
  const request = createSolrClient(config, async (url, options) => {
    assert.equal(url.href, 'http://localhost:8983/solr/BigData/update?wt=json&commit=true');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), [{ id: 'synthetic' }]);
    assert.ok(options.signal instanceof AbortSignal);
    return new Response('{"responseHeader":{"status":0}}');
  });
  await request('BigData/update', { query: { commit: 'true' }, body: [{ id: 'synthetic' }] });
});
