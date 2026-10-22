// Modified for the 2026 modernization; see NOTICE and CHANGELOG.md.
import { createServer } from 'node:http';
import { createApp } from './src/app';
import { readConfig } from './src/config';

function main(): void {
  const config = readConfig();
  const server = createServer(createApp(config));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('error', () => {
    console.error('The HTTP server could not start or encountered a network error.');
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    console.log(`Search server listening on ${config.host}:${config.port}.`);
  });
  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('Stopping search server.');
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      process.exitCode = 1;
    }, 10000);
    deadline.unref();
    server.close(() => { clearTimeout(deadline); });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

try {
  main();
} catch (error) {
  // Config errors contain only fixed messages and field names, never configured secrets.
  console.error(error instanceof Error ? error.message : 'Unable to start search server.');
  process.exitCode = 1;
}
