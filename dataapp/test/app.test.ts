import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { readConfig, type AppConfig } from '../src/config';
import { HttpError } from '../src/errors';
import type { SearchClient, SearchRecord } from '../src/solr';

const TOKEN = 'synthetic-test-token-with-at-least-32-characters';
const authorization = { authorization: `Bearer ${TOKEN}` };
const record: SearchRecord = {
  id: 'synthetic-001', firstName: ['Synthetic'], lastName: ['Example'], emails: ['sample@example.invalid'],
  passwords: ['never-return-me'], line: 'never-return-raw-source', unknown_secret: 'never-return-dynamic',
  breachName: 'Synthetic Demonstration', breachDate: '2026-01-01', sourceReference: 'urn:synthetic:demo',
  dataClasses: ['Email addresses', 'Passwords'], credentialExposure: true,
};
const defaultSearch: SearchClient = { async select(params) {
  return { numFound: 1, records: params.get('rows') === '0' ? [] : [record] };
} };

async function withApp(
  run: (url: string) => Promise<void>,
  options: { search?: SearchClient; config?: Partial<AppConfig>; now?: () => number } = {},
): Promise<void> {
  const app = createApp({ ...readConfig({ API_TOKEN: TOKEN }), ...options.config }, {
    search: options.search ?? defaultSearch, now: options.now,
  });
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('liveness and readiness expose only minimal unauthenticated status', async () => {
  await withApp(async (url) => {
    assert.deepEqual(await (await fetch(`${url}/health/live`)).json(), { status: 'ok' });
    assert.deepEqual(await (await fetch(`${url}/health/ready`)).json(), { status: 'ready' });
  });
  await withApp(async (url) => {
    const result = await fetch(`${url}/health/ready`);
    assert.equal(result.status, 503);
    assert.deepEqual(await result.json(), { status: 'unavailable' });
  }, { search: { async select() { throw new Error('internal host and credentials'); } } });
});

test('all data and page routes require authentication; legacy UA and URL keys do not bypass it', async () => {
  await withApp(async (url) => {
    for (const path of ['/', '/records?source=synthetic&wt=json', '/documents/by_id/synthetic-001', '/spatial?latLong=0,0', '/map', '/visualize', '/faq', '/terms']) {
      const result = await fetch(`${url}${path}`, { headers: { 'user-agent': TOKEN, 'cf-connecting-ip': '127.0.0.1' } });
      assert.equal(result.status, 401, path);
      assert.match(result.headers.get('www-authenticate') ?? '', /Basic/);
    }
    assert.equal((await fetch(`${url}/records?source=synthetic&apikey=${TOKEN}`)).status, 401);
  });
});

test('Bearer and operator Basic credentials work; other usernames and wrong tokens fail', async () => {
  await withApp(async (url) => {
    assert.equal((await fetch(`${url}/records?source=synthetic&wt=json`, { headers: authorization })).status, 200);
    const basic = Buffer.from(`operator:${TOKEN}`).toString('base64');
    assert.equal((await fetch(`${url}/`, { headers: { authorization: `Basic ${basic}` } })).status, 200);
    for (const credentials of [`other:${TOKEN}`, 'operator:wrong']) {
      assert.equal((await fetch(`${url}/`, { headers: { authorization: `Basic ${Buffer.from(credentials).toString('base64')}` } })).status, 401);
    }
  });
});

test('search sends bounded escaped constraints and strips non-display fields', async () => {
  let query: URLSearchParams | undefined;
  await withApp(async (url) => {
    const params = new URLSearchParams({ firstName: '" OR *:*', wt: 'json', rows: '5', start: '10' });
    const result = await fetch(`${url}/records?${params}`, { headers: authorization });
    assert.equal(result.status, 200);
    const payload = await result.json() as { count: number; records: SearchRecord[] };
    assert.equal(payload.count, 1);
    assert.equal(payload.records[0]?.passwords, undefined);
    assert.equal(payload.records[0]?.line, undefined);
    assert.equal(payload.records[0]?.unknown_secret, undefined);
    assert.equal(payload.records[0]?.breachName, 'Synthetic Demonstration');
    assert.equal(payload.records[0]?.breachDate, '2026-01-01');
    assert.equal(payload.records[0]?.sourceReference, 'urn:synthetic:demo');
    assert.deepEqual(payload.records[0]?.dataClasses, ['Email addresses', 'Passwords']);
    assert.equal(payload.records[0]?.credentialExposure, true);
    assert.equal(query?.get('q'), 'firstName:"\\" OR \\*\\:\\*"');
    assert.equal(query?.get('rows'), '5');
    assert.equal(query?.get('start'), '10');
    assert.equal(query?.get('sort'), 'id asc');
  }, { search: { async select(params) { query = params; return { numFound: 1, records: [record] }; } } });
});

test('bad input terminates with 400 before querying the backend', async () => {
  let calls = 0;
  await withApp(async (url) => {
    for (const path of ['/records', '/records?notfirstName=Example', '/records?source=synthetic&rows=NaN', '/records?firstName[nested]=bad', '/records?passwords=secret', '/spatial?latLong=100,0', '/spatial?latLong=0,0&d=NaN']) {
      const result = await fetch(`${url}${path}`, { headers: authorization });
      assert.equal(result.status, 400, path);
      assert.ok(await result.text());
    }
    assert.equal(calls, 0);
  }, { search: { async select() { calls += 1; return { numFound: 0, records: [] }; } } });
});

test('upstream errors terminate with safe messages and never masquerade as empty results', async () => {
  for (const error of [new HttpError(504, 'Search backend timed out.'), new Error('SECRET internal stack')]) {
    await withApp(async (url) => {
      const result = await fetch(`${url}/records?source=synthetic`, { headers: authorization });
      assert.equal(result.status, error instanceof HttpError ? 504 : 500);
      const body = await result.text();
      assert.ok(body);
      assert.doesNotMatch(body, /SECRET|stack/);
    }, { search: { async select() { throw error; } } });
  }
});

test('record detail supports exact IDs, missing records and explicitly rejects related discovery', async () => {
  await withApp(async (url) => {
    assert.equal((await fetch(`${url}/documents/by_id/synthetic-001?wt=json&moreLikeThis=false`, { headers: authorization })).status, 200);
    assert.equal((await fetch(`${url}/documents/by_id/synthetic-001?moreLikeThis=true`, { headers: authorization })).status, 501);
    assert.equal((await fetch(`${url}/documents/by_id/synthetic-001?moreLikeThis=true&moreLikeThis=false`, { headers: authorization })).status, 400);
    assert.equal((await fetch(`${url}/documents/by_id/other?wt=json`, { headers: authorization })).status, 502);
  });
  await withApp(async (url) => {
    assert.equal((await fetch(`${url}/documents/by_id/missing?wt=json`, { headers: authorization })).status, 404);
  }, { search: { async select() { return { numFound: 0, records: [] }; } } });
});

test('record detail preserves surrounding ID whitespace while rejecting empty, control and oversized IDs', async () => {
  const id = '  synthetic-001  ';
  let calls = 0;
  await withApp(async (url) => {
    const result = await fetch(`${url}/documents/by_id/${encodeURIComponent(id)}?wt=json`, { headers: authorization });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { record: { id, source: 'synthetic' } });
    for (const invalidId of ['  ', 'synthetic\n001', 'x'.repeat(257)]) {
      const rejected = await fetch(`${url}/documents/by_id/${encodeURIComponent(invalidId)}?wt=json`, { headers: authorization });
      assert.equal(rejected.status, 400);
    }
    assert.equal(calls, 1, 'invalid IDs must not reach the backend');
  }, { search: { async select(params) {
    calls += 1;
    assert.equal(params.get('q'), 'id:"  synthetic\\-001  "');
    return { numFound: 1, records: [{ id, source: 'synthetic' }] };
  } } });
});

test('retired export and credit callbacks cannot write or launch workers', async () => {
  let calls = 0;
  await withApp(async (url) => {
    for (const path of ['/export', '/exports/callbacks/a-unique-id/exportCb', '/wallet/anything']) {
      const result = await fetch(`${url}${path}`, { method: 'POST', headers: authorization, body: 'synthetic payload' });
      assert.equal(result.status, 410);
      assert.ok(await result.text());
    }
    assert.equal(calls, 0);
  }, { search: { async select() { calls += 1; return { numFound: 0, records: [] }; } } });
});

test('rate limits cannot be bypassed with forged forwarding headers and reset after the window', async () => {
  let time = 1000;
  await withApp(async (url) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal((await fetch(`${url}/`, { headers: { ...authorization, 'cf-connecting-ip': `192.0.2.${attempt + 1}`, 'x-forwarded-for': `192.0.2.${attempt + 1}` } })).status, 200);
    }
    const blocked = await fetch(`${url}/`, { headers: { ...authorization, 'cf-connecting-ip': '192.0.2.3' } });
    assert.equal(blocked.status, 429);
    assert.ok(blocked.headers.get('retry-after'));
    assert.equal((await fetch(`${url}/health/live`)).status, 200);
    time += 60001;
    assert.equal((await fetch(`${url}/`, { headers: authorization })).status, 200);
  }, { config: { rateLimitMax: 2 }, now: () => time });
});

test('HTML escapes stored markup and responses disable indexing, caching and framing', async () => {
  await withApp(async (url) => {
    const result = await fetch(`${url}/records?source=synthetic`, { headers: authorization });
    const body = await result.text();
    assert.match(body, /&lt;script&gt;synthetic/);
    assert.doesNotMatch(body, /<script>synthetic/);
    assert.equal(result.headers.get('cache-control'), 'no-store');
    assert.equal(result.headers.get('x-frame-options'), 'DENY');
    assert.equal(result.headers.get('x-powered-by'), null);
    assert.match(result.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.match(result.headers.get('x-robots-tag') ?? '', /noindex/);
  }, { search: { async select() { return { numFound: 1, records: [{ id: 'synthetic-001', firstName: '<script>synthetic</script>' }] }; } } });
});
