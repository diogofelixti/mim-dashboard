import {
  getBlock,
  getBlockHash,
  getBlockCount,
  getBlockStats,
  getBestBlockHash,
  getRawTransaction,
  decodeRawTransaction,
  sendRawTransaction,
  sendToAddress,
  estimateSmartFee,
  rpcCall,
} from '../rpc/client.js';

const HEX64 = /^[0-9a-fA-F]{64}$/;

async function fetchBlockSummary(hash) {
  const [block, stats] = await Promise.all([
    getBlock(hash, 1),
    getBlockStats(hash, ['totalfee', 'avgfeerate', 'txs', 'total_size']),
  ]);
  return {
    height: block.height,
    hash: block.hash,
    time: block.time,
    nTx: block.nTx ?? block.tx?.length ?? 0,
    size: block.size,
    totalFees: (stats.totalfee ?? 0) / 1e8,
    avgFeeRate: stats.avgfeerate ?? 0,
  };
}

export async function setupBlockRoutes(fastify) {
  fastify.get(
    '/api/blocks',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const count = Math.min(parseInt(request.query.count ?? '10', 10), 50);
        const tip = await getBlockCount();

        const hashes = await Promise.all(
          Array.from({ length: count }, (_, i) => getBlockHash(tip - i))
        );

        const blocks = await Promise.all(hashes.map(fetchBlockSummary));
        return { tip, blocks };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/blocks/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        let hash;

        if (HEX64.test(id)) {
          hash = id;
        } else {
          const height = parseInt(id, 10);
          if (isNaN(height)) {
            return reply.code(400).send({ error: 'Invalid block id' });
          }
          hash = await getBlockHash(height);
        }

        const [block, stats] = await Promise.all([
          getBlock(hash, 2),
          getBlockStats(hash),
        ]);

        const txs = (block.tx ?? []).map((tx) => ({
          txid: tx.txid,
          totalOutput: (tx.vout ?? []).reduce((s, o) => s + (o.value ?? 0), 0),
          numInputs: (tx.vin ?? []).length,
          numOutputs: (tx.vout ?? []).length,
          vsize: tx.vsize ?? tx.size ?? 0,
          fee: tx.fee ?? 0,
        }));

        return {
          height: block.height,
          hash: block.hash,
          prevHash: block.previousblockhash ?? '',
          nextHash: block.nextblockhash ?? undefined,
          time: block.time,
          nTx: block.nTx ?? txs.length,
          size: block.size,
          weight: block.weight,
          difficulty: block.difficulty,
          totalFees: (stats.totalfee ?? 0) / 1e8,
          avgFeeRate: stats.avgfeerate ?? 0,
          txs,
        };
      } catch (err) {
        if (err.code === -5 || err.code === -8) {
          return reply.code(404).send({ error: 'Block not found' });
        }
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/tx/:txid',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      try {
        const { txid } = request.params;
        if (!HEX64.test(txid)) {
          return reply.code(400).send({ error: 'Invalid txid' });
        }

        const { blockhash } = request.query;
        let tx;
        try {
          // Verbosity 2 includes prevout data for inputs
          tx = blockhash
            ? await rpcCall('getrawtransaction', [txid, 2, blockhash])
            : await rpcCall('getrawtransaction', [txid, 2]);
        } catch (err) {
          if (err.code === -5) {
            return reply.code(404).send({
              error: 'Transaction not found. Enable txindex=1 in bitcoin.conf or access from a block page.',
            });
          }
          throw err;
        }

        // Resolve input addresses: use prevout if available, otherwise look up source tx
        const inputs = [];
        for (const inp of tx.vin ?? []) {
          if (!inp.txid) {
            inputs.push({ txid: 'coinbase', vout: 0, address: 'Coinbase', value: 0 });
            continue;
          }
          let address = inp.prevout?.scriptPubKey?.address ?? '';
          let value = inp.prevout?.value ?? 0;
          if (!address) {
            try {
              const srcTx = await getRawTransaction(inp.txid, true);
              const srcOut = srcTx.vout?.[inp.vout];
              if (srcOut) {
                address = srcOut.scriptPubKey?.address ?? srcOut.scriptPubKey?.addresses?.[0] ?? '';
                value = srcOut.value ?? 0;
              }
            } catch { /* source tx unavailable without txindex */ }
          }
          inputs.push({ txid: inp.txid, vout: inp.vout, address, value });
        }

        const confirmed = Boolean(tx.blockhash);
        const fee = tx.fee ?? 0;
        const feeRate = tx.vsize ? Math.round((fee * 1e8) / tx.vsize) : 0;

        return {
          txid: tx.txid,
          confirmed,
          blockHeight: tx.blockheight ?? undefined,
          blockHash: tx.blockhash ?? undefined,
          confirmations: tx.confirmations ?? 0,
          time: tx.time ?? tx.blocktime ?? undefined,
          size: tx.size,
          vsize: tx.vsize,
          weight: tx.weight,
          fee,
          feeRate,
          hex: tx.hex,
          inputs,
          outputs: (tx.vout ?? []).map((out) => ({
            n: out.n,
            value: out.value ?? 0,
            address: out.scriptPubKey?.address ?? out.scriptPubKey?.addresses?.[0] ?? '',
            spent: false,
          })),
        };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.post(
    '/api/tx/decode',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { hex } = request.body ?? {};
      if (!hex) return reply.code(400).send({ error: 'hex required' });
      try {
        const decoded = await decodeRawTransaction(hex);
        return {
          txid: decoded.txid,
          size: decoded.size,
          vsize: decoded.vsize,
          weight: decoded.weight,
          locktime: decoded.locktime,
          inputs: (decoded.vin ?? []).map((inp) => ({
            txid: inp.txid ?? 'coinbase',
            vout: inp.vout ?? 0,
            sequence: inp.sequence,
          })),
          outputs: (decoded.vout ?? []).map((out) => ({
            n: out.n,
            value: out.value,
            address: out.scriptPubKey?.address ?? out.scriptPubKey?.addresses?.[0] ?? '',
            type: out.scriptPubKey?.type ?? '',
          })),
        };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.post(
    '/api/tx/broadcast',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { hex } = request.body ?? {};
      if (!hex) return reply.code(400).send({ error: 'hex required' });
      try {
        const txid = await sendRawTransaction(hex);
        return { txid };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/search/:query',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { query } = request.params;

      // Tenta como height
      const height = parseInt(query, 10);
      if (!isNaN(height) && String(height) === query) {
        try {
          const hash = await getBlockHash(height);
          return { type: 'block', hash, height };
        } catch (_) { /* não é um height válido */ }
      }

      // Tenta como block hash
      if (HEX64.test(query)) {
        try {
          const block = await getBlock(query, 1);
          return { type: 'block', hash: block.hash, height: block.height };
        } catch (_) { /* não é um block hash */ }

        // Tenta como txid
        try {
          const tx = await getRawTransaction(query, true);
          return { type: 'tx', txid: tx.txid, blockhash: tx.blockhash };
        } catch (_) { /* não é um txid */ }
      }

      return reply.code(404).send({ error: 'Not found' });
    }
  );

  // POST /api/tx/send — generic send (wallet-agnostic, auto fee if not specified)
  fastify.post(
    '/api/tx/send',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { to, amount, feeRate, wallet = '' } = request.body ?? {};
      if (!to || amount == null) return reply.code(400).send({ error: 'to and amount required' });
      try {
        let comment = '';
        if (feeRate) {
          // Convert sat/vB fee rate to BTC fee — we pass it via subtractFeeFromAmount=false
          // Bitcoin Core doesn't accept feeRate directly in sendtoaddress; use setwalletfee workaround or just send
        }
        const txid = await sendToAddress(wallet || null, to, amount, comment);
        return { txid };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );
}
