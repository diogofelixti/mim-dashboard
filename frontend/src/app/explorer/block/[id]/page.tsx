'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  formatHash,
  formatTime,
  formatTimeAgo,
  formatBytes,
  formatNumber,
  formatDifficulty,
} from '@/lib/formatters';

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
      title="Copy"
      className="text-mim-text-dim hover:text-mim-text transition-colors text-sm flex-shrink-0"
    >
      {ok ? '✓' : '⧉'}
    </button>
  );
}

type TxSummary = {
  txid: string;
  totalOutput: number;
  numInputs: number;
  numOutputs: number;
  vsize: number;
  fee: number;
};

type BlockDetail = {
  height: number;
  hash: string;
  prevHash: string;
  nextHash?: string;
  time: number;
  nTx: number;
  size: number;
  weight: number;
  difficulty: number;
  totalFees: number;
  avgFeeRate: number;
  txs: TxSummary[];
};

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-mim-surface border border-mim-border rounded-xl p-4 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
        {label}
      </p>
      <p className="font-mono text-sm text-mim-text break-all">{value}</p>
    </div>
  );
}

export default function BlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [block,   setBlock]   = useState<BlockDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const fetchBlock = useCallback(
    (blockId: string) => {
      setLoading(true);
      setError('');
      api<BlockDetail>(`/api/blocks/${encodeURIComponent(blockId)}`)
        .then(setBlock)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => { fetchBlock(id); }, [id, fetchBlock]);

  function navigate(target: string | number) {
    router.push(`/explorer/block/${target}`);
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-mim-text-muted text-sm animate-pulse">
        Loading block…
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="space-y-4 max-w-4xl">
        <p className="text-mim-red font-mono text-sm">{error || 'Block not found.'}</p>
        <Link href="/explorer" className="text-bitcoin-orange text-sm hover:underline">
          ← Back to Explorer
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-mim-text-muted">
        <Link href="/explorer" className="hover:text-mim-text transition-colors">
          Explorer
        </Link>
        <span>/</span>
        <span className="text-mim-text">Block {block.height}</span>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold font-mono text-bitcoin-orange">
            #{block.height}
          </h1>
          <span className="text-xs text-mim-text-muted">
            {formatTime(block.time)} · {formatTimeAgo(block.time)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <p className="text-hash font-mono text-xs break-all">{block.hash}</p>
          <CopyBtn text={block.hash} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Transactions"  value={formatNumber(block.nTx)} />
        <StatCard label="Size"          value={formatBytes(block.size)} />
        <StatCard label="Weight"        value={`${formatNumber(block.weight)} WU`} />
        <StatCard label="Difficulty"    value={formatDifficulty(block.difficulty)} />
        <StatCard label="Total Fees"    value={`${block.totalFees.toFixed(6)} BTC`} />
        <StatCard label="Avg Fee Rate"  value={`${block.avgFeeRate} sat/vB`} />
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        {block.height > 0 && (
          <button
            onClick={() => navigate(block.height - 1)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mim-border text-xs text-mim-text-muted hover:border-mim-border-light hover:text-mim-text transition-colors"
          >
            ← Block {block.height - 1}
          </button>
        )}

        {block.nextHash ? (
          <button
            onClick={() => navigate(block.height + 1)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-mim-border text-xs text-mim-text-muted hover:border-mim-border-light hover:text-mim-text transition-colors"
          >
            Block {block.height + 1} →
          </button>
        ) : (
          <span className="px-3 py-2 text-xs text-mim-text-dim">
            (latest block)
          </span>
        )}
      </div>

      {/* Transactions */}
      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
          Transactions ({formatNumber(block.nTx)})
        </h2>

        <div className="bg-mim-surface border border-mim-border rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="border-b border-mim-border">
                {['Txid', 'Inputs', 'Outputs', 'Output BTC', 'vSize', 'Fee'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${
                      i === 0 ? 'text-left' : 'text-right'
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.txs.map((tx) => (
                <tr
                  key={tx.txid}
                  className="border-b border-mim-border last:border-0 hover:bg-mim-surface-2 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/explorer/tx/${tx.txid}?blockhash=${block.hash}`}
                        className="text-hash hover:text-mim-text font-mono transition-colors"
                      >
                        {formatHash(tx.txid, 10)}
                      </Link>
                      <CopyBtn text={tx.txid} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-mim-text-muted font-mono">
                    {tx.numInputs}
                  </td>
                  <td className="px-4 py-3 text-right text-mim-text-muted font-mono">
                    {tx.numOutputs}
                  </td>
                  <td className="px-4 py-3 text-right text-mim-text font-mono">
                    {tx.totalOutput.toFixed(5)}
                  </td>
                  <td className="px-4 py-3 text-right text-mim-text-muted">
                    {tx.vsize} vB
                  </td>
                  <td className="px-4 py-3 text-right text-mim-text-muted font-mono">
                    {(tx.fee * 1e8).toFixed(0)} sat
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
