import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';

import config from './config.js';
import { migrate } from './db/migrate.js';
import { setupAuth, ensureAdminUser } from './auth/auth.js';
import { setupWebSocket } from './websocket/server.js';
import zmqSubscriber from './zmq/subscriber.js';

import { setupNodeRoutes } from './routes/node.routes.js';
import { setupBlockRoutes } from './routes/blocks.routes.js';
import { setupWalletRoutes } from './routes/wallets.routes.js';
import { setupWatchlistRoutes, setupAlertRoutes } from './routes/watchlist.routes.js';
import { setupPriceRoutes } from './routes/price.routes.js';

import { startFeeTracker, setupFeeHistoryRoutes } from './services/fee-tracker.js';
import { startAlertChecker } from './services/alert-checker.js';

const fastify = Fastify({
  logger: {
    level: 'info',
    transport: { target: 'pino-pretty', options: { colorize: true } },
  },
});

async function start() {
  try {
    await fastify.register(fastifyCors, { origin: true });

    await migrate();
    await ensureAdminUser();

    await setupAuth(fastify);
    await setupWebSocket(fastify);

    await setupNodeRoutes(fastify);
    await setupBlockRoutes(fastify);
    await setupWalletRoutes(fastify);
    await setupWatchlistRoutes(fastify);
    await setupAlertRoutes(fastify);
    await setupPriceRoutes(fastify);
    await setupFeeHistoryRoutes(fastify);

    fastify.get('/api/health', async () => ({ status: 'ok', ts: Date.now() }));

    await fastify.listen({ port: config.server.port, host: config.server.host });

    zmqSubscriber.start().catch((err) =>
      fastify.log.warn(`[zmq] start error: ${err.message}`)
    );
    startFeeTracker();
    startAlertChecker();
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

async function shutdown(signal) {
  fastify.log.info(`Received ${signal}, shutting down…`);
  zmqSubscriber.stop();
  await fastify.close();
  process.exit(0);
}

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

start();
