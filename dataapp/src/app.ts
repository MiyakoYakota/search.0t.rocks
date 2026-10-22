import express, { type ErrorRequestHandler } from 'express';
import mustache from 'mustache';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from './config';
import { authentication, rateLimit } from './auth';
import { HttpError } from './errors';
import { boundedString, buildQuery, literal, spatialQuery, validateFormat } from './query';
import { createSolrClient, presentRecord, type SearchClient, type SearchRecord } from './solr';

const APP_ROOT = resolve(__dirname, '../..');

interface AppDependencies {
  search?: SearchClient;
  now?: () => number;
  /** Override only for tests or a packaged installation with an explicit asset location. */
  assetRoot?: string;
}

function recordFields(record: SearchRecord): { key: string; value: string }[] {
  return Object.entries(record).filter(([key]) => key !== 'id').map(([key, value]) => ({
    key, value: Array.isArray(value) ? value.join(', ') : String(value ?? ''),
  }));
}

export function createApp(config: AppConfig, dependencies: AppDependencies = {}) {
  const app = express();
  const search = dependencies.search ?? createSolrClient(config);
  const root = dependencies.assetRoot ?? APP_ROOT;
  const templates = {
    home: readFileSync(resolve(root, 'templates/pages/home.mustache'), 'utf8'),
    listing: readFileSync(resolve(root, 'templates/pages/recordsListing.mustache'), 'utf8'),
    record: readFileSync(resolve(root, 'templates/pages/recordById.mustache'), 'utf8'),
  };
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.set('query parser', 'simple');
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    });
    if (req.originalUrl.length > 8192) { next(new HttpError(414, 'Request URL is too long.')); return; }
    next();
  });

  app.get('/health/live', (_req, res) => { res.json({ status: 'ok' }); });
  app.get('/robots.txt', (_req, res) => { res.type('text/plain').send('User-agent: *\nDisallow: /\n'); });
  app.get('/favicon.ico', (_req, res) => { res.status(204).end(); });
  app.use('/assets', express.static(resolve(root, 'static/assets'), {
    dotfiles: 'deny', index: false, redirect: false, maxAge: 0,
  }));

  app.use(rateLimit(config, dependencies.now));
  app.get('/health/ready', async (_req, res) => {
    try {
      await search.select(new URLSearchParams({ q: '*:*', rows: '0' }));
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use(authentication(config));
  app.get('/', (_req, res) => {
    res.type('html').send(mustache.render(templates.home, { maxResults: config.maxResults, authenticated: !config.allowAnonymous }));
  });

  app.get('/records', async (req, res) => {
    const query = buildQuery(req.query, config.maxResults);
    const result = await search.select(new URLSearchParams({
      q: query.q, rows: String(query.rows), start: String(query.start), sort: 'id asc',
    }));
    const records = result.records.map(presentRecord);
    if (req.query.wt === 'json') {
      res.json({ resultCount: result.numFound, count: records.length, start: query.start, records });
      return;
    }
    const pagination = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      for (const item of Array.isArray(value) ? value : [value]) if (typeof item === 'string') pagination.append(key, item);
    }
    pagination.set('start', String(Math.max(0, query.start - query.rows)));
    const previousUrl = query.start > 0 ? `/records?${pagination}` : '';
    pagination.set('start', String(query.start + query.rows));
    const nextUrl = query.start + query.rows < result.numFound && query.start + query.rows <= 10000
      ? `/records?${pagination}` : '';
    res.type('html').send(mustache.render(templates.listing, {
      resultCount: result.numFound, count: records.length, start: query.start, previousUrl, nextUrl,
      hasResults: records.length > 0, query: query.q,
      records: records.map((record) => ({
        ...record, encodedId: encodeURIComponent(record.id), fields: recordFields(record).map(({ key, value }) => `${key}: ${value}`),
      })),
    }));
  });

  app.get('/documents/by_id/:id', async (req, res) => {
    validateFormat(req.query);
    if (Object.keys(req.query).some((key) => !['wt', 'moreLikeThis'].includes(key))) {
      throw new HttpError(400, 'Unsupported record parameter.');
    }
    if (req.query.moreLikeThis !== undefined && !['true', 'false'].includes(req.query.moreLikeThis as string)) {
      throw new HttpError(400, 'moreLikeThis must be true or false.');
    }
    if (req.query.moreLikeThis === 'true') {
      throw new HttpError(501, 'Automatic related-record discovery is not supported in this version.');
    }
    const id = req.params.id;
    // Validate the identifier without normalizing it: surrounding spaces can be part of a stored ID.
    boundedString(id, 'id');
    const result = await search.select(new URLSearchParams({ q: `id:${literal(id)}`, rows: '1' }));
    if (!result.records.length) throw new HttpError(404, 'Record not found.');
    const record = presentRecord(result.records[0]);
    if (record.id !== id) throw new HttpError(502, 'Search backend returned an unexpected record.');
    if (req.query.wt === 'json') { res.json({ record }); return; }
    res.type('html').send(mustache.render(templates.record, {
      id: record.id, encodedId: encodeURIComponent(record.id), record: recordFields(record), related: [], hasRelated: false,
    }));
  });

  app.get('/spatial', async (req, res) => {
    const result = await search.select(spatialQuery(req.query, config.maxResults));
    res.json({ numDocs: result.numFound, records: result.records.map(presentRecord) });
  });
  app.get('/map', (_req, res) => { res.sendFile(resolve(root, 'static/map.html')); });
  app.get('/visualize', (_req, res) => { res.sendFile(resolve(root, 'templates/pages/visualizer.html')); });
  app.get('/faq', (_req, res) => { res.sendFile(resolve(root, 'static/faq.html')); });
  app.get('/terms', (_req, res) => { res.sendFile(resolve(root, 'static/terms.html')); });

  app.use(['/export', '/exports', '/wallet'], (_req, res) => {
    res.status(410).json({ error: 'Legacy billing and bulk export features are unavailable in this version. See the roadmap.' });
  });
  app.use(['/donations', '/dear_peter', '/canary'], (_req, res) => {
    res.status(410).json({ error: 'This legacy page is not part of this version.' });
  });
  app.use((_req, _res, next) => { next(new HttpError(404, 'Not found.')); });
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
    if (res.headersSent) { next(error); return; }
    if (error instanceof HttpError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof URIError) { res.status(400).json({ error: 'Invalid request encoding.' }); return; }
    res.status(500).json({ error: 'An internal error occurred.' });
  };
  app.use(errorHandler);
  return app;
}
