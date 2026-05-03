import {
  getBlockchainInfo,
  getNetworkInfo,
  getMempoolInfo,
  getMiningInfo,
  getMemoryInfo,
  getUptime,
  getPeerInfo,
  getRawMempool,
  estimateSmartFee,
} from '../rpc/client.js';

export async function setupNodeRoutes(fastify) {
  // GET /api/node/ping — sem autenticação, usado para testar conectividade
  fastify.get('/api/node/ping', async (_req, reply) => {
    try {
      await getBlockchainInfo();
      return { connected: true };
    } catch (err) {
      return reply.code(200).send({ connected: false, error: err.message });
    }
  });

  fastify.get(
    '/api/node/status',
    { preHandler: [fastify.authenticate] },
    async (_req, reply) => {
      try {
        const [blockchain, network, mempool, mining, uptime] = await Promise.all([
          getBlockchainInfo(),
          getNetworkInfo(),
          getMempoolInfo(),
          getMiningInfo(),
          getUptime(),
        ]);
        return { blockchain, network, mempool, mining, uptime };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/node/peers',
    { preHandler: [fastify.authenticate] },
    async (_req, reply) => {
      try {
        const raw = await getPeerInfo();
        const peers = raw.map((p) => ({
          id: p.id,
          addr: p.addr,
          version: p.version,
          subver: p.subver,
          inbound: p.inbound,
          pingtime: p.pingtime,
          synced_headers: p.synced_headers,
          synced_blocks: p.synced_blocks,
          bytessent: p.bytessent,
          bytesrecv: p.bytesrecv,
          conntime: p.conntime,
        }));
        return { count: peers.length, peers };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/node/mempool',
    { preHandler: [fastify.authenticate] },
    async (_req, reply) => {
      try {
        const [info, rawTxs] = await Promise.all([
          getMempoolInfo(),
          getRawMempool(true),
        ]);

        const top = Object.entries(rawTxs)
          .map(([txid, tx]) => ({
            txid,
            vsize: tx.vsize,
            fee: tx.fee,
            feeRate: tx.fee / (tx.vsize / 1000),
            time: tx.time,
            descendantcount: tx.descendantcount,
          }))
          .sort((a, b) => b.feeRate - a.feeRate)
          .slice(0, 100);

        return { info, top };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/node/fees',
    { preHandler: [fastify.authenticate] },
    async (_req, reply) => {
      try {
        const [fast, medium, slow] = await Promise.all([
          estimateSmartFee(1),
          estimateSmartFee(6),
          estimateSmartFee(144),
        ]);

        const toSatVb = (r) =>
          r.feerate ? Math.round(r.feerate * 1e5) : null;

        return {
          fast:   { satVb: toSatVb(fast),   blocks: 1,   feerate: fast.feerate },
          medium: { satVb: toSatVb(medium), blocks: 6,   feerate: medium.feerate },
          slow:   { satVb: toSatVb(slow),   blocks: 144, feerate: slow.feerate },
        };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );

  fastify.get(
    '/api/node/memory',
    { preHandler: [fastify.authenticate] },
    async (_req, reply) => {
      try {
        const memory = await getMemoryInfo();
        return memory;
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
    }
  );
}
