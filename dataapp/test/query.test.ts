import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuery, literal, spatialQuery } from '../src/query';

test('search preserves Unicode and spaces without wildcard expansion', () => {
  assert.deepEqual(buildQuery({ firstName: '  Séraphine  ', lastName: 'Example Record', rows: '10', start: '20' }, 100), {
    q: 'firstName:"Séraphine" AND lastName:"Example Record"', rows: 10, start: 20,
  });
});

test('query syntax is escaped inside literals', () => {
  const hostile = '" OR *:* OR source:(anything) \\';
  assert.equal(literal(hostile), '"\\" OR \\*\\:\\* OR source\\:\\(anything\\) \\\\"');
  assert.equal(buildQuery({ usernames: hostile }, 100).q, `usernames:${literal(hostile)}`);
});

test('repeated values are grouped before other constraints and exclusions', () => {
  assert.equal(buildQuery({ firstName: ['One', 'Two'], source: 'synthetic', notzipCode: '00000' }, 100).q,
    '(firstName:"One" OR firstName:"Two") AND source:"synthetic" AND NOT zipCode:"00000"');
});

test('empty form fields are ignored without allowing an empty query', () => {
  assert.equal(buildQuery({ firstName: '', lastName: 'Example', emails: ' ' }, 100).q, 'lastName:"Example"');
  assert.throws(() => buildQuery({ firstName: '', notsource: 'synthetic' }, 100), /positive search field/);
});

test('unsupported fields, raw queries, credential filters and nested input are rejected', () => {
  for (const query of [
    { q: '*:*' }, { passwords: 'secret' }, { firstName: { nested: 'value' } },
    { firstName: 'Example', apikey: 'token' }, { firstName: 'Example', exact: ['true'] },
    { firstName: ['a', 'b', 'c', 'd', 'e', 'f'] }, { firstName: 'line\nbreak' },
  ]) assert.throws(() => buildQuery(query, 100));
});

test('pagination and numeric filters reject partial, negative, oversized and repeated numbers', () => {
  for (const rows of ['0', '101', '2junk', '-1', '1.5', ['2', '3']]) {
    assert.throws(() => buildQuery({ source: 'synthetic', rows }, 100));
  }
  for (const start of ['10001', 'Infinity', '1e2', '-1']) {
    assert.throws(() => buildQuery({ source: 'synthetic', start }, 100));
  }
  assert.throws(() => buildQuery({ asn: '2147483648' }, 100));
});

test('valid spatial parameters stay bounded and server-owned', () => {
  const params = spatialQuery({ latLong: '0,0', d: '0.2', rows: '2' }, 100);
  assert.equal(params.get('fq'), '{!geofilt sfield=latLong}');
  assert.equal(params.get('pt'), '0,0');
  assert.equal(params.get('rows'), '2');
});

test('spatial search rejects NaN, suffixes, out-of-range coordinates and parameter injection', () => {
  for (const latLong of ['91,0', '0,-181', 'NaN,0', '0,0junk', ['0,0'], '0,0&fq=*:*']) {
    assert.throws(() => spatialQuery({ latLong }, 100));
  }
  for (const d of ['NaN', 'Infinity', '2km', '0', '1001', ['1']]) {
    assert.throws(() => spatialQuery({ latLong: '0,0', d }, 100));
  }
  assert.throws(() => spatialQuery({ latLong: '0,0', q: '*:*' }, 100));
});
