import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';
import bcrypt from 'bcryptjs';
import { saveConfigToDB } from '../config.js';
import { pool } from '../db/migrate.js';
import zmqSubscriber from '../zmq/subscriber.js';

const HOST_PREFIX = '/host-fs';

const NETWORK_META = {
  mainnet: { section: 'main',   subdir: '',          port: 8332  },
  signet:  { section: 'signet', subdir: 'signet',    port: 38332 },
  testnet: { section: 'test',   subdir: 'testnet3',  port: 18332 },
};

function toDockerHost(url) {
  if (!url) return null;
  return url.replace(
    /^tcp:\/\/(0\.0\.0\.0|127\.0\.0\.1|localhost):/,
    'tcp://host.docker.internal:'
  );
}

// targetNetwork=null parses without section filtering (merges all sections)
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

  if (sectionName === null) {
    return { ...global, ...Object.values(sections).reduce((a, b) => ({ ...a, ...b }), {}) };
  }
  return { ...global, ...(sections[sectionName] ?? {}) };
}

function isLikelyBitcoinConf(raw) {
  const lower = raw.toLowerCase();
  return (
    lower.includes('rpcuser') ||
    lower.includes('rpcpassword') ||
    lower.includes('rpcport') ||
    lower.includes('datadir') ||
    lower.includes('signet=') ||
    lower.includes('testnet=') ||
    lower.includes('zmqpub') ||
    lower.includes('[main]') ||
    lower.includes('[test]') ||
    lower.includes('[signet]')
  );
}

function detectNetwork(parsed, confContainerPath) {
  if (parsed.signet === '1') return 'signet';
  if (parsed.testnet === '1') return 'testnet';
  if (confContainerPath.includes('/signet/')) return 'signet';
  if (confContainerPath.includes('/testnet3/') || confContainerPath.includes('/testnet/')) return 'testnet';
  return 'mainnet';
}

function findBitcoinConfPaths() {
  const results = new Set();

  // Home + root: deeper scan — usually fast on local filesystems
  try {
    const out = execSync(
      `find ${HOST_PREFIX}/home ${HOST_PREFIX}/root -maxdepth 6 -name bitcoin.conf 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 10000 }
    );
    out.trim().split('\n').filter(Boolean).forEach((p) => results.add(p));
  } catch { /* timeout or not found */ }

  // Mounted drives: shallow scan (depth 3) to avoid scanning large backups/libraries
  try {
    const out = execSync(
      `find ${HOST_PREFIX}/mnt ${HOST_PREFIX}/media -maxdepth 3 -name bitcoin.conf 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 5000 }
    );
    out.trim().split('\n').filter(Boolean).forEach((p) => results.add(p));
  } catch { /* timeout or not found */ }

  return [...results];
}

async function readCookieAt(containerPath) {
  try {
    const raw = await fs.readFile(containerPath, 'utf8');
    const t = raw.trim();
    const i = t.indexOf(':');
    if (i === -1) return null;
    return { user: t.slice(0, i), pass: t.slice(i + 1), containerPath };
  } catch {
    return null;
  }
}

function cookieCandidates(parsed, confDir, network) {
  const meta = NETWORK_META[network];
  const candidates = [];

  // If conf is already inside the network subdir, look there first
  if (meta?.subdir && confDir.endsWith('/' + meta.subdir)) {
    candidates.push(path.join(confDir, '.cookie'));
  }

  // Try network subdir under conf's parent
  if (meta?.subdir) {
    candidates.push(path.join(path.dirname(confDir), meta.subdir, '.cookie'));
    candidates.push(path.join(confDir, meta.subdir, '.cookie'));
  }

  // Conf dir itself
  candidates.push(path.join(confDir, '.cookie'));

  // If datadir is specified in conf, try there
  const datadir = parsed.datadir;
  if (datadir) {
    const hdDatadir = HOST_PREFIX + datadir;
    if (meta?.subdir) candidates.push(path.join(hdDatadir, meta.subdir, '.cookie'));
    candidates.push(path.join(hdDatadir, '.cookie'));
  }

  return [...new Set(candidates)];
}

async function buildNodeInfo(confContainerPath) {
  // Skip example/template configs shipped with Bitcoin Core binaries
  if (confContainerPath.includes('/share/examples/') || confContainerPath.includes('/contrib/')) return null;

  let raw = '';
  try { raw = await fs.readFile(confContainerPath, 'utf8'); }
  catch { return null; }

  if (!isLikelyBitcoinConf(raw)) return null;

  const parsedAll = parseBitcoinConf(raw, null);
  const network   = detectNetwork(parsedAll, confContainerPath);
  const parsed    = parseBitcoinConf(raw, network);

  const confDir = path.dirname(confContainerPath);
  const candidates = cookieCandidates(parsed, confDir, network);

  let cookie = null;
  for (const cp of candidates) {
    cookie = await readCookieAt(cp);
    if (cookie) break;
  }

  // Skip configs with no usable data (no credentials, no network/zmq settings, no cookie)
  const hasCredentials = parsed.rpcuser || parsed.rpcpassword;
  const hasSettings    = parsed.server || parsed.zmqpubhashblock || parsed.zmqpubhashtx || parsed.datadir;
  if (!hasCredentials && !hasSettings && !cookie) return null;

  const rpcUser = cookie?.user ?? parsed.rpcuser   ?? '';
  const rpcPass = cookie?.pass ?? parsed.rpcpassword ?? '';
  const authType = cookie ? 'cookie' : 'userpass';

  const defaultPort = NETWORK_META[network]?.port ?? 8332;
  const zmqBlock  = toDockerHost(parsed.zmqpubhashblock ?? parsed.zmqpubrawblock) ?? 'tcp://host.docker.internal:28332';
  const zmqTx     = toDockerHost(parsed.zmqpubhashtx)  ?? 'tcp://host.docker.internal:28333';
  const zmqRawTx  = toDockerHost(parsed.zmqpubrawtx)   ?? 'tcp://host.docker.internal:28334';
  const zmqDetected = Boolean(parsed.zmqpubhashblock || parsed.zmqpubhashtx || parsed.zmqpubrawtx);

  const hostConfPath = confContainerPath.replace(/^\/host-fs/, '');

  return {
    confPath:   hostConfPath,
    datadir:    parsed.datadir ?? path.dirname(hostConfPath),
    network,
    parsed,
    zmqDetected,
    cookie: cookie
      ? { found: true, user: cookie.user, path: cookie.containerPath.replace(/^\/host-fs/, '') }
      : { found: false },
    suggestedConfig: {
      rpc_host:       'host.docker.internal',
      rpc_port:       parsed.rpcport ? parseInt(parsed.rpcport, 10) : defaultPort,
      rpc_user:       rpcUser,
      rpc_pass:       rpcPass,
      auth_type:      authType,
      zmq_block_url:  zmqBlock,
      zmq_tx_url:     zmqTx,
      zmq_raw_tx_url: zmqRawTx,
      zmq_detected:   zmqDetected,
      cookie_path:    cookie ? cookie.containerPath : null,
    },
  };
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

  // GET /api/setup/detect — no auth
  fastify.get('/api/setup/detect', async () => {
    const confPaths = findBitcoinConfPaths();

    const results = await Promise.all(confPaths.map((p) => buildNodeInfo(p)));
    const nodes = results.filter(Boolean);

    // Deduplicate by confPath
    const seen = new Set();
    const uniqueNodes = nodes.filter((n) => {
      if (seen.has(n.confPath)) return false;
      seen.add(n.confPath);
      return true;
    });

    return {
      nodes: uniqueNodes,
      suggestedConfig: uniqueNodes[0]?.suggestedConfig ?? null,
    };
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
      btcConfPath, cookiePath, password,
      authType   = 'userpass',
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
    if (cookiePath)  configs.cookie_path   = cookiePath;

    await saveConfigToDB(configs);

    const hash = await bcrypt.hash(password, 12);
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ('admin', $1)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id`,
      [hash]
    );

    const userId = userRows[0].id;
    const { btcUnit = 'BTC', language = 'en' } = request.body ?? {};
    const settingsJson = JSON.stringify({
      btc_unit: btcUnit === 'sats' ? 'sats' : 'BTC',
      language: language === 'pt' ? 'pt' : 'en',
    });
    await pool.query(
      `INSERT INTO preferences (user_id, settings_json) VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET settings_json = preferences.settings_json || $2::jsonb`,
      [userId, settingsJson]
    );

    zmqSubscriber.stop();
    zmqSubscriber.start().catch((err) =>
      fastify.log.warn(`[zmq] reconnect error: ${err.message}`)
    );

    return { success: true };
  });
}
