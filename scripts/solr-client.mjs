import { pathToFileURL } from 'node:url';

export function readSolrConfig(env = process.env) {
  const base = new URL(env.SOLR_URL || 'http://127.0.0.1:8983/solr');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error('SOLR_URL must be an HTTP(S) base URL without credentials, query, or fragment.');
  }
  base.pathname = `${base.pathname.replace(/\/+$/, '')}/`;
  const collection = env.SOLR_COLLECTION || 'BigData';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(collection)) {
    throw new Error('SOLR_COLLECTION must be a valid collection name of at most 64 characters.');
  }
  return { base, collection };
}

export function createSolrClient(config = readSolrConfig(), fetchImpl = fetch) {
  return async function request(path, { query = {}, body, timeout = 10000 } = {}) {
    const url = new URL(path, config.base);
    url.search = new URLSearchParams({ wt: 'json', ...query }).toString();
    const response = await fetchImpl(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`Solr ${path} returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data.error || data.errors || (data.responseHeader && data.responseHeader.status !== 0)) {
      throw new Error(`Solr ${path} rejected the operation. Review the local Solr log.`);
    }
    return data;
  };
}

export function isMain(metaUrl) {
  return process.argv[1] && metaUrl === pathToFileURL(process.argv[1]).href;
}
