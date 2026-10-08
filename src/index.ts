import { buildApp } from './app';
import { env } from './config/env';
import { initWebSocket } from './services/websocket';

const app = buildApp();

const server = app.listen(env.PORT, () => {
  initWebSocket(server);
  /* eslint-disable no-console */
  console.log(`\n🚀 DQBH API running on port ${env.PORT}  [${env.NODE_ENV}]`);
  console.log(`   Health:   http://localhost:${env.PORT}/health`);
  console.log(`   Ready:    http://localhost:${env.PORT}/health/ready`);
  console.log(`   Docs:     http://localhost:${env.PORT}/api/docs`);
  console.log(`   AI svc:   ${env.AI_SERVICE_URL}\n`);
  /* eslint-enable no-console */
});

// Graceful shutdown (Fluid/containerized friendly).
const shutdown = (sig: string) => {
  // eslint-disable-next-line no-console
  console.log(`\n${sig} received — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
