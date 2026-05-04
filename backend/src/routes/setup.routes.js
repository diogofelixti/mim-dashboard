import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import { saveConfigToDB } from '../config.js';
import { pool } from '../db/migrate.js';
import zmqSubscriber from '../zmq/subscriber.js';

const COMMON_CONF_PATHS = [
  '/root/.bitcoin/bitcoin.conf',
  '/home/bitcoin/.bitcoin/bitcoin.conf',
  '/home/user/.bitcoin/bitcoin.conf',
  '/bitcoin/.bitcoin/bitcoin.conf',
  '/data/bitcoin/bitcoin.conf',
];

export async function setupSetupRoutes(fastify) {
  // GET /api/setup/status — no auth required
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

  // GET /api/setup/detect — scans common bitcoin.conf paths, no auth
  fastify.get('/api/setup/detect', async (_req, _reply) => {
    const found = [];
    for (const p of COMMON_CONF_PATHS) {
      try {
        await fs.access(p);
        found.push(p);
      } catch { /* not found */ }
    }
    return { found, suggestions: COMMON_CONF_PATHS };
  });

  // POST /api/setup/test-rpc — tests RPC credentials, no auth
  fastify.post('/api/setup/test-rpc', async (request, reply) => {
    const { rpcHost, rpcPort, rpcUser, rpcPass } = request.body ?? {};
    if (!rpcHost || !rpcUser || !rpcPass) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass required' });
    }

    const url = `http://${rpcUser}:${rpcPass}@${rpcHost}:${rpcPort ?? 8332}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'getblockchaininfo', params: [], id: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      if (data.error) return reply.code(502).send({ error: data.error.message });
      return { connected: true, chain: data.result.chain, blocks: data.result.blocks };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // POST /api/setup/save — saves config + creates admin user, no auth
  fastify.post('/api/setup/save', async (request, reply) => {
    const {
      rpcHost, rpcPort, rpcUser, rpcPass,
      zmqBlockUrl, zmqTxUrl, zmqRawTxUrl,
      btcConfPath, password,
    } = request.body ?? {};

    if (!rpcHost || !rpcUser || !rpcPass || !password) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass and password required' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const configs = {
      rpc_host:       rpcHost,
      rpc_port:       rpcPort ?? 8332,
      rpc_user:       rpcUser,
      rpc_pass:       rpcPass,
      zmq_block_url:  zmqBlockUrl  ?? 'tcp://host.docker.internal:28332',
      zmq_tx_url:     zmqTxUrl     ?? 'tcp://host.docker.internal:28333',
      zmq_raw_tx_url: zmqRawTxUrl  ?? 'tcp://host.docker.internal:28334',
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
