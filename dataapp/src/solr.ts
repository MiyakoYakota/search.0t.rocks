import type { AppConfig } from './config';
import { HttpError } from './errors';
import { SEARCH_FIELDS } from './query';

export type RecordValue = string | number | boolean | null | (string | number | boolean | null)[];
export interface SearchRecord {
  id: string;
  breachName?: string;
  breachDate?: string;
  sourceReference?: string;
  dataClasses?: string[];
  credentialExposure?: boolean;
  [field: string]: RecordValue | undefined;
}
export interface SearchResult { numFound: number; records: SearchRecord[] }
export interface SearchClient { select(params: URLSearchParams): Promise<SearchResult> }

// Deliberately omit raw source lines, passwords, arbitrary dynamic fields, and internal Solr metadata.
export const DISPLAY_FIELDS = [
  'id', ...SEARCH_FIELDS, 'latLong', 'accuracy_radius', 'autoBody', 'autoClass', 'autoMake',
  'autoModel', 'autoYear', 'birthMonth', 'birthday', 'dob', 'firstName', 'middleName', 'location',
  'breachName', 'breachDate', 'sourceReference', 'dataClasses', 'credentialExposure',
] as const;
const displayFields = new Set<string>(DISPLAY_FIELDS);
const RESPONSE_LIMIT = 2 * 1024 * 1024;

function scalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

export function presentRecord(value: unknown): SearchRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(502, 'Search backend returned an invalid record.');
  const input = value as Record<string, unknown>;
  if (typeof input.id !== 'string' || !input.id || input.id.length > 256 || /[\x00-\x1f\x7f]/.test(input.id)) {
    throw new HttpError(502, 'Search backend returned an invalid record ID.');
  }
  // These are operator-supplied assertions, never inferred from credentials or other record fields.
  for (const field of ['breachName', 'sourceReference'] as const) {
    if (input[field] !== undefined && (typeof input[field] !== 'string' || !input[field]
      || input[field].length > 2048 || /[\x00-\x1f\x7f]/.test(input[field]))) {
      throw new HttpError(502, 'Search backend returned invalid breach metadata.');
    }
  }
  if (input.credentialExposure !== undefined && typeof input.credentialExposure !== 'boolean') {
    throw new HttpError(502, 'Search backend returned invalid breach metadata.');
  }
  if (input.dataClasses !== undefined && (!Array.isArray(input.dataClasses) || input.dataClasses.length > 32
    || !input.dataClasses.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 100 && !/[\x00-\x1f\x7f]/.test(item)))) {
    throw new HttpError(502, 'Search backend returned invalid breach metadata.');
  }
  if (input.breachDate !== undefined) {
    if (typeof input.breachDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.breachDate)) {
      throw new HttpError(502, 'Search backend returned invalid breach metadata.');
    }
    const timestamp = new Date(`${input.breachDate}T00:00:00.000Z`);
    if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString().slice(0, 10) !== input.breachDate) {
      throw new HttpError(502, 'Search backend returned invalid breach metadata.');
    }
  }
  const output: SearchRecord = { id: input.id };
  for (const [key, item] of Object.entries(input)) {
    if (!displayFields.has(key)) continue;
    if (scalar(item)) output[key] = item;
    else if (Array.isArray(item) && item.every(scalar)) output[key] = item;
  }
  return output;
}

async function boundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > RESPONSE_LIMIT) {
    await response.body?.cancel();
    throw new HttpError(502, 'Search backend response exceeded the size limit.');
  }
  if (!response.body) throw new HttpError(502, 'Search backend returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > RESPONSE_LIMIT) {
        await reader.cancel();
        throw new HttpError(502, 'Search backend response exceeded the size limit.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(502, 'Search backend returned invalid JSON.');
  }
}

export function createSolrClient(config: AppConfig, fetchImpl: typeof fetch = fetch): SearchClient {
  return {
    async select(params) {
      const url = new URL(`${config.solrUrl}/${encodeURIComponent(config.solrCollection)}/select`);
      url.search = new URLSearchParams({
        ...Object.fromEntries(params), wt: 'json', omitHeader: 'false', fl: [...new Set(DISPLAY_FIELDS)].join(','),
        timeAllowed: String(Math.max(1, config.solrTimeoutMs - 100)), 'shards.tolerant': 'false', partialResults: 'false',
      }).toString();
      const signal = AbortSignal.timeout(config.solrTimeoutMs);
      try {
        const response = await fetchImpl(url, {
          signal, redirect: 'error', headers: { accept: 'application/json' },
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw new HttpError(502, 'Search backend rejected the request.');
        }
        const data = await boundedJson(response) as {
          responseHeader?: { status?: unknown; partialResults?: unknown };
          response?: { numFound?: unknown; docs?: unknown };
        } | null;
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new HttpError(502, 'Search backend returned an invalid response.');
        }
        if (data.responseHeader?.partialResults !== undefined && data.responseHeader.partialResults !== false
          && data.responseHeader.partialResults !== 'false') {
          throw new HttpError(503, 'Search backend could not complete the query. Please narrow the search.');
        }
        if (data.responseHeader?.status !== 0
          || !data.response || !Number.isSafeInteger(data.response.numFound)
          || Number(data.response.numFound) < 0 || !Array.isArray(data.response.docs)
          || data.response.docs.length > Number(params.get('rows') ?? config.maxResults)
          || data.response.docs.length > Number(data.response.numFound)) {
          throw new HttpError(502, 'Search backend returned an invalid response.');
        }
        return { numFound: Number(data.response.numFound), records: data.response.docs.map(presentRecord) };
      } catch (error) {
        if (signal.aborted) throw new HttpError(504, 'Search backend timed out.');
        if (error instanceof HttpError) throw error;
        throw new HttpError(502, 'Search backend is unavailable.');
      }
    },
  };
}
