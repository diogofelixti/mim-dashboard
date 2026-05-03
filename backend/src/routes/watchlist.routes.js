import { pool } from '../db/migrate.js';

export async function setupWatchlistRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  // ── Watchlist ───────────────────────────────────────────────────────────────

  fastify.get('/api/watchlist', protect, async (request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, address, label, active, created_at
           FROM watchlist
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [request.user.id]
      );
      return rows;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/api/watchlist', protect, async (request, reply) => {
    const { address, label = '' } = request.body ?? {};
    if (!address) return reply.code(400).send({ error: 'address required' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO watchlist (user_id, address, label)
              VALUES ($1, $2, $3)
           RETURNING id, address, label, active, created_at`,
        [request.user.id, address, label]
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.patch('/api/watchlist/:id', protect, async (request, reply) => {
    const { label, active } = request.body ?? {};
    const updates = [];
    const values = [];
    let idx = 1;

    if (label !== undefined) { updates.push(`label = $${idx++}`); values.push(label); }
    if (active !== undefined) { updates.push(`active = $${idx++}`); values.push(active); }

    if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' });

    values.push(request.params.id, request.user.id);

    try {
      const { rows } = await pool.query(
        `UPDATE watchlist SET ${updates.join(', ')}
          WHERE id = $${idx} AND user_id = $${idx + 1}
          RETURNING id, address, label, active`,
        values
      );
      if (!rows.length) return reply.code(404).send({ error: 'Not found' });
      return rows[0];
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/api/watchlist/:id', protect, async (request, reply) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM watchlist WHERE id = $1 AND user_id = $2`,
        [request.params.id, request.user.id]
      );
      if (!rowCount) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}

export async function setupAlertRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  // ── Alerts config ───────────────────────────────────────────────────────────

  fastify.get('/api/alerts/config', protect, async (request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, type, condition, threshold, active, created_at
           FROM alerts_config
          WHERE user_id = $1
          ORDER BY created_at DESC`,
        [request.user.id]
      );
      return rows;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.post('/api/alerts/config', protect, async (request, reply) => {
    const { type, condition, threshold } = request.body ?? {};
    if (!type || !condition || threshold == null) {
      return reply.code(400).send({ error: 'type, condition and threshold required' });
    }
    try {
      const { rows } = await pool.query(
        `INSERT INTO alerts_config (user_id, type, condition, threshold)
              VALUES ($1, $2, $3, $4)
           RETURNING id, type, condition, threshold, active, created_at`,
        [request.user.id, type, condition, threshold]
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/api/alerts/config/:id', protect, async (request, reply) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM alerts_config WHERE id = $1 AND user_id = $2`,
        [request.params.id, request.user.id]
      );
      if (!rowCount) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Alerts history ──────────────────────────────────────────────────────────

  fastify.get('/api/alerts/history', protect, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
    try {
      const { rows } = await pool.query(
        `SELECT h.id, h.alert_id, h.triggered_at, h.data_json, h.read,
                c.type, c.condition, c.threshold
           FROM alerts_history h
           JOIN alerts_config c ON c.id = h.alert_id
          WHERE c.user_id = $1
          ORDER BY h.triggered_at DESC
          LIMIT $2`,
        [request.user.id, limit]
      );
      return rows;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.patch('/api/alerts/history/read', protect, async (request, reply) => {
    const { ids } = request.body ?? {};
    try {
      if (ids?.length) {
        await pool.query(
          `UPDATE alerts_history SET read = TRUE
            WHERE id = ANY($1::int[])
              AND alert_id IN (
                SELECT id FROM alerts_config WHERE user_id = $2
              )`,
          [ids, request.user.id]
        );
      } else {
        await pool.query(
          `UPDATE alerts_history SET read = TRUE
            WHERE alert_id IN (
              SELECT id FROM alerts_config WHERE user_id = $1
            )`,
          [request.user.id]
        );
      }
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.get('/api/alerts/unread', protect, async (request, reply) => {
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count
           FROM alerts_history h
           JOIN alerts_config c ON c.id = h.alert_id
          WHERE c.user_id = $1 AND h.read = FALSE`,
        [request.user.id]
      );
      return { count: rows[0].count };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}
