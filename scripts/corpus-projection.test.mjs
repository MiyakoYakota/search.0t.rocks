import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionStats, projectRecord, projectionAccountingMatches, requireLoopbackUrl } from './corpus-projection.mjs';
const fields = [
  { name: 'emails', type: 'text_identifier', multiValued: true },
  { name: 'state', type: 'string', multiValued: false },
  { name: 'latLong', type: 'location', multiValued: false },
  { name: 'asn', type: 'pint', multiValued: false },
  { name: 'credentialExposure', type: 'boolean', multiValued: false },
  { name: 'photos', type: 'string', multiValued: true },
];
const allowed = ['emails', 'state', 'latLong', 'asn', 'credentialExposure'];
const project = (record, stats = createProjectionStats()) => projectRecord(record, 1, fields, allowed, stats);

test('projection replaces IDs, omits credentials and display-disallowed values, and groups unknown keys', () => {
  const stats = createProjectionStats();
  const doc = project({ id: 'fictional-original-id', passwords: ['fictional-secret'], photos: ['fictional-image'], 'unknown-example.invalid': 'fictional', emails: 'Example@example.invalid' }, stats);
  assert.deepEqual(doc, { id: 'corpus-test-00000001', emails: ['Example@example.invalid'] });
  assert.equal(stats.omittedFields.credential_or_raw_field, 1);
  assert.equal(stats.omittedFields.not_display_allowed, 1);
  assert.equal(stats.omittedFields.not_in_schema, 1);
  assert.equal(stats.fields['[unknown_field]'].occurrences, 1);
  assert.equal(JSON.stringify(stats).includes('unknown-example.invalid'), false);
});

test('projection records trimming and value rejection while preserving valid array members', () => {
  const stats = createProjectionStats();
  const doc = project({ emails: [' example@example.invalid ', '', 'bad\nvalue', null], state: ['Example'] }, stats);
  assert.deepEqual(doc.emails, ['example@example.invalid']);
  assert.equal(doc.state, 'Example');
  assert.equal(stats.transformations.whitespace_trimmed, 1);
  assert.equal(stats.transformations.singleton_array_to_scalar, 1);
  assert.equal(stats.fields.emails.rejectedValues, 3);
  assert.deepEqual(stats.rejections, { blank_string: 1, control_character: 1, invalid_string_type: 1 });
});

test('zero and false survive projection; integer and coordinate strings are explicitly normalized', () => {
  const stats = createProjectionStats();
  const doc = project({ asn: '0', credentialExposure: false, latLong: '0.0, 0.000' }, stats);
  assert.equal(doc.asn, 0);
  assert.equal(doc.credentialExposure, false);
  assert.equal(doc.latLong, '0,0');
  assert.equal(stats.transformations.integer_string_to_number, 1);
  assert.equal(stats.transformations.coordinates_normalized, 1);
});

test('projection rejects incompatible scalar cardinality, integer ranges, and coordinates', () => {
  const stats = createProjectionStats();
  const doc = project({ state: ['Example', 'Other'], asn: '2147483648', latLong: '91,0' }, stats);
  assert.deepEqual(doc, { id: 'corpus-test-00000001' });
  assert.deepEqual(stats.rejections, { scalar_cardinality: 2, invalid_integer: 1, invalid_coordinates: 1 });
  assert.equal(stats.rowsWithOnlyGeneratedId, 1);
});

test('network guard accepts explicit literal loopback endpoints only', () => {
  assert.equal(requireLoopbackUrl('http://127.0.0.1:18984/solr', 'solr').href, 'http://127.0.0.1:18984/solr/');
  assert.equal(requireLoopbackUrl('http://[::1]:3012', 'app').hostname, '[::1]');
  for (const candidate of ['http://localhost:8983/solr', 'http://example.invalid:8983/solr', 'http://127.0.0.1/solr', 'http://user:secret@127.0.0.1:8983/solr', 'http://127.0.0.1:8983/solr?value=example']) {
    assert.throws(() => requireLoopbackUrl(candidate, 'solr'), { message: 'INVALID_LOOPBACK_URL' });
  }
});

test('every original field occurrence and value has a terminal accounting disposition', () => {
  const stats = createProjectionStats();
  project({ id: 'fictional-id', passwords: ['fictional-one', 'fictional-two'], emails: ['valid@example.invalid', ''], state: [], photos: [] }, stats);
  project({ emails: [], state: ['Example', 'Other'], asn: 'invalid' }, stats);
  assert.equal(projectionAccountingMatches(stats), true);
  assert.equal(stats.fields.state.rejectedOccurrences, 2);
  assert.equal(stats.fields.state.rejectedValues, 2);
  assert.equal(stats.fields.passwords.omittedValues, 2);
  assert.equal(stats.fields.emails.rejectedOccurrences, 1);
  assert.equal(stats.fields.emails.rejectedValues, 1);
});
