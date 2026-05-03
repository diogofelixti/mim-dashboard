import 'dotenv/config';

const config = {
  server: {
    port: parseInt(process.env.BACKEND_PORT ?? '3001', 10),
    host: '0.0.0.0',
  },

  db: {
    url: process.env.DATABASE_URL,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
  },

  btc: {
    rpcHost: process.env.BTC_RPC_HOST ?? 'host.docker.internal',
    rpcPort: parseInt(process.env.BTC_RPC_PORT ?? '38332', 10),
    rpcUser: process.env.BTC_RPC_USER ?? '',
    rpcPass: process.env.BTC_RPC_PASS ?? '',
    get rpcUrl() {
      return `http://${this.rpcUser}:${this.rpcPass}@${this.rpcHost}:${this.rpcPort}`;
    },
    confPath: process.env.BTC_CONF_PATH ?? null,
  },

  zmq: {
    blockUrl: process.env.ZMQ_BLOCK_URL ?? 'tcp://host.docker.internal:28332',
    txUrl: process.env.ZMQ_TX_URL ?? 'tcp://host.docker.internal:28333',
    rawTxUrl: process.env.ZMQ_RAW_TX_URL ?? 'tcp://host.docker.internal:28334',
  },

  auth: {
    password: process.env.AUTH_PASSWORD ?? '',
    jwtSecret: process.env.JWT_SECRET ?? 'insecure-default-secret',
    jwtExpiry: '24h',
  },
};

export default config;
