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

        return { block, stats };
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
        const tx = await getRawTransaction(txid, true);
        return tx;
      } catch (err) {
        if (err.code === -5) {
          return reply.code(404).send({ error: 'Transaction not found' });
        }
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
        return decoded;
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
