import { isIP } from 'node:net';

export interface AppConfig {
  host: string;
  port: number;
  solrUrl: string;
  solrCollection: string;
  apiToken: string;
  allowAnonymous: boolean;
  solrTimeoutMs: number;
  maxResults: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  trustProxy: false | string[];
}

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

function boolean(env: NodeJS.ProcessEnv, key: string): boolean {
  const raw = env[key];
  if (raw === undefined || raw === '' || raw === 'false') return false;
  if (raw === 'true') return true;
  throw new Error(`${key} must be true or false.`);
}

function proxyAddresses(value: string | undefined): false | string[] {
  if (!value || value === 'false') return false;
  const addresses = value.split(',').map((address) => address.trim());
  for (const address of addresses) {
    const [ip, prefix, ...extra] = address.split('/');
    const family = isIP(ip ?? '');
    if (!family || extra.length > 0 || (prefix !== undefined && (!/^\d+$/.test(prefix)
      || Number(prefix) < 0 || Number(prefix) > (family === 4 ? 32 : 128)))) {
      throw new Error('TRUST_PROXY must be a comma-separated list of trusted IP addresses or CIDRs.');
    }
  }
  return addresses;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const host = env.HOST || '127.0.0.1';
  if (!isIP(host)) throw new Error('HOST must be an IPv4 or IPv6 address.');
  const allowAnonymous = boolean(env, 'ALLOW_ANONYMOUS');
  if (allowAnonymous && !['127.0.0.1', '::1'].includes(host)) {
    throw new Error('ALLOW_ANONYMOUS is restricted to a loopback HOST.');
  }
  const apiToken = env.API_TOKEN || '';
  if ((!allowAnonymous || apiToken) && !/^[\x21-\x7e]{32,512}$/.test(apiToken)) {
    throw new Error('API_TOKEN must contain between 32 and 512 printable non-space characters.');
  }
  let solrUrl: URL;
  try {
    solrUrl = new URL(env.SOLR_URL || 'http://127.0.0.1:8983/solr');
  } catch {
    throw new Error('SOLR_URL must be an absolute HTTP or HTTPS URL.');
  }
  if (!['http:', 'https:'].includes(solrUrl.protocol) || solrUrl.username || solrUrl.password
    || solrUrl.search || solrUrl.hash) {
    throw new Error('SOLR_URL must use HTTP(S) without embedded credentials, query, or fragment.');
  }
  const solrCollection = env.SOLR_COLLECTION || 'BigData';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(solrCollection)) {
    throw new Error('SOLR_COLLECTION must be a simple collection name.');
  }
  return {
    host,
    port: integer(env, 'PORT', 3000, 1, 65535),
    solrUrl: solrUrl.toString().replace(/\/$/, ''),
    solrCollection,
    apiToken,
    allowAnonymous,
    solrTimeoutMs: integer(env, 'SOLR_TIMEOUT_MS', 5000, 100, 30000),
    maxResults: integer(env, 'MAX_RESULTS', 100, 1, 500),
    rateLimitMax: integer(env, 'RATE_LIMIT_MAX', 60, 1, 10000),
    rateLimitWindowMs: integer(env, 'RATE_LIMIT_WINDOW_MS', 60000, 1000, 3600000),
    trustProxy: proxyAddresses(env.TRUST_PROXY),
  };
}
