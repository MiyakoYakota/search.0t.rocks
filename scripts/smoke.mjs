import assert from 'node:assert/strict';

const base = new URL(process.env.APP_URL || 'http://127.0.0.1:3000');
if (!process.env.API_TOKEN) throw new Error('API_TOKEN is required for the smoke test.');
const headers = { authorization: `Bearer ${process.env.API_TOKEN}` };
async function get(path, authenticated = true) {
  return fetch(new URL(path, base), {
    headers: authenticated ? headers : {}, signal: AbortSignal.timeout(10000), redirect: 'error',
  });
}

assert.equal((await get('/health/live', false)).status, 200, 'liveness');
assert.equal((await get('/health/ready', false)).status, 200, 'readiness');
assert.equal((await get('/records?firstName=Example&wt=json', false)).status, 401, 'anonymous search rejected');
const search = await get('/records?firstName=Example&wt=json');
assert.equal(search.status, 200, 'authenticated search');
const result = await search.json();
assert.ok(result.records.some((record) => record.id === '00000000-0000-4000-8000-000000000001'), 'synthetic fixture found');
const exactEmail = await get('/records?emails=record-one%40example.invalid&wt=json');
assert.equal(exactEmail.status, 200, 'case-insensitive exact email lookup');
const emailRecords = (await exactEmail.json()).records;
assert.equal(emailRecords.length, 1, 'full email identifier matches one fixture');
assert.equal(emailRecords[0].id, '00000000-0000-4000-8000-000000000001');
const partialEmail = await get('/records?emails=record-one&wt=json');
assert.equal(partialEmail.status, 200);
assert.equal((await partialEmail.json()).records.length, 0, 'email token alone must not match');
const exactDomain = await get('/records?domain=EXAMPLE.INVALID&wt=json');
assert.equal(exactDomain.status, 200);
assert.equal((await exactDomain.json()).records.length, 2, 'whole domain is case-insensitive');
const partialDomain = await get('/records?domain=example&wt=json');
assert.equal((await partialDomain.json()).records.length, 0, 'domain fragment must not match');
const exactUsername = await get('/records?usernames=synthetic-record-one&wt=json');
const usernameRecords = (await exactUsername.json()).records;
assert.equal(usernameRecords.length, 1, 'exact username matches');
assert.equal(usernameRecords[0].id, '00000000-0000-4000-8000-000000000001');
const otherCaseUsername = await get('/records?usernames=SYNTHETIC-RECORD-ONE&wt=json');
assert.equal((await otherCaseUsername.json()).records.length, 0, 'username case is preserved');
const detail = await get('/documents/by_id/00000000-0000-4000-8000-000000000001?wt=json');
assert.equal(detail.status, 200, 'record lookup');
const record = (await detail.json()).record;
assert.equal(record.id, '00000000-0000-4000-8000-000000000001');
assert.equal(record.breachName, 'Synthetic demonstration breach');
assert.equal(record.breachDate, '2026-01-01');
assert.equal(record.credentialExposure, false, 'explicit false exposure metadata is retained');
assert.deepEqual(record.dataClasses, ['Email addresses', 'Usernames']);
const spatial = await get('/spatial?latLong=0,0&d=1');
assert.equal(spatial.status, 200, 'spatial query');
assert.ok((await spatial.json()).records.length >= 2, 'synthetic spatial fixtures found');
assert.equal((await get('/spatial?latLong=100,200&d=NaN')).status, 400, 'invalid spatial input rejected');
const basic = Buffer.from(`operator:${process.env.API_TOKEN}`).toString('base64');
const page = await fetch(new URL('/', base), { headers: { authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(10000) });
assert.equal(page.status, 200, 'browser authentication');
console.log('Smoke passed: health, authentication, search, ID lookup, spatial validation, and HTML.');
