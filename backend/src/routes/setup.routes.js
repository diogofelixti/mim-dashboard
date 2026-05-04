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

const COOKIE_SUBPATH = {
  mainnet: '.cookie',
  signet:  'signet/.cookie',
  testnet: 'testnet3/.cookie',
};

export async function setupSetupRoutes(fastify) {
  // GET /api/setup/status — no auth
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
    return {
      found,
      paths_tried: COMMON_CONF_PATHS,
      hint: 'Backend runs inside Docker — host filesystem is not accessible. Enter the path manually or use RPC credentials directly.',
    };
  });

  // GET /api/setup/read-cookie?network=mainnet|signet|testnet — reads .cookie from mounted volume
  fastify.get('/api/setup/read-cookie', async (request, reply) => {
    const network = request.query.network ?? 'mainnet';
    const subpath = COOKIE_SUBPATH[network] ?? COOKIE_SUBPATH.mainnet;
    const cookiePath = `/bitcoin-data/${subpath}`;

    try {
      const content = await fs.readFile(cookiePath, 'utf8');
      const trimmed = content.trim();
      const colon = trimmed.indexOf(':');
      if (colon === -1) {
        return reply.code(400).send({ error: 'Cookie file format invalid (expected __cookie__:password)' });
      }
      const rpcUser = trimmed.slice(0, colon);
      const rpcPass = trimmed.slice(colon + 1);
      return { found: true, rpcUser, rpcPass, path: cookiePath };
    } catch {
      return reply.code(404).send({
        found: false,
        error: `Cookie not found at ${cookiePath}. Set BTC_DATA_DIR in .env and rebuild to mount your .bitcoin directory.`,
      });
    }
  });

  // POST /api/setup/test-rpc — tests RPC credentials, no auth
  fastify.post('/api/setup/test-rpc', async (request, reply) => {
    const { rpcHost, rpcPort, rpcUser, rpcPass } = request.body ?? {};
    if (!rpcHost || !rpcUser || !rpcPass) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass required' });
    }

    const url = `http://${rpcHost}:${rpcPort ?? 8332}`;
    const auth = 'Basic ' + Buffer.from(`${rpcUser}:${rpcPass}`).toString('base64');
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
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
      authType = 'userpass',
      btcNetwork = 'mainnet',
    } = request.body ?? {};

    if (!rpcHost || !rpcUser || !rpcPass || !password) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass and password required' });
    }
    if (password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const configs = {
      rpc_host:        rpcHost,
      rpc_port:        rpcPort ?? 8332,
      rpc_user:        rpcUser,
      rpc_pass:        rpcPass,
      zmq_block_url:   zmqBlockUrl  ?? 'tcp://host.docker.internal:28332',
      zmq_tx_url:      zmqTxUrl     ?? 'tcp://host.docker.internal:28333',
      zmq_raw_tx_url:  zmqRawTxUrl  ?? 'tcp://host.docker.internal:28334',
      auth_type:       authType,
      btc_network:     btcNetwork,
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
