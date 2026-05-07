import path from 'path';
import fs from 'fs';
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
  analyzePsbt,
  sendRawTransaction,
  rpcCall,
} from '../rpc/client.js';

const auth = { preHandler: [/* populated in setupWalletRoutes */] };

export async function setupWalletRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  fastify.get('/api/wallets', protect, async (_req, reply) => {
    try {
      const [loaded, dir] = await Promise.all([listWallets(), listWalletDir()]);
      const available = dir.wallets.map((w) => w.name);
      return { loaded, available, wallets: loaded };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // POST /api/wallets — create (frontend compat alias for /api/wallets/create)
  fastify.post('/api/wallets', protect, async (request, reply) => {
    const { name, descriptors = true, blank = false, passphrase = '', disablePrivateKeys = false } = request.body ?? {};
    if (!name) return reply.code(400).send({ error: 'name required' });
    try {
      const result = await createWallet(name, { descriptors, blank, passphrase, disablePrivateKeys });
      return result;
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.get('/api/wallets/:name/info', protect, async (request, reply) => {
    const { name } = request.params;
    try {
      const [info, balances] = await Promise.all([getWalletInfo(name), getBalances(name)]);
      return { info, balances };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // GET /api/wallets/:name/balance — shaped for frontend
  fastify.get('/api/wallets/:name/balance', protect, async (request, reply) => {
    const { name } = request.params;
    try {
      const [balances, utxos] = await Promise.all([getBalances(name), listUnspent(name)]);
      const m = balances.mine ?? {};
      return {
        confirmed:   m.trusted           ?? 0,
        unconfirmed: m.untrusted_pending  ?? 0,
        immature:    m.immature           ?? 0,
        utxoCount:   utxos.length,
      };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // GET /api/wallets/:name/addresses — list receive addresses
  fastify.get('/api/wallets/:name/addresses', protect, async (request, reply) => {
    const { name } = request.params;
    try {
      const received = await rpcCall('listreceivedbyaddress', [0, true, false], name);
      const addresses = received.map((r) => ({
        address: r.address,
        label:   r.label ?? '',
        type:    'unknown',
        used:    r.amount > 0 || r.confirmations > 0,
      }));
      return { addresses };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // GET /api/wallets/:name/history — alias for /transactions, shaped for frontend
  fastify.get('/api/wallets/:name/history', protect, async (request, reply) => {
    const { name } = request.params;
    const limit = Math.min(parseInt(request.query.limit ?? '20', 10), 200);
    try {
      const raw = await listTransactions(name, limit, 0);
      const txs = raw.map((t) => ({
        txid:          t.txid,
        category:      t.category,
        amount:        t.amount,
        confirmations: t.confirmations,
        time:          t.time ?? t.blocktime ?? 0,
        address:       t.address ?? '',
      }));
      return { txs };
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
      const [utxos, lockedList] = await Promise.all([
        listUnspent(name),
        listLockUnspent(name),
      ]);
      const lockedSet = new Set(lockedList.map((l) => `${l.txid}:${l.vout}`));
      const shaped = utxos
        .map((u) => ({
          txid:          u.txid,
          vout:          u.vout,
          address:       u.address,
          label:         u.label ?? '',
          amount:        u.amount,
          amount_sats:   Math.round(u.amount * 1e8),
          confirmations: u.confirmations,
          spendable:     u.spendable ?? true,
          solvable:      u.solvable ?? true,
          safe:          u.safe ?? true,
          locked:        lockedSet.has(`${u.txid}:${u.vout}`),
        }))
        .sort((a, b) => b.confirmations - a.confirmations);
      const total_btc  = shaped.reduce((s, u) => s + u.amount, 0);
      const total_sats = shaped.reduce((s, u) => s + u.amount_sats, 0);
      return { count: shaped.length, total_btc, total_sats, utxos: shaped };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // POST /api/wallets/:name/utxos/lock  — lock a specific UTXO
  fastify.post('/api/wallets/:name/utxos/lock', protect, async (request, reply) => {
    const { name } = request.params;
    const { txid, vout } = request.body ?? {};
    if (!txid || vout == null) return reply.code(400).send({ error: 'txid and vout required' });
    try {
      const ok = await lockUnspent(name, false, [{ txid, vout }]);
      return { success: ok };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // POST /api/wallets/:name/utxos/unlock — unlock a specific UTXO
  fastify.post('/api/wallets/:name/utxos/unlock', protect, async (request, reply) => {
    const { name } = request.params;
    const { txid, vout } = request.body ?? {};
    if (!txid || vout == null) return reply.code(400).send({ error: 'txid and vout required' });
    try {
      const ok = await lockUnspent(name, true, [{ txid, vout }]);
      return { success: ok };
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
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
    const filename = `wallet-${safeName}-${Date.now()}.dat`;
    const hostPath = path.join('/tmp', filename);
    const containerPath = path.join('/host-fs/tmp', filename);
    try {
      await backupWallet(name, hostPath);
      const stat = fs.statSync(containerPath);
      const stream = fs.createReadStream(containerPath);
      reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .header('Content-Length', stat.size);
      return reply.send(stream);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  fastify.post('/api/wallets/:name/send', protect, async (request, reply) => {
    const { name } = request.params;
    const { address, amount, comment = '', inputs, fee_rate, replaceable } = request.body ?? {};
    if (!address || amount == null) {
      return reply.code(400).send({ error: 'address and amount required' });
    }
    try {
      if (inputs && inputs.length > 0) {
        const outputs = [{ [address]: parseFloat(amount) }];
        const opts = {};
        if (fee_rate != null) opts.fee_rate = parseFloat(fee_rate);
        if (replaceable != null) opts.replaceable = replaceable;
        const funded = await walletCreateFundedPsbt(name, inputs, outputs, opts);
        const signed = await walletProcessPsbt(name, funded.psbt, true);
        if (!signed.complete) {
          return reply.code(400).send({ error: 'Could not fully sign transaction. Missing keys?' });
        }
        const finalized = await finalizePsbt(signed.psbt, true);
        const txid = await sendRawTransaction(finalized.hex);
        return { txid };
      }
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

  fastify.post('/api/psbt/analyze', protect, async (request, reply) => {
    const { psbt } = request.body ?? {};
    if (!psbt) return reply.code(400).send({ error: 'psbt required' });
    try {
      return await analyzePsbt(psbt);
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // POST /api/psbt/create — wallet-aware (wallet optional in body)
  fastify.post('/api/psbt/create', protect, async (request, reply) => {
    const { inputs = [], outputs, locktime, wallet = '', options = {} } = request.body ?? {};
    if (!outputs?.length) return reply.code(400).send({ error: 'outputs required' });
    const opts = locktime != null ? { ...options, locktime } : options;
    try {
      const result = await walletCreateFundedPsbt(wallet || null, inputs, outputs, opts);
      return { psbt: result.psbt ?? result };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });

  // POST /api/psbt/sign — sign with node wallet (wallet optional in body)
  fastify.post('/api/psbt/sign', protect, async (request, reply) => {
    const { psbt, wallet = '', sign = true } = request.body ?? {};
    if (!psbt) return reply.code(400).send({ error: 'psbt required' });
    try {
      const result = await walletProcessPsbt(wallet || null, psbt, sign);
      return { psbt: result.psbt, complete: result.complete };
    } catch (err) {
      return reply.code(502).send({ error: err.message });
    }
  });
}
