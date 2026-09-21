import { closeDatabases } from '../db/index.js';
import { createApp } from './app.js';
import { closeCache, connectCache } from './cache.js';
import { config } from './config.js';

connectCache();
const server = createApp().listen(config.port, () => {
  console.log(`Movies API listening on http://localhost:${config.port}  (docs: /docs, graphql: /graphql)`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await closeCache();
    closeDatabases();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
