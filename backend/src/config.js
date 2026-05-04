import 'dotenv/config';

// Pool injected by index.js after DB is ready — avoids circular dependency
let _pool = null;
export function _setPool(pool) { _pool = pool; }

const config = {
  server: {
    port: parseInt(process.env.BACKEND_PORT ?? '3001', 10),
    host: '0.0.0.0',
  },

  db: {
    url:      process.env.DATABASE_URL,
    name:     process.env.DB_NAME,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host:     process.env.DB_HOST ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432', 10),
  },

  // Defaults — overwritten by loadConfigFromDB() at startup
  btc: {
    rpcHost:  process.env.BTC_RPC_HOST ?? 'host.docker.internal',
    rpcPort:  parseInt(process.env.BTC_RPC_PORT ?? '8332', 10),
    rpcUser:  process.env.BTC_RPC_USER ?? '',
    rpcPass:  process.env.BTC_RPC_PASS ?? '',
    confPath: process.env.BTC_CONF_PATH ?? null,
    get rpcUrl() {
      return `http://${this.rpcUser}:${this.rpcPass}@${this.rpcHost}:${this.rpcPort}`;
    },
  },

  zmq: {
    blockUrl: process.env.ZMQ_BLOCK_URL ?? 'tcp://host.docker.internal:28332',
    txUrl:    process.env.ZMQ_TX_URL    ?? 'tcp://host.docker.internal:28333',
    rawTxUrl: process.env.ZMQ_RAW_TX_URL ?? 'tcp://host.docker.internal:28334',
  },

  auth: {
    // AUTH_PASSWORD only used as fallback for legacy .env setups
    password:  process.env.AUTH_PASSWORD ?? '',
    jwtSecret: process.env.JWT_SECRET ?? 'insecure-default-secret',
    jwtExpiry: '24h',
  },
};

// Maps node_config DB keys → config object paths
const KEY_MAP = {
  rpc_host:       (v) => { config.btc.rpcHost  = v; },
  rpc_port:       (v) => { config.btc.rpcPort  = parseInt(v, 10); },
  rpc_user:       (v) => { config.btc.rpcUser  = v; },
  rpc_pass:       (v) => { config.btc.rpcPass  = v; },
  btc_conf_path:  (v) => { config.btc.confPath = v || null; },
  zmq_block_url:  (v) => { config.zmq.blockUrl = v; },
  zmq_tx_url:     (v) => { config.zmq.txUrl    = v; },
  zmq_raw_tx_url: (v) => { config.zmq.rawTxUrl = v; },
};

export async function loadConfigFromDB() {
  if (!_pool) return;
  try {
    const { rows } = await _pool.query('SELECT key, value FROM node_config');
    for (const { key, value } of rows) {
      KEY_MAP[key]?.(value);
    }
    console.log('[config] Loaded from DB.');
  } catch (err) {
    console.warn('[config] Could not load from DB:', err.message);
  }
}

export async function saveConfigToDB(configs) {
  if (!_pool) throw new Error('DB not initialized');
  for (const [key, value] of Object.entries(configs)) {
    await _pool.query(
      `INSERT INTO node_config (key, value, updated_at)
            VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, String(value)]
    );
    KEY_MAP[key]?.(String(value));
  }
}

export async function getNodeConfigFromDB() {
  if (!_pool) return {};
  const { rows } = await _pool.query('SELECT key, value FROM node_config');
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
}

export default config;
