import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readConfig, type AppConfig } from '../src/config';
import { createSolrClient, presentRecord, type SearchClient } from '../src/solr';
import { HttpError } from '../src/errors';

const token = 'synthetic-test-token-with-at-least-32-characters';
const params = () => new URLSearchParams({ q: 'source:"synthetic"', rows: '2' });

async function withSolr(handler: RequestListener, run: (client: SearchClient) => Promise<void>, override: Partial<AppConfig> = {}) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    await run(createSolrClient({
      ...readConfig({ API_TOKEN: token }), ...override,
      solrUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/solr`,
    }));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function status(expected: number): (error: unknown) => boolean {
  return (error) => error instanceof HttpError && error.status === expected;
}

test('real fetch transport fixes backend, time budget, output fields and no-partial-results policy', async () => {
  await withSolr((req, res) => {
    const url = new URL(req.url!, 'http://localhost');
    assert.equal(url.pathname, '/solr/BigData/select');
    assert.equal(url.searchParams.get('q'), 'source:"synthetic"');
    assert.equal(url.searchParams.get('wt'), 'json');
    assert.equal(url.searchParams.get('omitHeader'), 'false');
    assert.equal(url.searchParams.get('partialResults'), 'false');
    assert.equal(url.searchParams.get('shards.tolerant'), 'false');
    assert.equal(url.searchParams.get('timeAllowed'), '4900');
    assert.doesNotMatch(url.searchParams.get('fl') ?? '', /passwords|(^|,)line(,|$)|\*/);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ responseHeader: { status: 0 }, response: { numFound: 1, docs: [
      { id: 'synthetic-001', source: 'synthetic', passwords: ['never-return'], line: 'raw-source' },
    ] } }));
  }, async (client) => {
    assert.deepEqual(await client.select(params()), {
      numFound: 1, records: [{ id: 'synthetic-001', source: 'synthetic' }],
    });
  });
});

test('non-success HTTP responses, redirects and invalid JSON become safe 502 errors', async () => {
  for (const scenario of ['http-error', 'redirect', 'bad-json']) {
    await withSolr((_req, res) => {
      if (scenario === 'http-error') res.writeHead(500);
      if (scenario === 'redirect') res.writeHead(302, { location: 'http://example.invalid/forbidden' });
      res.end('SECRET backend detail');
    }, async (client) => {
      await assert.rejects(client.select(params()), (error: unknown) => {
        assert.ok(error instanceof HttpError);
        assert.equal(error.status, 502);
        assert.doesNotMatch(error.message, /SECRET|example.invalid/);
        return true;
      });
    });
  }
});

test('hung requests and stalled response bodies are aborted with 504', async () => {
  for (const sendHeaders of [false, true]) {
    await withSolr((_req, res) => {
      if (sendHeaders) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.write('{');
      }
    }, async (client) => {
      const start = Date.now();
      await assert.rejects(client.select(params()), status(504));
      assert.ok(Date.now() - start < 5000, 'timeout must bound both connection and body');
    }, { solrTimeoutMs: 100 });
  }
});

test('oversized responses are rejected with and without content-length', async () => {
  for (const chunked of [false, true]) {
    await withSolr((_req, res) => {
      if (!chunked) res.setHeader('Content-Length', String(2 * 1024 * 1024 + 1));
      else res.setHeader('Transfer-Encoding', 'chunked');
      res.end('x'.repeat(2 * 1024 * 1024 + 1));
    }, async (client) => { await assert.rejects(client.select(params()), status(502)); });
  }
});

test('partial or omitted result sets fail explicitly rather than reporting misleading success', async () => {
  for (const partialResults of [true, 'true', 'omitted']) {
    await withSolr((_req, res) => {
      res.end(JSON.stringify({ responseHeader: { status: 0, partialResults }, response: { numFound: 0, docs: [] } }));
    }, async (client) => { await assert.rejects(client.select(params()), status(503)); });
  }
});

test('invalid response shapes, invalid IDs and oversized row counts are rejected', async () => {
  for (const data of [
    null,
    { response: { numFound: 0, docs: [] } },
    { response: { numFound: -1, docs: [] } },
    { response: { numFound: 1, docs: [{}] } },
    { response: { numFound: 1, docs: [{ id: 'bad\nid' }] } },
    { response: { numFound: 3, docs: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } },
    { responseHeader: { status: 500 }, response: { numFound: 0, docs: [] } },
  ]) {
    await withSolr((_req, res) => { res.end(JSON.stringify(data)); }, async (client) => {
      await assert.rejects(client.select(params()), status(502));
    });
  }
});

test('breach metadata is validated and credential exposure is never inferred from raw data', () => {
  const safe = presentRecord({ id: 'synthetic-001', passwords: ['redacted'] });
  assert.equal(safe.credentialExposure, undefined);
  for (const metadata of [
    { credentialExposure: 'true' }, { dataClasses: 'Passwords' }, { dataClasses: [false] },
    { breachDate: '2026-02-31' }, { breachDate: 'yesterday' }, { breachName: [] }, { sourceReference: '\n' },
  ]) assert.throws(() => presentRecord({ id: 'synthetic-001', ...metadata }), /invalid breach metadata/);
});
