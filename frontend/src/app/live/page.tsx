'use client';

import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { formatHash, formatTimeAgo, formatNumber } from '@/lib/formatters';
import { useBtcUnit } from '@/hooks/useBtcUnit';
import { usePreferences } from '@/hooks/usePreferences';

type LiveBlock = {
  height: number;
  hash: string;
  time: number;
  nTx: number;
  totalFees: number;
  avgFeeRate: number;
  size: number;
  _uid: number;
  live?: boolean;
};

type LiveTx = {
  txid: string;
  totalOutput: number;
  vsize: number;
  addresses: string[];
  _uid: number;
  live?: boolean;
};

let _uid = 0;

export default function LivePage() {
  const { fmt } = useBtcUnit();
  const { t } = usePreferences();
  const [blocks,     setBlocks]     = useState<LiveBlock[]>([]);
  const [txs,        setTxs]        = useState<LiveTx[]>([]);
  const [paused,     setPaused]     = useState(false);
  const [blockCount, setBlockCount] = useState(0);
  const [txCount,    setTxCount]    = useState(0);

  const { connected, subscribe } = useWebSocket();
  const pausedRef = useRef(false);
  const txListRef = useRef<HTMLDivElement>(null);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Load initial data (recent blocks + mempool txs)
  useEffect(() => {
    api<{ blocks: Omit<LiveBlock, '_uid' | 'live'>[] }>('/api/blocks?count=5')
      .then((d) => {
        setBlocks(d.blocks.map((b) => ({ ...b, _uid: ++_uid, live: false })));
      })
      .catch(() => {});

    api<{ top: { txid: string; vsize: number }[] }>('/api/node/mempool')
      .then((d) => {
        const initial = d.top.slice(0, 30).map((t) => ({
          txid: t.txid,
          totalOutput: 0,
          vsize: t.vsize,
          addresses: [],
          _uid: ++_uid,
          live: false,
        }));
        setTxs(initial);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const unsubBlock = subscribe('block', (raw) => {
      if (pausedRef.current) return;
      const b = raw as Omit<LiveBlock, '_uid' | 'live'>;
      setBlockCount((c) => c + 1);
      setBlocks((prev) => [{ ...b, _uid: ++_uid, live: true }, ...prev].slice(0, 20));
    });

    const unsubTx = subscribe('tx', (raw) => {
      if (pausedRef.current) return;
      const tx = raw as Omit<LiveTx, '_uid' | 'live'>;
      setTxCount((c) => c + 1);
      setTxs((prev) => [{ ...tx, _uid: ++_uid, live: true }, ...prev].slice(0, 50));
    });

    return () => { unsubBlock(); unsubTx(); };
  }, [subscribe]);

  useEffect(() => {
    if (!paused) txListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [txs.length, paused]);

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-8rem)]">

      {/* Status bar */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              connected ? 'bg-mim-green animate-pulse-live' : 'bg-mim-red'
            }`}
          />
          <span className="text-sm font-semibold text-mim-text">
            {connected ? t('live.live') : t('live.disconnected')}
          </span>
        </div>

        <div className="flex gap-4 text-xs text-mim-text-muted">
          <span>🧱 {blockCount} {blockCount !== 1 ? t('live.blocks_plural') : t('live.block')}</span>
          <span>📤 {txCount} {txCount !== 1 ? t('live.txs_plural') : t('live.tx')} {t('live.thisSession')}</span>
        </div>

        <button
          onClick={() => setPaused((p) => !p)}
          className={`
            ml-auto text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors
            ${paused
              ? 'border-bitcoin-orange text-bitcoin-orange hover:bg-bitcoin-orange/10'
              : 'border-mim-border text-mim-text-muted hover:border-mim-border-light hover:text-mim-text'
            }
          `}
        >
          {paused ? t('live.resume') : t('live.pause')}
        </button>
      </div>

      {/* Columns */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Blocks */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-2">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted flex-shrink-0">
            🧱 {t('live.blocks')}
          </h2>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {blocks.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-mim-text-dim">
                {t('live.waitingBlocks')}
              </div>
            ) : (
              blocks.map((b) => (
                <div
                  key={b._uid}
                  className={`animate-fade-in bg-mim-surface border rounded-xl p-3 space-y-2 ${
                    b.live ? 'border-bitcoin-orange/50' : 'border-mim-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-bitcoin-orange">
                        #{b.height}
                      </span>
                      {b.live && (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-bitcoin-orange/15 text-bitcoin-orange">
                          Live
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-mim-text-muted">
                      {formatTimeAgo(b.time)}
                    </span>
                  </div>
                  <p className="text-hash truncate">{formatHash(b.hash, 10)}</p>
                  <div className="flex gap-3 text-[11px] text-mim-text-muted">
                    <span>{formatNumber(b.nTx)} txs</span>
                    <span className="text-bitcoin-orange/80">
                      {fmt(b.totalFees)}
                    </span>
                    <span>{b.avgFeeRate} sat/vB</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Txs */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted flex-shrink-0">
            📤 {t('live.mempoolTxs')}
          </h2>
          <div ref={txListRef} className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {txs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-xs text-mim-text-dim">
                {t('live.waitingTxs')}
              </div>
            ) : (
              txs.map((tx) => (
                <div
                  key={tx._uid}
                  className={`animate-fade-in bg-mim-surface border rounded-lg px-3 py-2 flex items-center gap-3 min-w-0 ${
                    tx.live ? 'border-bitcoin-orange/40' : 'border-mim-border'
                  }`}
                >
                  {tx.live && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-bitcoin-orange/15 text-bitcoin-orange flex-shrink-0">
                      Live
                    </span>
                  )}
                  <span className="text-hash flex-shrink-0 w-32">
                    {formatHash(tx.txid, 7)}
                  </span>

                  <span className="font-mono text-sm font-semibold text-mim-text flex-shrink-0 w-28 text-right">
                    {fmt(tx.totalOutput)}
                  </span>

                  <span className="text-[11px] text-mim-text-muted flex-shrink-0 w-16 text-right">
                    {tx.vsize} vB
                  </span>

                  <div className="flex-1 min-w-0">
                    {tx.addresses.slice(0, 1).map((addr, i) => (
                      <p key={i} className="text-hash truncate">{addr}</p>
                    ))}
                    {tx.addresses.length > 1 && (
                      <p className="text-[10px] text-mim-text-dim">
                        +{tx.addresses.length - 1} more
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
