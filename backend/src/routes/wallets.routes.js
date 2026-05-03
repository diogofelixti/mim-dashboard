import path from 'path';
import {
  listWallets,
  listWalletDir,
  createWallet,
  loadWallet,
  unloadWallet,
  getWalletInfo,
  getBalances,
  getNewAddress,
  listUnspent,
  listTransactions,
  sendToAddress,
  backupWallet,
  lockUnspent,
  listLockUnspent,
  walletCreateFundedPsbt,
  walletProcessPsbt,
  combinePsbt,
  finalizePsbt,
  decodePsbt,
} from '../rpc/client.js';

const auth = { preHandler: [/* populated in setupWalletRoutes */] };

export async function setupWalletRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  fastify.get('/api/wallets', protect, async (_req, reply) => {
    try {
      const [loaded, dir] = await Promise.all([listWallets(), listWalletDir()]);
      const available = dir.wallets.map((w) => w.name);
      return { loaded, available };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.get('/api/wallets/:name/info', protect, async (request, reply) => {
    const { name } = request.params;
    try {
      const [info, balances] = await Promise.all([
        getWalletInfo(name),
        getBalances(name),
      ]);
      return { info, balances };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/create', protect, async (request, reply) => {
    const {
      name,
      descriptors = true,
      blank = false,
      passphrase = '',
      disablePrivateKeys = false,
    } = request.body ?? {};
    if (!name) return reply.code(400).send({ error: 'name required' });
    try {
      const result = await createWallet(name, {
        descriptors,
        blank,
        passphrase,
        disablePrivateKeys,
      });
      return result;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/load', protect, async (request, reply) => {
    try {
      const result = await loadWallet(request.params.name);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/unload', protect, async (request, reply) => {
    try {
      const result = await unloadWallet(request.params.name);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/address', protect, async (request, reply) => {
    const { name } = request.params;
    const { label = '', type = 'bech32' } = request.body ?? {};
    try {
      const address = await getNewAddress(name, label, type);
      return { address };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.get('/api/wallets/:name/utxos', protect, async (request, reply) => {
    const { name } = request.params;
    try {
      const utxos = await listUnspent(name);
      const total = utxos.reduce((sum, u) => sum + u.amount, 0);
      return { count: utxos.length, total, utxos };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.get('/api/wallets/:name/transactions', protect, async (request, reply) => {
    const { name } = request.params;
    const count = Math.min(parseInt(request.query.count ?? '20', 10), 200);
    const skip = parseInt(request.query.skip ?? '0', 10);
    try {
      const txs = await listTransactions(name, count, skip);
      return { count: txs.length, transactions: txs };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/backup', protect, async (request, reply) => {
    const { name } = request.params;
    const filename = `wallet-${name}-${Date.now()}.dat`;
    const dest = path.join('/tmp', filename);
    try {
      await backupWallet(name, dest);
      return { path: dest, filename };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/send', protect, async (request, reply) => {
    const { name } = request.params;
    const { address, amount, comment = '' } = request.body ?? {};
    if (!address || amount == null) {
      return reply.code(400).send({ error: 'address and amount required' });
    }
    try {
      const txid = await sendToAddress(name, address, amount, comment);
      return { txid };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/psbt/create', protect, async (request, reply) => {
    const { name } = request.params;
    const { inputs = [], outputs, options = {} } = request.body ?? {};
    if (!outputs) return reply.code(400).send({ error: 'outputs required' });
    try {
      const result = await walletCreateFundedPsbt(name, inputs, outputs, options);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/psbt/process', protect, async (request, reply) => {
    const { name } = request.params;
    const { psbt, sign = true } = request.body ?? {};
    if (!psbt) return reply.code(400).send({ error: 'psbt required' });
    try {
      const result = await walletProcessPsbt(name, psbt, sign);
      return result;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/lockunspent', protect, async (request, reply) => {
    const { name } = request.params;
    const { unlock, outputs } = request.body ?? {};
    if (unlock == null || !outputs) {
      return reply.code(400).send({ error: 'unlock and outputs required' });
    }
    try {
      const result = await lockUnspent(name, unlock, outputs);
      return { success: result };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.get('/api/wallets/:name/locked', protect, async (request, reply) => {
    try {
      const locked = await listLockUnspent(request.params.name);
      return { count: locked.length, locked };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // ── PSBT sem wallet específica ──────────────────────────────────────────────
  fastify.post('/api/psbt/combine', protect, async (request, reply) => {
    const { psbts } = request.body ?? {};
    if (!psbts?.length) return reply.code(400).send({ error: 'psbts required' });
    try {
      return { psbt: await combinePsbt(psbts) };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/psbt/finalize', protect, async (request, reply) => {
    const { psbt, extract = true } = request.body ?? {};
    if (!psbt) return reply.code(400).send({ error: 'psbt required' });
    try {
      return await finalizePsbt(psbt, extract);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/psbt/decode', protect, async (request, reply) => {
    const { psbt } = request.body ?? {};
    if (!psbt) return reply.code(400).send({ error: 'psbt required' });
    try {
      return await decodePsbt(psbt);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });
}
