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
          r.feerate != null && r.feerate > 0
            ? parseFloat((r.feerate * 1e5).toFixed(2))
            : null;

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

  fastify.get(
    '/api/node/health',
    { preHandler: [fastify.authenticate] },
    async (_req, reply) => {
      try {
        const [blockchain, network, mempool] = await Promise.all([
          getBlockchainInfo(),
          getNetworkInfo(),
          getMempoolInfo(),
        ]);

        const syncProgress = blockchain.verificationprogress ?? 0;
        const synced       = syncProgress >= 0.999;
        const syncing      = syncProgress >= 0.5 && !synced;
        const headerGap    = (blockchain.headers ?? 0) - (blockchain.blocks ?? 0);

        const peers    = network.connections ?? 0;
        const peersIn  = network.connections_in ?? 0;
        const peersOut = network.connections_out ?? 0;

        const mempoolSize = mempool.size ?? 0;
        const mempoolBytes = mempool.bytes ?? 0;
        const mempoolMaxMB = 300;
        const mempoolUsagePct = mempoolBytes / (mempoolMaxMB * 1e6) * 100;

        const checks = {
          sync: {
            status: synced ? 'green' : syncing ? 'yellow' : 'red',
            progress: Math.min(syncProgress * 100, 100),
            blocks: blockchain.blocks,
            headers: blockchain.headers,
            headerGap,
            label: synced
              ? 'Fully synced'
              : syncing
                ? `Syncing (${(syncProgress * 100).toFixed(2)}%)`
                : `Stalled or starting (${(syncProgress * 100).toFixed(2)}%)`,
          },
          peers: {
            status: peers >= 3 ? 'green' : peers >= 1 ? 'yellow' : 'red',
            total: peers,
            inbound: peersIn,
            outbound: peersOut,
            label: peers === 0
              ? 'No peers connected'
              : peers < 3
                ? `Low peers (${peers})`
                : `${peers} peers`,
          },
          mempool: {
            status: mempoolUsagePct < 70 ? 'green' : mempoolUsagePct < 90 ? 'yellow' : 'red',
            txCount: mempoolSize,
            bytes: mempoolBytes,
            usagePct: Math.round(mempoolUsagePct),
            label: mempoolUsagePct >= 90
              ? `Mempool congested (${Math.round(mempoolUsagePct)}%)`
              : `${mempoolSize.toLocaleString()} txs`,
          },
        };

        const statuses = [checks.sync.status, checks.peers.status, checks.mempool.status];
        let overall = 'green';
        if (statuses.includes('red')) overall = 'red';
        else if (statuses.includes('yellow')) overall = 'yellow';

        const summaryParts = [];
        if (checks.sync.status !== 'green') summaryParts.push(checks.sync.label);
        if (checks.peers.status !== 'green') summaryParts.push(checks.peers.label);
        if (checks.mempool.status !== 'green') summaryParts.push(checks.mempool.label);

        return {
          status: overall,
          summary: summaryParts.length ? summaryParts.join(' · ') : 'All systems healthy',
          checks,
        };
      } catch (err) {
        return {
          status: 'red',
          summary: 'Node unreachable',
          checks: {
            sync:    { status: 'red', progress: 0, blocks: 0, headers: 0, headerGap: 0, label: 'Unreachable' },
            peers:   { status: 'red', total: 0, inbound: 0, outbound: 0, label: 'Unreachable' },
            mempool: { status: 'red', txCount: 0, bytes: 0, usagePct: 0, label: 'Unreachable' },
          },
        };
      }
    }
  );
}
