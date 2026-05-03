import config from '../config.js';

let _id = 0;

async function rpcCall(method, params = [], wallet = null) {
  const url = wallet
    ? `${config.btc.rpcUrl}/wallet/${encodeURIComponent(wallet)}`
    : config.btc.rpcUrl;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization:
        'Basic ' +
        Buffer.from(`${config.btc.rpcUser}:${config.btc.rpcPass}`).toString('base64'),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: ++_id,
      method,
      params,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`RPC HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();

  if (json.error) {
    const err = new Error(json.error.message ?? 'RPC error');
    err.code = json.error.code;
    throw err;
  }

  return json.result;
}

// ── Node info ────────────────────────────────────────────────────────────────
export const getBlockchainInfo  = ()        => rpcCall('getblockchaininfo');
export const getNetworkInfo     = ()        => rpcCall('getnetworkinfo');
export const getMempoolInfo     = ()        => rpcCall('getmempoolinfo');
export const getPeerInfo        = ()        => rpcCall('getpeerinfo');
export const getUptime          = ()        => rpcCall('uptime');
export const getMiningInfo      = ()        => rpcCall('getmininginfo');
export const getMemoryInfo      = ()        => rpcCall('getmemoryinfo');
export const getRawMempool      = (verbose = false) => rpcCall('getrawmempool', [verbose]);

// ── Blocks ────────────────────────────────────────────────────────────────────
export const getBlockCount      = ()              => rpcCall('getblockcount');
export const getBestBlockHash   = ()              => rpcCall('getbestblockhash');
export const getBlockHash       = (height)        => rpcCall('getblockhash', [height]);
export const getBlock           = (hash, verbosity = 1) => rpcCall('getblock', [hash, verbosity]);
export const getBlockStats      = (hashOrHeight, stats = null) =>
  stats ? rpcCall('getblockstats', [hashOrHeight, stats]) : rpcCall('getblockstats', [hashOrHeight]);

// ── Transactions ──────────────────────────────────────────────────────────────
export const getRawTransaction     = (txid, verbose = true) => rpcCall('getrawtransaction', [txid, verbose]);
export const decodeRawTransaction  = (hexstring)            => rpcCall('decoderawtransaction', [hexstring]);
export const sendRawTransaction    = (hexstring)            => rpcCall('sendrawtransaction', [hexstring]);
export const estimateSmartFee      = (confTarget, mode = 'ECONOMICAL') =>
  rpcCall('estimatesmartfee', [confTarget, mode]);

// ── Wallets ───────────────────────────────────────────────────────────────────
export const listWallets       = ()                         => rpcCall('listwallets');
export const listWalletDir     = ()                         => rpcCall('listwalletdir');
export const createWallet      = (name, opts = {})          => rpcCall('createwallet', [name, ...Object.values(opts)]);
export const loadWallet        = (filename)                 => rpcCall('loadwallet', [filename]);
export const unloadWallet      = (name)                     => rpcCall('unloadwallet', [name]);
export const getWalletInfo     = (wallet)                   => rpcCall('getwalletinfo', [], wallet);
export const getBalances       = (wallet)                   => rpcCall('getbalances', [], wallet);
export const getNewAddress     = (wallet, label = '', type = 'bech32') =>
  rpcCall('getnewaddress', [label, type], wallet);
export const listUnspent       = (wallet, min = 0, max = 9999999) =>
  rpcCall('listunspent', [min, max], wallet);
export const listTransactions  = (wallet, count = 20, skip = 0) =>
  rpcCall('listtransactions', ['*', count, skip, true], wallet);
export const getTransaction    = (wallet, txid)             => rpcCall('gettransaction', [txid, true], wallet);
export const backupWallet      = (wallet, dest)             => rpcCall('backupwallet', [dest], wallet);
export const lockUnspent       = (wallet, unlock, outputs)  => rpcCall('lockunspent', [unlock, outputs], wallet);
export const listLockUnspent   = (wallet)                   => rpcCall('listlockunspent', [], wallet);

// ── PSBT ──────────────────────────────────────────────────────────────────────
export const walletCreateFundedPsbt = (wallet, inputs, outputs, opts = {}) =>
  rpcCall('walletcreatefundedpsbt', [inputs, outputs, 0, opts], wallet);
export const walletProcessPsbt      = (wallet, psbt, sign = true) =>
  rpcCall('walletprocesspsbt', [psbt, sign], wallet);
export const combinePsbt            = (psbts)               => rpcCall('combinepsbt', [psbts]);
export const finalizePsbt           = (psbt, extract = true) => rpcCall('finalizepsbt', [psbt, extract]);
export const decodePsbt             = (psbt)                => rpcCall('decodepsbt', [psbt]);
export const sendToAddress          = (wallet, address, amount, comment = '') =>
  rpcCall('sendtoaddress', [address, amount, comment], wallet);

export { rpcCall };
