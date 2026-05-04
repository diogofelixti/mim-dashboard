import { pool } from '../db/migrate.js';

export async function setupWatchlistRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  // ── Watchlist ───────────────────────────────────────────────────────────────

  async function getWatchlistRows(userId) {
    const { rows } = await pool.query(
      `SELECT id, address, label, active, created_at
         FROM watchlist
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  fastify.get('/api/watchlist', protect, async (request, reply) => {
    try {
      return await getWatchlistRows(request.user.id);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Alias used by frontend alerts page
  fastify.get('/api/alerts/watchlist', protect, async (request, reply) => {
    try {
      const entries = await getWatchlistRows(request.user.id);
      return { entries };
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

  // Alias used by frontend alerts page
  fastify.post('/api/alerts/watchlist', protect, async (request, reply) => {
    const { address, label = '' } = request.body ?? {};
    if (!address) return reply.code(400).send({ error: 'address required' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO watchlist (user_id, address, label)
              VALUES ($1, $2, $3)
           RETURNING id, address, label, active, created_at`,
        [request.user.id, address, label]
      );
      return reply.code(201).send({ entry: rows[0] });
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  async function patchWatchlistEntry(id, userId, body) {
    const { label, active } = body ?? {};
    const updates = [];
    const values = [];
    let idx = 1;
    if (label  !== undefined) { updates.push(`label  = $${idx++}`); values.push(label); }
    if (active !== undefined) { updates.push(`active = $${idx++}`); values.push(active); }
    if (!updates.length) return null;
    values.push(id, userId);
    const { rows } = await pool.query(
      `UPDATE watchlist SET ${updates.join(', ')}
        WHERE id = $${idx} AND user_id = $${idx + 1}
        RETURNING id, address, label, active`,
      values
    );
    return rows[0] ?? null;
  }

  fastify.patch('/api/watchlist/:id', protect, async (request, reply) => {
    try {
      const row = await patchWatchlistEntry(request.params.id, request.user.id, request.body);
      if (!row) return reply.code(row === null ? 400 : 404).send({ error: row === null ? 'Nothing to update' : 'Not found' });
      return row;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.patch('/api/alerts/watchlist/:id', protect, async (request, reply) => {
    try {
      const row = await patchWatchlistEntry(request.params.id, request.user.id, request.body);
      if (!row) return reply.code(404).send({ error: 'Not found' });
      return row;
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  async function deleteWatchlistEntry(id, userId) {
    const { rowCount } = await pool.query(
      `DELETE FROM watchlist WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rowCount > 0;
  }

  fastify.delete('/api/watchlist/:id', protect, async (request, reply) => {
    try {
      const ok = await deleteWatchlistEntry(request.params.id, request.user.id);
      if (!ok) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  fastify.delete('/api/alerts/watchlist/:id', protect, async (request, reply) => {
    try {
      const ok = await deleteWatchlistEntry(request.params.id, request.user.id);
      if (!ok) return reply.code(404).send({ error: 'Not found' });
      return reply.code(204).send();
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });
}

export async function setupAlertRoutes(fastify) {
  const protect = { preHandler: [fastify.authenticate] };

  // ── Alert rules ─────────────────────────────────────────────────────────────

  async function getRulesRows(userId) {
    const { rows } = await pool.query(
      `SELECT id, type, condition, threshold, active, created_at
         FROM alerts_config
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  }

  fastify.get('/api/alerts/config', protect, async (request, reply) => {
    try {
      return await getRulesRows(request.user.id);
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // Alias used by frontend
  fastify.get('/api/alerts/rules', protect, async (request, reply) => {
    try {
      const rules = await getRulesRows(request.user.id);
      return { rules };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  async function createAlertRule(userId, body) {
    const { type, condition = '', threshold = '0' } = body ?? {};
    if (!type) throw Object.assign(new Error('type required'), { code: 400 });
    const { rows } = await pool.query(
      `INSERT INTO alerts_config (user_id, type, condition, threshold)
            VALUES ($1, $2, $3, $4)
         RETURNING id, type, condition, threshold, active, created_at`,
      [userId, type, condition, threshold]
    );
    return rows[0];
  }

  fastify.post('/api/alerts/config', protect, async (request, reply) => {
    try {
      const rule = await createAlertRule(request.user.id, request.body);
      return reply.code(201).send(rule);
    } catch (err) {
      return reply.code(err.code === 400 ? 400 : 500).send({ error: err.message });
    }
  });

  // Alias used by frontend
  fastify.post('/api/alerts/rules', protect, async (request, reply) => {
    try {
      const rule = await createAlertRule(request.user.id, request.body);
      return reply.code(201).send({ rule });
    } catch (err) {
      return reply.code(err.code === 400 ? 400 : 500).send({ error: err.message });
    }
  });

  // PATCH /api/alerts/config/:id — toggle active (legacy)
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

  // PATCH /api/alerts/rules/:id — toggle active (frontend alias)
  fastify.patch('/api/alerts/rules/:id', protect, async (request, reply) => {
    const { active } = request.body ?? {};
    if (active === undefined) return reply.code(400).send({ error: 'active required' });
    try {
      const { rows } = await pool.query(
        `UPDATE alerts_config SET active = $1
          WHERE id = $2 AND user_id = $3
          RETURNING id, type, condition, threshold, active`,
        [active, request.params.id, request.user.id]
      );
      if (!rows.length) return reply.code(404).send({ error: 'Not found' });
      return rows[0];
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── Alert history ───────────────────────────────────────────────────────────

  async function getHistoryRows(userId, limit = 50) {
    const { rows } = await pool.query(
      `SELECT h.id, h.alert_id AS "ruleId", c.type, h.data_json::text AS data,
              EXTRACT(EPOCH FROM h.triggered_at)::int AS time, h.read
         FROM alerts_history h
         JOIN alerts_config c ON c.id = h.alert_id
        WHERE c.user_id = $1
        ORDER BY h.triggered_at DESC
        LIMIT $2`,
      [userId, limit]
    );
    return rows;
  }

  fastify.get('/api/alerts/history', protect, async (request, reply) => {
    const limit = Math.min(parseInt(request.query.limit ?? '50', 10), 200);
    try {
      const events = await getHistoryRows(request.user.id, limit);
      return { events };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  async function markAllRead(userId) {
    await pool.query(
      `UPDATE alerts_history SET read = TRUE
        WHERE alert_id IN (SELECT id FROM alerts_config WHERE user_id = $1)`,
      [userId]
    );
  }

  fastify.patch('/api/alerts/history/read', protect, async (request, reply) => {
    const { ids } = request.body ?? {};
    try {
      if (ids?.length) {
        await pool.query(
          `UPDATE alerts_history SET read = TRUE
            WHERE id = ANY($1::int[])
              AND alert_id IN (SELECT id FROM alerts_config WHERE user_id = $2)`,
          [ids, request.user.id]
        );
      } else {
        await markAllRead(request.user.id);
      }
      return { success: true };
    } catch (err) {
      return reply.code(500).send({ error: err.message });
    }
  });

  // POST /api/alerts/history/read-all — frontend alias
  fastify.post('/api/alerts/history/read-all', protect, async (request, reply) => {
    try {
      await markAllRead(request.user.id);
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
