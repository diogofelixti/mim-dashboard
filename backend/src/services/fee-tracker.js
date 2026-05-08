import { pool } from '../db/migrate.js';
import { estimateSmartFee, getMempoolInfo, getBlockCount } from '../rpc/client.js';
import zmqSubscriber from '../zmq/subscriber.js';

const INTERVAL_MS = 5 * 60 * 1000;

export async function recordFees() {
  try {
    const [fast, medium, slow, mempool, height] = await Promise.all([
      estimateSmartFee(1),
      estimateSmartFee(6),
      estimateSmartFee(144),
      getMempoolInfo(),
      getBlockCount(),
    ]);

    await pool.query(
      `INSERT INTO fee_history (height, fast, medium, slow, mempool_size)
            VALUES ($1, $2, $3, $4, $5)`,
      [
        height,
        fast.feerate   > 0 ? parseFloat((fast.feerate * 1e5).toFixed(2))   : 0,
        medium.feerate > 0 ? parseFloat((medium.feerate * 1e5).toFixed(2)) : 0,
        slow.feerate   > 0 ? parseFloat((slow.feerate * 1e5).toFixed(2))   : 0,
        mempool.size ?? 0,
      ]
    );
  } catch (err) {
    console.error('[fee-tracker] recordFees error:', err.message);
  }
}

export async function recordBlock(blockData) {
  try {
    await pool.query(
      `INSERT INTO blocks_log (height, hash, block_timestamp, num_txs, total_fees, size)
            VALUES ($1, $2, to_timestamp($3), $4, $5, $6)
       ON CONFLICT (height) DO NOTHING`,
      [
        blockData.height,
        blockData.hash,
        blockData.time,
        blockData.nTx,
        blockData.totalFees,
        blockData.size,
      ]
    );
  } catch (err) {
    console.error('[fee-tracker] recordBlock error:', err.message);
  }

  await recordFees();
}

export function startFeeTracker() {
  zmqSubscriber.on('block', (data) => recordBlock(data));

  const interval = setInterval(recordFees, INTERVAL_MS);
  interval.unref();

  recordFees().catch(() => {});

  console.log('[fee-tracker] Started — recording every 5 min + on each block.');
}

export function setupFeeHistoryRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  fastify.get('/api/fees/history', protect, async (request, reply) => {
    const hours = Math.min(parseInt(request.query.hours ?? '24', 10), 720);
    try {
      const { rows } = await pool.query(
        `SELECT id, height, recorded_at, fast, medium, slow, mempool_size
           FROM fee_history
          WHERE recorded_at >= NOW() - ($1 || ' hours')::INTERVAL
          ORDER BY recorded_at ASC`,
        [hours]
      );
      return rows;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/api/blocks/log', protect, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
    try {
      const { rows } = await pool.query(
        `SELECT id, height, hash, block_timestamp, num_txs, total_fees, size, received_at
           FROM blocks_log
          ORDER BY height DESC
          LIMIT $1`,
        [limit]
      );
      return rows;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
