import { HttpError } from './errors';

/** Field names are owned by the server, never taken from raw Solr syntax. */
export const SEARCH_FIELDS = [
  'firstName', 'lastName', 'birthYear', 'ips', 'asn', 'domain', 'asnOrg', 'country',
  'continent', 'source', 'emails', 'VRN', 'usernames', 'address', 'city', 'zipCode',
  'state', 'phoneNumbers', 'vin',
] as const;
const allowedFields = new Set<string>(SEARCH_FIELDS);
const metadata = new Set(['wt', 'exact', 'rows', 'start']);

export function literal(value: string): string {
  return `"${value.replace(/([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)/g, '\\$1')}"`;
}

export function boundedString(value: unknown, name: string, max = 256): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    throw new HttpError(400, `${name} must be a non-empty string of at most ${max} characters.`);
  }
  return value.trim();
}

function pageInteger(raw: unknown, name: string, fallback: number, min: number, max: number): number {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw new HttpError(400, `${name} must be an integer between ${min} and ${max}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new HttpError(400, `${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

export function validateFormat(query: Record<string, unknown>): void {
  if (query.wt !== undefined && query.wt !== 'json' && query.wt !== 'html') {
    throw new HttpError(400, 'wt must be json or html.');
  }
}

export interface SearchQuery { q: string; rows: number; start: number }

export function buildQuery(query: Record<string, unknown>, maxResults: number): SearchQuery {
  validateFormat(query);
  if (Object.keys(query).length > 40) throw new HttpError(400, 'Too many search parameters.');
  if (query.exact !== undefined && (typeof query.exact !== 'string' || !['true', 'false', '1', '0', 'on'].includes(query.exact))) {
    throw new HttpError(400, 'exact must be true or false.');
  }
  const positive: string[] = [];
  const negative: string[] = [];
  for (const [key, input] of Object.entries(query)) {
    if (metadata.has(key)) continue;
    const excluded = key.startsWith('not');
    const field = excluded ? key.slice(3) : key;
    if (!allowedFields.has(field)) throw new HttpError(400, `Unsupported search parameter: ${key.slice(0, 64)}.`);
    const supplied = Array.isArray(input) ? input : [input];
    if (!supplied.length || supplied.length > 5) throw new HttpError(400, 'Each field accepts at most five values.');
    const values = supplied.filter((value) => typeof value !== 'string' || value.trim() !== '');
    if (!values.length) continue;
    const clauses = values.map((value) => {
      const text = boundedString(value, field);
      if (field === 'asn' && (!/^\d+$/.test(text) || Number(text) > 2147483647)) {
        throw new HttpError(400, 'asn must be a non-negative 32-bit integer.');
      }
      return `${field}:${literal(text)}`;
    });
    const clause = clauses.length === 1 ? clauses[0]! : `(${clauses.join(' OR ')})`;
    (excluded ? negative : positive).push(clause);
  }
  if (!positive.length) throw new HttpError(400, 'Provide at least one positive search field.');
  return {
    q: [...positive, ...negative.map((clause) => `NOT ${clause}`)].join(' AND '),
    rows: pageInteger(query.rows, 'rows', maxResults, 1, maxResults),
    start: pageInteger(query.start, 'start', 0, 0, 10000),
  };
}

export function spatialQuery(query: Record<string, unknown>, maxResults: number): URLSearchParams {
  if (Object.keys(query).some((key) => !['latLong', 'd', 'rows'].includes(key))) {
    throw new HttpError(400, 'Unsupported spatial search parameter.');
  }
  const text = boundedString(query.latLong, 'latLong', 64);
  if (!/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(text)) {
    throw new HttpError(400, 'latLong must be latitude,longitude.');
  }
  const [latitude, longitude] = text.split(',').map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude!) > 90 || Math.abs(longitude!) > 180) {
    throw new HttpError(400, 'Coordinates are outside the valid latitude/longitude range.');
  }
  const rawDistance = query.d === undefined ? '0.2' : query.d;
  if (typeof rawDistance !== 'string' || !/^\d+(?:\.\d+)?$/.test(rawDistance)) {
    throw new HttpError(400, 'd must be a number between 0.1 and 1000 kilometers.');
  }
  const distance = Number(rawDistance);
  if (!Number.isFinite(distance) || distance < 0.1 || distance > 1000) {
    throw new HttpError(400, 'd must be a number between 0.1 and 1000 kilometers.');
  }
  return new URLSearchParams({
    q: '*:*', fq: '{!geofilt sfield=latLong}', pt: `${latitude},${longitude}`, d: String(distance),
    rows: String(pageInteger(query.rows, 'rows', maxResults, 1, maxResults)),
  });
}
