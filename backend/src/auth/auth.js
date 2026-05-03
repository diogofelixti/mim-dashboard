import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import config from '../config.js';
import { pool } from '../db/migrate.js';

export async function ensureAdminUser() {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    ['admin']
  );

  if (rows.length === 0) {
    const hash = await bcrypt.hash(config.auth.password, 12);
    await pool.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)`,
      ['admin', hash]
    );
    console.log('[auth] Admin user created.');
  }
}

export async function setupAuth(fastify) {
  await fastify.register(fastifyJwt, {
    secret: config.auth.jwtSecret,
    sign: { expiresIn: config.auth.jwtExpiry },
  });

  fastify.decorate('authenticate', async function (request, reply) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });

  // POST /api/auth/login
  fastify.post('/api/auth/login', async (request, reply) => {
    const { password } = request.body ?? {};

    if (!password) {
      return reply.code(400).send({ error: 'Password required' });
    }

    const { rows } = await pool.query(
      `SELECT id, username, password_hash FROM users WHERE username = $1 LIMIT 1`,
      ['admin']
    );

    if (rows.length === 0) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username });
    return { token };
  });

  // GET /api/auth/verify
  fastify.get(
    '/api/auth/verify',
    { preHandler: fastify.authenticate },
    async (request) => {
      return { valid: true, user: request.user };
    }
  );

  // POST /api/auth/change-password
  fastify.post(
    '/api/auth/change-password',
    { preHandler: fastify.authenticate },
    async (request, reply) => {
      const { currentPassword, newPassword } = request.body ?? {};

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({ error: 'currentPassword and newPassword required' });
      }

      if (newPassword.length < 8) {
        return reply.code(400).send({ error: 'New password must be at least 8 characters' });
      }

      const { rows } = await pool.query(
        `SELECT password_hash FROM users WHERE id = $1`,
        [request.user.id]
      );

      if (rows.length === 0) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!valid) {
        return reply.code(401).send({ error: 'Current password is incorrect' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await pool.query(
        `UPDATE users SET password_hash = $1 WHERE id = $2`,
        [newHash, request.user.id]
      );

      return { success: true };
    }
  );
}
