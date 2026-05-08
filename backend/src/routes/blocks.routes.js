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
import { pool } from '../db/migrate.js';

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

      // Tenta como endereço Bitcoin (sem scan — a página de endereço faz o scan)
      try {
        const info = await rpcCall('validateaddress', [query]);
        if (info.isvalid) {
          return { type: 'address', address: query };
        }
      } catch (_) { /* não é um endereço válido */ }

      return reply.code(404).send({ error: 'Not found' });
    }
  );

  // GET /api/address/:addr — address info via scantxoutset
  fastify.get(
    '/api/address/:addr',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { addr } = request.params;
      try {
        const info = await rpcCall('validateaddress', [addr]);
        if (!info.isvalid) return reply.code(400).send({ error: 'Invalid address' });

        let utxos = [];
        let total_amount = 0;
        // Retry scantxoutset if a previous scan is still in progress
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
            const scan = await rpcCall('scantxoutset', ['start', [`addr(${addr})`]]);
            total_amount = scan.total_amount ?? 0;
            utxos = (scan.unspents ?? []).map((u) => ({
              txid: u.txid,
              vout: u.vout,
              amount: u.amount,
              height: u.height,
            }));
            break;
          } catch (err) {
            if (attempt < 2 && err.message?.includes('already in progress')) {
              try { await rpcCall('scantxoutset', ['abort']); } catch (_) {}
              continue;
            }
            console.warn('[address] scantxoutset failed:', err.message);
            break;
          }
        }

        return {
          address: addr,
          scriptPubKey: info.scriptPubKey,
          isscript: info.isscript,
          iswitness: info.iswitness,
          witness_version: info.witness_version,
          total_amount,
          utxo_count: utxos.length,
          utxos,
        };
      } catch (err) {
        return reply.code(502).send({ error: err.message });
      }
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

  // ── TX Notes ───────────────────────────────────────────────────────────────

  fastify.get(
    '/api/tx/:txid/notes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { txid } = request.params;
      try {
        const { rows } = await pool.query(
          `SELECT id, txid, note, created_at FROM tx_notes
            WHERE user_id = $1 AND txid = $2
            ORDER BY created_at DESC`,
          [request.user.id, txid]
        );
        return { notes: rows };
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  fastify.post(
    '/api/tx/:txid/notes',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { txid } = request.params;
      const { note } = request.body ?? {};
      if (!note?.trim()) return reply.code(400).send({ error: 'note required' });
      try {
        const { rows } = await pool.query(
          `INSERT INTO tx_notes (user_id, txid, note) VALUES ($1, $2, $3) RETURNING id, txid, note, created_at`,
          [request.user.id, txid, note.trim()]
        );
        return rows[0];
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  fastify.delete(
    '/api/tx/:txid/notes/:noteId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { txid, noteId } = request.params;
      try {
        const { rowCount } = await pool.query(
          `DELETE FROM tx_notes WHERE id = $1 AND user_id = $2 AND txid = $3`,
          [noteId, request.user.id, txid]
        );
        if (rowCount === 0) return reply.code(404).send({ error: 'Note not found' });
        return { success: true };
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  fastify.put(
    '/api/tx/:txid/notes/:noteId',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { txid, noteId } = request.params;
      const { note } = request.body ?? {};
      if (!note?.trim()) return reply.code(400).send({ error: 'note required' });
      try {
        const { rows, rowCount } = await pool.query(
          `UPDATE tx_notes SET note = $1 WHERE id = $2 AND user_id = $3 AND txid = $4 RETURNING id, txid, note, created_at`,
          [note.trim(), noteId, request.user.id, txid]
        );
        if (rowCount === 0) return reply.code(404).send({ error: 'Note not found' });
        return rows[0];
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );

  fastify.post(
    '/api/tx/notes/batch',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { txids } = request.body ?? {};
      if (!txids?.length) return { notes: {} };
      try {
        const { rows } = await pool.query(
          `SELECT id, txid, note, created_at FROM tx_notes
            WHERE user_id = $1 AND txid = ANY($2)
            ORDER BY created_at DESC`,
          [request.user.id, txids]
        );
        const grouped = {};
        for (const row of rows) {
          if (!grouped[row.txid]) grouped[row.txid] = [];
          grouped[row.txid].push(row);
        }
        return { notes: grouped };
      } catch (err) {
        return reply.code(500).send({ error: err.message });
      }
    }
  );
}
