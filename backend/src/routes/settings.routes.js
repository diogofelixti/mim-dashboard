import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import config, { saveConfigToDB, getNodeConfigFromDB } from '../config.js';
import { pool } from '../db/migrate.js';
import { getBlockchainInfo } from '../rpc/client.js';
import zmqSubscriber from '../zmq/subscriber.js';

export async function setupSettingsRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  // ── bitcoin.conf ────────────────────────────────────────────────────────────

  fastify.get('/api/settings/bitcoin-conf', protect, async (_req, reply) => {
    if (!config.btc.confPath) {
      return reply.code(503).send({ error: 'BTC_CONF_PATH not configured' });
    }
    try {
      const conf = await fs.readFile('/host-fs' + config.btc.confPath, 'utf8');
      return { conf };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.put('/api/settings/bitcoin-conf', protect, async (_req, reply) => {
    return reply.code(503).send({ error: 'bitcoin.conf is mounted read-only — edit it directly on the host' });
  });

  // ── Preferences ─────────────────────────────────────────────────────────────

  fastify.get('/api/settings/preferences', protect, async (request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT theme, default_currency AS currency FROM preferences WHERE user_id = $1 LIMIT 1`,
        [request.user.id]
      );
      if (rows.length === 0) return { theme: 'dark', currency: 'usd' };
      return { theme: rows[0].theme, currency: (rows[0].currency ?? 'usd').toLowerCase() };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.put('/api/settings/preferences', protect, async (request, reply) => {
    const { theme = 'dark', currency = 'usd' } = request.body ?? {};
    try {
      await pool.query(
        `INSERT INTO preferences (user_id, theme, default_currency)
              VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO UPDATE
            SET theme = EXCLUDED.theme, default_currency = EXCLUDED.default_currency`,
        [request.user.id, theme, currency.toUpperCase()]
      );
      return { success: true };
    } catch (err) {
      // preferences table may not have a unique constraint on user_id — try upsert differently
      try {
        const { rows } = await pool.query(
          `SELECT id FROM preferences WHERE user_id = $1 LIMIT 1`,
          [request.user.id]
        );
        if (rows.length === 0) {
          await pool.query(
            `INSERT INTO preferences (user_id, theme, default_currency) VALUES ($1, $2, $3)`,
            [request.user.id, theme, currency.toUpperCase()]
          );
        } else {
          await pool.query(
            `UPDATE preferences SET theme = $1, default_currency = $2 WHERE user_id = $3`,
            [theme, currency.toUpperCase(), request.user.id]
          );
        }
        return { success: true };
      } catch (e2) {
        return reply.code(500).send({ error: e2.message });
      }
    }
  });

  // ── RPC connection info ──────────────────────────────────────────────────────

  fastify.get('/api/settings/rpc', protect, async (_req, reply) => {
    let connected = false;
    let network = 'unknown';
    try {
      const info = await getBlockchainInfo();
      connected = true;
      network = info.chain ?? 'unknown';
    } catch (_) { /* not connected */ }

    return {
      host:      config.btc.rpcHost,
      port:      config.btc.rpcPort,
      network,
      connected,
    };
  });

  fastify.post('/api/settings/rpc/test', protect, async (_req, reply) => {
    try {
      await getBlockchainInfo();
      return { connected: true };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // ── Node config (RPC + ZMQ) ─────────────────────────────────────────────────

  fastify.get('/api/settings/node-config', protect, async (_req, reply) => {
    try {
      const raw = await getNodeConfigFromDB();
      return {
        rpcHost:    raw.rpc_host    ?? config.btc.rpcHost,
        rpcPort:    raw.rpc_port    ?? String(config.btc.rpcPort),
        rpcUser:    raw.rpc_user    ?? config.btc.rpcUser,
        rpcPass:    raw.rpc_pass    ?? config.btc.rpcPass,
        btcConfPath: raw.btc_conf_path ?? config.btc.confPath ?? '',
        zmqBlockUrl:  raw.zmq_block_url  ?? config.zmq.blockUrl,
        zmqTxUrl:     raw.zmq_tx_url     ?? config.zmq.txUrl,
        zmqRawTxUrl:  raw.zmq_raw_tx_url ?? config.zmq.rawTxUrl,
      };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.put('/api/settings/node-config', protect, async (request, reply) => {
    const {
      rpcHost, rpcPort, rpcUser, rpcPass,
      btcConfPath, zmqBlockUrl, zmqTxUrl, zmqRawTxUrl,
    } = request.body ?? {};

    if (!rpcHost || !rpcUser || !rpcPass) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass required' });
    }

    const configs = {
      rpc_host: rpcHost,
      rpc_port: rpcPort ?? 8332,
      rpc_user: rpcUser,
      rpc_pass: rpcPass,
    };
    if (zmqBlockUrl)  configs.zmq_block_url  = zmqBlockUrl;
    if (zmqTxUrl)     configs.zmq_tx_url     = zmqTxUrl;
    if (zmqRawTxUrl)  configs.zmq_raw_tx_url = zmqRawTxUrl;
    if (btcConfPath !== undefined) configs.btc_conf_path = btcConfPath;

    try {
      await saveConfigToDB(configs);
      zmqSubscriber.stop();
      zmqSubscriber.start().catch((err) =>
        fastify.log.warn(`[zmq] reconnect error: ${err.message}`)
      );
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Change password ──────────────────────────────────────────────────────────
  // Frontend sends { current, next } — maps to auth logic

  fastify.put('/api/settings/password', protect, async (request, reply) => {
    const { current, next } = request.body ?? {};
    if (!current || !next) {
      return reply.code(400).send({ error: 'current and next required' });
    }
    if (next.length < 8) {
      return reply.code(400).send({ error: 'New password must be at least 8 characters' });
    }

    const { rows } = await pool.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [request.user.id]
    );
    if (!rows.length) return reply.code(404).send({ error: 'User not found' });

    const valid = await bcrypt.compare(current, rows[0].password_hash);
    if (!valid) return reply.code(401).send({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(next, 12);
    await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, request.user.id]);
    return { success: true };
  });
}
