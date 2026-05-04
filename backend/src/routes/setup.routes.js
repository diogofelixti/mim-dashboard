import fs from 'fs/promises';
import bcrypt from 'bcryptjs';
import { saveConfigToDB } from '../config.js';
import { pool } from '../db/migrate.js';
import zmqSubscriber from '../zmq/subscriber.js';

// Maps network name → conf section name + data subdirectory
const NETWORK_META = {
  mainnet: { section: 'main',   subdir: '',          port: 8332  },
  signet:  { section: 'signet', subdir: 'signet',    port: 38332 },
  testnet: { section: 'test',   subdir: 'testnet3',  port: 18332 },
};

function networkDir(network) {
  const sub = NETWORK_META[network]?.subdir ?? '';
  return sub ? `/bitcoin-data/${sub}` : '/bitcoin-data';
}

function cookieFilePath(network) {
  return `${networkDir(network)}/.cookie`;
}

function toDockerHost(url) {
  if (!url) return null;
  return url.replace(
    /^tcp:\/\/(0\.0\.0\.0|127\.0\.0\.1|localhost):/,
    'tcp://host.docker.internal:'
  );
}

// targetNetwork=null means parse everything (no section filtering — used for per-network conf files)
function parseBitcoinConf(raw, targetNetwork) {
  const sectionName = targetNetwork ? (NETWORK_META[targetNetwork]?.section ?? targetNetwork) : null;
  const global = {};
  const sections = {};
  let current = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const sm = line.match(/^\[(\w+)\]$/);
    if (sm) { current = sm[1]; sections[current] ??= {}; continue; }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim().toLowerCase();
    const v = line.slice(eq + 1).trim();
    if (current === null) global[k] = v;
    else (sections[current] ??= {})[k] = v;
  }

  // No section filter: return everything (global + all sections merged)
  if (sectionName === null) {
    return { ...global, ...Object.values(sections).reduce((a, b) => ({ ...a, ...b }), {}) };
  }

  return { ...global, ...(sections[sectionName] ?? {}) };
}

async function readCookieFile(network) {
  try {
    const raw = await fs.readFile(cookieFilePath(network), 'utf8');
    const t = raw.trim();
    const i = t.indexOf(':');
    if (i === -1) return null;
    return { user: t.slice(0, i), pass: t.slice(i + 1) };
  } catch {
    return null;
  }
}

export async function setupSetupRoutes(fastify) {
  // GET /api/setup/status — no auth
  fastify.get('/api/setup/status', async () => {
    try {
      const { rows } = await pool.query(
        `SELECT value FROM node_config WHERE key = 'setup_completed' LIMIT 1`
      );
      return { completed: rows[0]?.value === 'true' };
    } catch {
      return { completed: false };
    }
  });

  // GET /api/setup/detect?network=mainnet|signet|testnet — no auth
  fastify.get('/api/setup/detect', async (request) => {
    const network = request.query.network ?? 'mainnet';
    const defaultPort = NETWORK_META[network]?.port ?? 8332;
    const netDir = networkDir(network);

    // Read bitcoin.conf: check root first, then network subdirectory.
    // Many users keep a per-network conf at ~/.bitcoin/<network>/bitcoin.conf.
    // Merge both files; network-specific file takes precedence over root.
    let bitcoinConf = null;
    try {
      const paths = [
        '/bitcoin-data/bitcoin.conf',
        ...(netDir !== '/bitcoin-data' ? [`${netDir}/bitcoin.conf`] : []),
      ];

      let merged = {};
      let rawCombined = '';
      for (const p of paths) {
        try {
          const raw = await fs.readFile(p, 'utf8');
          if (raw.trim()) {
            rawCombined += (rawCombined ? '\n' : '') + `# from ${p}\n` + raw;
            // Network-specific conf is parsed as-is (no section filtering needed)
            const isNetSubdir = p.startsWith(netDir + '/');
            const parsed = isNetSubdir
              ? parseBitcoinConf(raw, null)   // parse without section filter
              : parseBitcoinConf(raw, network);
            merged = { ...merged, ...parsed };
          }
        } catch { /* file missing, skip */ }
      }

      if (Object.keys(merged).length > 0 || rawCombined) {
        bitcoinConf = {
          parsed: merged,
          zmqDetected: Boolean(merged.zmqpubhashblock || merged.zmqpubhashtx || merged.zmqpubrawtx),
        };
      }
    } catch { /* not mounted */ }

    // Read .cookie from network subdirectory
    const cookie = await readCookieFile(network);

    const p = bitcoinConf?.parsed ?? {};

    // Build suggested config — prefer cookie auth if available
    const rpcUser = cookie?.user ?? p.rpcuser ?? '';
    const rpcPass = cookie?.pass ?? p.rpcpassword ?? '';
    const authType = cookie ? 'cookie' : (rpcUser ? 'userpass' : 'userpass');

    const zmqBlock   = toDockerHost(p.zmqpubhashblock  ?? p.zmqpubrawblock)  ?? 'tcp://host.docker.internal:28332';
    const zmqTx      = toDockerHost(p.zmqpubhashtx)                          ?? 'tcp://host.docker.internal:28333';
    const zmqRawTx   = toDockerHost(p.zmqpubrawtx)                           ?? 'tcp://host.docker.internal:28334';

    const suggestedConfig = {
      rpc_host:       'host.docker.internal',
      rpc_port:       p.rpcport ? parseInt(p.rpcport, 10) : defaultPort,
      rpc_user:       rpcUser,
      rpc_pass:       rpcPass,
      auth_type:      authType,
      zmq_block_url:  zmqBlock,
      zmq_tx_url:     zmqTx,
      zmq_raw_tx_url: zmqRawTx,
      zmq_detected:   bitcoinConf?.zmqDetected ?? false,
    };

    return {
      found: !!(bitcoinConf || cookie),
      network,
      bitcoinConf: bitcoinConf
        ? { parsed: bitcoinConf.parsed, zmqDetected: bitcoinConf.zmqDetected }
        : null,
      cookie: cookie
        ? { found: true, user: cookie.user, path: cookieFilePath(network) }
        : { found: false },
      suggestedConfig,
      mountPath: '/bitcoin-data',
    };
  });

  // GET /api/setup/read-cookie?network=... — no auth, also useful post-setup
  fastify.get('/api/setup/read-cookie', async (request, reply) => {
    const network = request.query.network ?? 'mainnet';
    const cookie = await readCookieFile(network);
    if (!cookie) {
      return reply.code(404).send({
        found: false,
        error: `Cookie not found at ${cookieFilePath(network)}. Set BTC_DATA_DIR in .env and rebuild.`,
      });
    }
    return { found: true, user: cookie.user, pass: cookie.pass, path: cookieFilePath(network) };
  });

  // POST /api/setup/test-rpc — no auth
  fastify.post('/api/setup/test-rpc', async (request, reply) => {
    const { rpcHost, rpcPort, rpcUser, rpcPass } = request.body ?? {};
    if (!rpcHost || !rpcUser || !rpcPass) {
      return reply.code(400).send({ error: 'rpcHost, rpcUser, rpcPass required' });
    }
    const url  = `http://${rpcHost}:${rpcPort ?? 8332}`;
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

  // POST /api/setup/save — no auth
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
