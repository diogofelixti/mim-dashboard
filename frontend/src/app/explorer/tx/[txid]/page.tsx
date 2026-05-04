'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatHash, formatNumber, formatBytes } from '@/lib/formatters';

type TxInput = {
  txid: string;
  vout: number;
  address: string;
  value: number;
};

type TxOutput = {
  n: number;
  address: string;
  value: number;
  spent: boolean;
};

type TxDetail = {
  txid: string;
  confirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  confirmations?: number;
  time?: number;
  size: number;
  vsize: number;
  weight: number;
  fee: number;
  feeRate: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  hex?: string;
};

export default function TxDetailPage() {
  const { txid } = useParams<{ txid: string }>();

  const [tx,        setTx]        = useState<TxDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [hexOpen,   setHexOpen]   = useState(false);
  const [copied,    setCopied]    = useState(false);

  useEffect(() => {
    api<TxDetail>(`/api/tx/${encodeURIComponent(txid)}`)
      .then(setTx)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [txid]);

  function copyTxid() {
    navigator.clipboard.writeText(txid);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-mim-text-muted text-sm animate-pulse">
        Loading transaction…
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="space-y-4 max-w-4xl">
        <p className="text-mim-red font-mono text-sm">{error || 'Transaction not found.'}</p>
        <Link href="/explorer" className="text-bitcoin-orange text-sm hover:underline">
          ← Back to Explorer
        </Link>
      </div>
    );
  }

  const totalIn  = tx.inputs.reduce((s, i) => s + i.value, 0);
  const totalOut = tx.outputs.reduce((s, o) => s + o.value, 0);

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-mim-text-muted">
        <Link href="/explorer" className="hover:text-mim-text transition-colors">
          Explorer
        </Link>
        <span>/</span>
        {tx.blockHeight && (
          <>
            <Link
              href={`/explorer/block/${tx.blockHash ?? tx.blockHeight}`}
              className="hover:text-mim-text transition-colors"
            >
              Block {formatNumber(tx.blockHeight)}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-mim-text font-mono">{formatHash(txid, 8)}</span>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
              tx.confirmed
                ? 'bg-mim-green/10 text-mim-green border border-mim-green/30'
                : 'bg-bitcoin-orange/10 text-bitcoin-orange border border-bitcoin-orange/30'
            }`}
          >
            {tx.confirmed
              ? `✓ Confirmed · ${tx.confirmations} conf${tx.confirmations !== 1 ? 's' : ''}`
              : '⏳ Unconfirmed (mempool)'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <p className="text-hash font-mono text-xs break-all">{txid}</p>
          <button
            onClick={copyTxid}
            title="Copy txid"
            className="flex-shrink-0 text-mim-text-dim hover:text-mim-text transition-colors text-sm"
          >
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      </div>

      {/* Info row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Size',     value: formatBytes(tx.size) },
          { label: 'vSize',    value: `${tx.vsize} vB` },
          { label: 'Weight',   value: `${formatNumber(tx.weight)} WU` },
          { label: 'Fee',      value: `${(tx.fee * 1e8).toFixed(0)} sat · ${tx.feeRate} sat/vB` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-mim-surface border border-mim-border rounded-xl p-4 space-y-1"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
              {label}
            </p>
            <p className="font-mono text-sm text-mim-text">{value}</p>
          </div>
        ))}
      </div>

      {/* IO Diagram */}
      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
          Inputs → Outputs
        </h2>

        <div className="flex gap-4 items-start">

          {/* Inputs */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {tx.inputs.map((inp, i) => (
              <div
                key={i}
                className="bg-mim-surface border border-mim-border rounded-lg px-3 py-2.5 space-y-1"
              >
                <p className="text-hash text-xs truncate">{inp.address || 'coinbase'}</p>
                <p className="font-mono text-xs text-mim-text-muted">
                  {inp.value > 0 ? `${inp.value.toFixed(8)} BTC` : '—'}
                </p>
              </div>
            ))}
            <div className="text-[10px] text-mim-text-dim text-right">
              Total in: {totalIn.toFixed(8)} BTC
            </div>
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0 flex items-center pt-3 text-bitcoin-orange text-lg">
            →
          </div>

          {/* Outputs */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {tx.outputs.map((out) => (
              <div
                key={out.n}
                className={`border rounded-lg px-3 py-2.5 space-y-1 ${
                  out.spent
                    ? 'bg-mim-surface border-mim-border opacity-60'
                    : 'bg-mim-surface border-mim-green/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-hash text-xs truncate">{out.address || 'OP_RETURN'}</p>
                  {!out.spent && (
                    <span className="text-[9px] text-mim-green flex-shrink-0">UNSPENT</span>
                  )}
                </div>
                <p className="font-mono text-xs text-mim-text">
                  {out.value.toFixed(8)} BTC
                </p>
              </div>
            ))}
            <div className="text-[10px] text-mim-text-dim text-right">
              Total out: {totalOut.toFixed(8)} BTC
            </div>
          </div>
        </div>
      </div>

      {/* Raw hex (collapsible) */}
      {tx.hex && (
        <div className="border border-mim-border rounded-xl overflow-hidden">
          <button
            onClick={() => setHexOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-mim-surface hover:bg-mim-surface-2 transition-colors text-xs text-mim-text-muted font-semibold uppercase tracking-widest"
          >
            <span>Raw Hex</span>
            <span>{hexOpen ? '▲' : '▼'}</span>
          </button>

          {hexOpen && (
            <div className="border-t border-mim-border bg-mim-bg p-4">
              <pre className="text-hash text-[10px] break-all whitespace-pre-wrap">
                {tx.hex}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
