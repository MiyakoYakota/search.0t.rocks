import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { AppConfig } from './config';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function authentication(config: AppConfig): RequestHandler {
  const expected = digest(config.apiToken);
  return (req, res, next) => {
    if (config.allowAnonymous) { next(); return; }
    const header = req.get('authorization');
    let token: string | undefined;
    if (header && header.length <= 1024) {
      const bearer = /^Bearer ([\x21-\x7e]+)$/i.exec(header);
      if (bearer) token = bearer[1];
      else {
        const basic = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
        if (basic) {
          const credentials = Buffer.from(basic[1]!, 'base64').toString('utf8');
          if (credentials.startsWith('operator:')) token = credentials.slice('operator:'.length);
        }
      }
    }
    if (token !== undefined && timingSafeEqual(expected, digest(token))) { next(); return; }
    res.setHeader('WWW-Authenticate', 'Basic realm="Private Search", charset="UTF-8"');
    res.status(401).json({ error: 'Authentication required. Use the operator login or an Authorization Bearer token.' });
  };
}

/** A single-process limiter with bounded storage; deploy one web replica or enforce a shared edge limit. */
export function rateLimit(config: AppConfig, now: () => number = Date.now): RequestHandler {
  const windows = new Map<string, { resetAt: number; requests: number }>();
  let nextSweep = 0;
  return (req, res, next) => {
    const timestamp = now();
    if (timestamp >= nextSweep) {
      for (const [key, window] of windows) if (window.resetAt <= timestamp) windows.delete(key);
      nextSweep = timestamp + Math.min(config.rateLimitWindowMs, 1000);
    }
    // Express derives req.ip from the socket unless TRUST_PROXY explicitly names trusted peers.
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let window = windows.get(key);
    if (!window || window.resetAt <= timestamp) {
      if (!window && windows.size >= 10000) {
        res.setHeader('Retry-After', String(Math.ceil(config.rateLimitWindowMs / 1000)));
        res.status(503).json({ error: 'Request capacity reached. Please retry later.' });
        return;
      }
      window = { resetAt: timestamp + config.rateLimitWindowMs, requests: 0 };
      windows.set(key, window);
    }
    window.requests += 1;
    res.setHeader('RateLimit-Limit', String(config.rateLimitMax));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, config.rateLimitMax - window.requests)));
    if (window.requests > config.rateLimitMax) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((window.resetAt - timestamp) / 1000))));
      res.status(429).json({ error: 'Too many requests. Please retry later.' });
      return;
    }
    next();
  };
}
