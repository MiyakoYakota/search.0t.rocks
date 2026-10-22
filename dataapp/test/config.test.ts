import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config';

const API_TOKEN = 'synthetic-test-token-with-at-least-32-characters';

test('default configuration requires a strong token and binds loopback', () => {
  assert.throws(() => readConfig({}), /API_TOKEN/);
  assert.throws(() => readConfig({ API_TOKEN: 'short' }), /API_TOKEN/);
  const config = readConfig({ API_TOKEN });
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.allowAnonymous, false);
  assert.equal(config.trustProxy, false);
  assert.equal(config.maxResults, 100);
});

test('anonymous mode requires explicit true and a loopback bind', () => {
  assert.equal(readConfig({ ALLOW_ANONYMOUS: 'true' }).allowAnonymous, true);
  assert.throws(() => readConfig({ ALLOW_ANONYMOUS: 'true', HOST: '0.0.0.0' }), /loopback/);
  assert.throws(() => readConfig({ API_TOKEN, ALLOW_ANONYMOUS: 'yes' }), /true or false/);
});

test('configuration rejects malformed ports, query URLs, credentials and collection paths', () => {
  for (const PORT of ['0', '65536', '3000oops', '-1']) assert.throws(() => readConfig({ API_TOKEN, PORT }));
  for (const SOLR_URL of ['file:///tmp/data', 'http://user:secret@solr/solr', 'http://solr/solr?q=x', 'broken']) {
    assert.throws(() => readConfig({ API_TOKEN, SOLR_URL }));
  }
  assert.throws(() => readConfig({ API_TOKEN, SOLR_COLLECTION: '../private' }));
});

test('proxy trust requires explicit IP addresses or CIDRs', () => {
  assert.deepEqual(readConfig({ API_TOKEN, TRUST_PROXY: '127.0.0.1,::1/128,10.0.0.0/24' }).trustProxy,
    ['127.0.0.1', '::1/128', '10.0.0.0/24']);
  for (const TRUST_PROXY of ['true', '1', 'proxy.example', '127.0.0.1/99', '::1/1/1']) {
    assert.throws(() => readConfig({ API_TOKEN, TRUST_PROXY }));
  }
});
