import { EventEmitter } from 'events';
import { Subscriber } from 'zeromq';
import config from '../config.js';
import {
  getBlock,
  getBlockStats,
  getBlockCount,
  decodeRawTransaction,
} from '../rpc/client.js';

class ZmqSubscriber extends EventEmitter {
  constructor() {
    super();
    this._sockets = [];
    this._running = false;
  }

  async start() {
    if (this._running) return;
    this._running = true;

    this._startHashBlock();
    this._startHashTx();
    this._startRawTx();

    console.log('[zmq] Subscriptions started.');
  }

  async _startHashBlock() {
    const sock = new Subscriber();
    this._sockets.push(sock);
    sock.connect(config.zmq.blockUrl);
    sock.subscribe('hashblock');

    for await (const [, msg] of sock) {
      if (!this._running) break;
      const hash = msg.toString('hex');
      this._handleBlock(hash).catch((err) =>
        console.error('[zmq] block error:', err.message)
      );
    }
  }

  async _startHashTx() {
    const sock = new Subscriber();
    this._sockets.push(sock);
    sock.connect(config.zmq.txUrl);
    sock.subscribe('hashtx');

    for await (const [, msg] of sock) {
      if (!this._running) break;
      const txid = msg.toString('hex');
      this._handleTx(txid);
    }
  }

  async _startRawTx() {
    const sock = new Subscriber();
    this._sockets.push(sock);
    sock.connect(config.zmq.rawTxUrl);
    sock.subscribe('rawtx');

    for await (const [, msg] of sock) {
      if (!this._running) break;
      this._handleRawTx(msg).catch((err) =>
        console.error('[zmq] rawtx error:', err.message)
      );
    }
  }

  async _handleBlock(hash) {
    const [block, height] = await Promise.all([
      getBlock(hash, 1),
      getBlockCount(),
    ]);

    const stats = await getBlockStats(hash, [
      'totalfee',
      'avgfeerate',
      'txs',
      'total_size',
    ]);

    const data = {
      height: block.height ?? height,
      hash,
      time: block.time,
      nTx: block.nTx ?? block.tx?.length ?? 0,
      size: block.size,
      totalFees: stats.totalfee / 1e8,
      avgFeeRate: stats.avgfeerate,
    };

    this.emit('block', data);
    console.log(`[zmq] New block: ${data.height} (${hash.slice(0, 12)}…)`);
  }

  _handleTx(txid) {
    this.emit('tx_hash', { txid });
  }

  async _handleRawTx(rawBuf) {
    const hex = rawBuf.toString('hex');
    const decoded = await decodeRawTransaction(hex);

    const totalOutput = decoded.vout.reduce((sum, o) => sum + (o.value ?? 0), 0);
    const addresses = decoded.vout.flatMap((o) => o.scriptPubKey?.address ? [o.scriptPubKey.address] : o.scriptPubKey?.addresses ?? []);

    this.emit('tx', {
      txid: decoded.txid,
      size: decoded.size,
      vsize: decoded.vsize,
      totalOutput,
      addresses: [...new Set(addresses)],
      locktime: decoded.locktime,
    });
  }

  stop() {
    this._running = false;
    for (const sock of this._sockets) {
      try { sock.close(); } catch (_) { /* already closed */ }
    }
    this._sockets = [];
    console.log('[zmq] Stopped.');
  }
}

export default new ZmqSubscriber();
