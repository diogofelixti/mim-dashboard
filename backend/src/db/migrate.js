import pg from 'pg';
import config from '../config.js';

const { Pool } = pg;

export const pool = new Pool(
  config.db.url
    ? { connectionString: config.db.url }
    : {
        host: config.db.host,
        port: config.db.port,
        database: config.db.name,
        user: config.db.user,
        password: config.db.password,
      }
);

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        username      VARCHAR(64) NOT NULL UNIQUE,
        password_hash TEXT        NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS preferences (
        id                SERIAL PRIMARY KEY,
        user_id           INTEGER     NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        theme             VARCHAR(32) NOT NULL DEFAULT 'dark',
        default_currency  VARCHAR(8)  NOT NULL DEFAULT 'USD',
        language          VARCHAR(8)  NOT NULL DEFAULT 'en',
        settings_json     JSONB       NOT NULL DEFAULT '{}'
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS watchlist (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        address    VARCHAR(128) NOT NULL,
        label      VARCHAR(128),
        active     BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts_config (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type       VARCHAR(64)   NOT NULL,
        condition  VARCHAR(16)   NOT NULL,
        threshold  DECIMAL(20,8) NOT NULL,
        active     BOOLEAN       NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts_history (
        id           SERIAL PRIMARY KEY,
        alert_id     INTEGER     NOT NULL REFERENCES alerts_config(id) ON DELETE CASCADE,
        triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data_json    JSONB       NOT NULL DEFAULT '{}',
        read         BOOLEAN     NOT NULL DEFAULT FALSE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS blocks_log (
        id              SERIAL PRIMARY KEY,
        height          INTEGER       NOT NULL UNIQUE,
        hash            CHAR(64)      NOT NULL UNIQUE,
        block_timestamp TIMESTAMPTZ   NOT NULL,
        num_txs         INTEGER       NOT NULL DEFAULT 0,
        total_fees      DECIMAL(20,8) NOT NULL DEFAULT 0,
        size            INTEGER       NOT NULL DEFAULT 0,
        received_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS fee_history (
        id           SERIAL PRIMARY KEY,
        height       INTEGER       NOT NULL,
        recorded_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        fast         DECIMAL(12,2) NOT NULL DEFAULT 0,
        medium       DECIMAL(12,2) NOT NULL DEFAULT 0,
        slow         DECIMAL(12,2) NOT NULL DEFAULT 0,
        mempool_size INTEGER       NOT NULL DEFAULT 0
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tx_notes (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        txid       CHAR(64)    NOT NULL,
        note       TEXT        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS node_config (
        id         SERIAL PRIMARY KEY,
        key        VARCHAR(50) UNIQUE NOT NULL,
        value      TEXT        NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indices
    await client.query(`CREATE INDEX IF NOT EXISTS idx_blocks_log_height      ON blocks_log(height)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fee_history_recorded_at ON fee_history(recorded_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_fee_history_height      ON fee_history(height)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_watchlist_address       ON watchlist(address)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_alerts_history_triggered ON alerts_history(triggered_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tx_notes_txid           ON tx_notes(txid)`);

    await client.query('COMMIT');
    console.log('[migrate] Schema up to date.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
