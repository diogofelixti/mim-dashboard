import bcrypt from 'bcryptjs';
import { saveConfigToDB } from '../config.js';
import { pool } from '../db/migrate.js';
import zmqSubscriber from '../zmq/subscriber.js';

export async function setupSetupRoutes(fastify) {
  fastify.get('/api/setup/status', async (_req, _reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT value FROM node_config WHERE key = 'setup_completed' LIMIT 1`
      );
      return { completed: rows[0]?.value === 'true' };
    } catch (_) {
      return { completed: false };
    }
  });

  fastify.post('/api/setup/save', async (request, reply) => {
    const {
      rpcHost,
      rpcPort,
      rpcUser,
      rpcPass,
      zmqBlockUrl,
      zmqTxUrl,
      zmqRawTxUrl,
      btcConfPath,
      password,
    } = request.body ?? {};

    if (!rpcHost || !rpcUser || !rpcPass || !password) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass and password required' });
    }

    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const configs = {
      rpc_host: rpcHost,
      rpc_port: rpcPort ?? 8332,
      rpc_user: rpcUser,
      rpc_pass: rpcPass,
      zmq_block_url: zmqBlockUrl ?? 'tcp://host.docker.internal:28332',
      zmq_tx_url:    zmqTxUrl    ?? 'tcp://host.docker.internal:28333',
      zmq_raw_tx_url: zmqRawTxUrl ?? 'tcp://host.docker.internal:28334',
      setup_completed: 'true',
    };
    if (btcConfPath) configs.btc_conf_path = btcConfPath;

    await saveConfigToDB(configs);

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ('admin', $1)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [hash]
    );

    zmqSubscriber.stop();
    zmqSubscriber.start().catch((err) =>
      fastify.log.warn(`[zmq] reconnect error: ${err.message}`)
    );

    return { success: true };
  });
}
