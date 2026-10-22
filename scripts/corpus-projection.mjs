/** Pure projection helpers. This module never opens the inherited corpus or a socket. */
const controls = /[\x00-\x1f\x7f]/;
const secretFields = new Set(['password', 'passwords', 'line']);
const knownAliases = new Set(['address_search', 'city_search']);

function shape(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return ['string', 'number', 'boolean'].includes(typeof value) ? typeof value : 'object';
}
function count(target, key, amount = 1) { target[key] = (target[key] || 0) + amount; }
export function createProjectionStats() {
  return { rows: 0, rowsWithOnlyGeneratedId: 0, fields: {}, transformations: {}, rejections: {}, omittedFields: {} };
}
function fieldStats(stats, key) {
  return stats.fields[key] ||= {
    occurrences: 0, inputValues: 0, shapes: {}, arrayMin: null, arrayMax: null,
    indexedOccurrences: 0, indexedValues: 0, omittedOccurrences: 0, omittedValues: 0, rejectedOccurrences: 0, rejectedValues: 0,
  };
}
function normalize(value, field) {
  if (field.type === 'boolean') return typeof value === 'boolean' ? { value } : { reject: 'invalid_boolean' };
  if (field.type === 'pint') {
    const candidate = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : value;
    if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < -2147483648 || candidate > 2147483647) {
      return { reject: 'invalid_integer' };
    }
    return { value: candidate, transform: typeof value === 'string' ? 'integer_string_to_number' : undefined };
  }
  if (typeof value !== 'string') return { reject: 'invalid_string_type' };
  if (controls.test(value)) return { reject: 'control_character' };
  const trimmed = value.trim();
  if (!trimmed) return { reject: 'blank_string' };
  const limit = field.name === 'dataClasses' ? 100
    : ['breachName', 'sourceReference'].includes(field.name) ? 2048 : 4096;
  if (trimmed.length > limit) return { reject: 'string_too_long' };
  if (field.name === 'breachDate') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? new Date(`${trimmed}T00:00:00.000Z`) : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) return { reject: 'invalid_breach_date' };
  }
  if (field.type === 'location') {
    if (!/^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(trimmed)) return { reject: 'invalid_coordinates' };
    const [latitude, longitude] = trimmed.split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return { reject: 'invalid_coordinates' };
    }
    const normalized = `${latitude},${longitude}`;
    return { value: normalized, transform: normalized !== value ? 'coordinates_normalized' : undefined };
  }
  return { value: trimmed, transform: trimmed !== value ? 'whitespace_trimmed' : undefined };
}

export function projectRecord(input, ordinal, definitions, displayFields, stats = createProjectionStats()) {
  const schema = definitions instanceof Map ? definitions : new Map(definitions.map((field) => [field.name, field]));
  const allowed = displayFields instanceof Set ? displayFields : new Set(displayFields);
  const output = { id: `corpus-test-${String(ordinal).padStart(8, '0')}` };
  stats.rows += 1;
  count(stats.transformations, 'generated_test_id');
  for (const [name, raw] of Object.entries(input)) {
    // Unknown property names are deliberately not copied into diagnostic output.
    const known = name === 'id' || schema.has(name) || secretFields.has(name) || knownAliases.has(name);
    const label = known ? name : '[unknown_field]';
    const info = fieldStats(stats, label);
    info.occurrences += 1;
    info.inputValues += Array.isArray(raw) ? raw.length : 1;
    count(info.shapes, shape(raw));
    if (Array.isArray(raw)) {
      info.arrayMin = info.arrayMin === null ? raw.length : Math.min(info.arrayMin, raw.length);
      info.arrayMax = info.arrayMax === null ? raw.length : Math.max(info.arrayMax, raw.length);
    }
    if (name === 'id') {
      count(stats.omittedFields, 'original_id_replaced');
      info.omittedOccurrences += 1;
      info.omittedValues += Array.isArray(raw) ? raw.length : 1;
      continue;
    }
    const field = schema.get(name);
    if (secretFields.has(name) || !field || !allowed.has(name)) {
      const reason = secretFields.has(name) ? 'credential_or_raw_field' : !field ? 'not_in_schema' : 'not_display_allowed';
      count(stats.omittedFields, reason);
      info.omittedOccurrences += 1;
      info.omittedValues += Array.isArray(raw) ? raw.length : 1;
      continue;
    }
    let values = Array.isArray(raw) ? raw : [raw];
    if (!field.multiValued && values.length !== 1) {
      count(stats.rejections, 'scalar_cardinality', values.length || 1);
      info.rejectedValues += values.length;
      info.rejectedOccurrences += 1;
      continue;
    }
    if (field.name === 'dataClasses' && values.length > 32) {
      count(stats.rejections, 'metadata_cardinality', values.length);
      info.rejectedValues += values.length;
      info.rejectedOccurrences += 1;
      continue;
    }
    if (Array.isArray(raw) && raw.length === 0) {
      count(stats.rejections, 'empty_array');
      info.rejectedOccurrences += 1;
      continue;
    }
    if (field.multiValued && !Array.isArray(raw)) count(stats.transformations, 'scalar_to_array');
    if (!field.multiValued && Array.isArray(raw)) count(stats.transformations, 'singleton_array_to_scalar');
    const accepted = [];
    for (const value of values) {
      const normalized = normalize(value, field);
      if (normalized.reject) {
        count(stats.rejections, normalized.reject);
        info.rejectedValues += 1;
      } else {
        accepted.push(normalized.value);
        if (normalized.transform) count(stats.transformations, normalized.transform);
      }
    }
    if (accepted.length) {
      output[name] = field.multiValued ? accepted : accepted[0];
      info.indexedOccurrences += 1;
      info.indexedValues += accepted.length;
    } else {
      info.rejectedOccurrences += 1;
    }
  }
  if (Object.keys(output).length === 1) stats.rowsWithOnlyGeneratedId += 1;
  return output;
}

export function requireLoopbackUrl(value, kind) {
  let url;
  try { url = new URL(value); } catch { throw new Error('INVALID_LOOPBACK_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || !url.port
      || (kind === 'app' && !['', '/'].includes(url.pathname))
      || (kind === 'solr' && !['/solr', '/solr/'].includes(url.pathname))) {
    throw new Error('INVALID_LOOPBACK_URL');
  }
  url.pathname = kind === 'solr' ? '/solr/' : '/';
  return url;
}

export function projectionAccountingMatches(stats) {
  return Object.values(stats.fields).every((field) =>
    field.inputValues === field.indexedValues + field.omittedValues + field.rejectedValues
    && field.occurrences === field.indexedOccurrences + field.omittedOccurrences + field.rejectedOccurrences);
}
