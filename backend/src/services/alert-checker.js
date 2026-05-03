import { pool } from '../db/migrate.js';
import zmqSubscriber from '../zmq/subscriber.js';
import { broadcast } from '../websocket/server.js';

async function saveAndBroadcast(alertId, data) {
  try {
    await pool.query(
      `INSERT INTO alerts_history (alert_id, data_json) VALUES ($1, $2)`,
      [alertId, JSON.stringify(data)]
    );
  } catch (err) {
    console.error('[alerts] DB insert error:', err.message);
  }
  broadcast({ type: 'alert', alertId, data });
}

export async function checkWatchlist(txData) {
  if (!txData.addresses?.length) return;

  try {
    const { rows } = await pool.query(
      `SELECT w.id, w.address, w.label, w.user_id
         FROM watchlist w
        WHERE w.address = ANY($1::text[]) AND w.active = TRUE`,
      [txData.addresses]
    );

    for (const entry of rows) {
      const { rows: alerts } = await pool.query(
        `SELECT id FROM alerts_config
          WHERE user_id = $1 AND type = 'watchlist' AND active = TRUE
          LIMIT 1`,
        [entry.user_id]
      );

      if (!alerts.length) continue;

      await saveAndBroadcast(alerts[0].id, {
        kind: 'watchlist',
        address: entry.address,
        label: entry.label,
        txid: txData.txid,
        totalOutput: txData.totalOutput,
      });
    }
  } catch (err) {
    console.error('[alerts] checkWatchlist error:', err.message);
  }
}

export async function checkFeeAlerts(feeRate) {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, condition, threshold
         FROM alerts_config
        WHERE type = 'fee_rate' AND active = TRUE`
    );

    for (const alert of rows) {
      const triggered =
        (alert.condition === 'above' && feeRate > alert.threshold) ||
        (alert.condition === 'below' && feeRate < alert.threshold);

      if (triggered) {
        await saveAndBroadcast(alert.id, {
          kind: 'fee_rate',
          feeRate,
          condition: alert.condition,
          threshold: alert.threshold,
        });
      }
    }
  } catch (err) {
    console.error('[alerts] checkFeeAlerts error:', err.message);
  }
}

export async function checkLargeTxAlerts(txData) {
  if (!txData.totalOutput) return;

  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, threshold
         FROM alerts_config
        WHERE type = 'large_tx' AND active = TRUE AND threshold <= $1`,
      [txData.totalOutput]
    );

    for (const alert of rows) {
      await saveAndBroadcast(alert.id, {
        kind: 'large_tx',
        txid: txData.txid,
        totalOutput: txData.totalOutput,
        addresses: txData.addresses,
        threshold: alert.threshold,
      });
    }
  } catch (err) {
    console.error('[alerts] checkLargeTxAlerts error:', err.message);
  }
}

export function startAlertChecker() {
  zmqSubscriber.on('tx', async (txData) => {
    await Promise.all([
      checkWatchlist(txData),
      checkLargeTxAlerts(txData),
    ]);
  });

  console.log('[alerts] Alert checker started.');
}
