'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatHash, formatTimeAgo, formatBytes, formatNumber } from '@/lib/formatters';

type BlockSummary = {
  height: number;
  hash: string;
  time: number;
  nTx: number;
  size: number;
  totalFees: number;
  avgFeeRate: number;
};

type SearchResult = {
  type: 'block' | 'tx';
  hash?: string;
  txid?: string;
  height?: number;
};

function ExplorerContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [query,     setQuery]     = useState(searchParams.get('q') ?? '');
  const [blocks,    setBlocks]    = useState<BlockSummary[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    api<{ blocks: BlockSummary[] }>('/api/blocks?count=10')
      .then((d) => setBlocks(d.blocks))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Busca automática se vier query na URL
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) doSearch(q);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSearching(true);
    setError('');
    try {
      const result = await api<SearchResult>(`/api/search/${encodeURIComponent(trimmed)}`);
      if (result.type === 'block') {
        router.push(`/explorer/block/${result.hash ?? result.height}`);
      } else {
        router.push(`/explorer/tx/${result.txid}`);
      }
    } catch {
      setError('Nothing found for that query.');
      setSearching(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  return (
    <div className="space-y-8 max-w-4xl">

      {/* Search */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Block height, block hash or txid…"
            className="
              flex-1 px-4 py-3 rounded-xl font-mono text-sm
              bg-mim-surface border border-mim-border
              text-mim-text placeholder-mim-text-dim
              focus:outline-none focus:border-bitcoin-orange/60
              transition-colors
            "
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="
              px-6 py-3 rounded-xl bg-bitcoin-orange text-black font-semibold text-sm
              hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors
            "
          >
            {searching ? '…' : 'Search'}
          </button>
        </div>
        {error && (
          <p className="text-xs text-mim-red font-mono">{error}</p>
        )}
      </form>

      {/* Latest blocks table */}
      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
          Latest Blocks
        </h2>

        {loading ? (
          <p className="text-xs text-mim-text-muted animate-pulse">Loading…</p>
        ) : (
          <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mim-border">
                  {['Height', 'Hash', 'Txs', 'Size', 'Fees', 'Time'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${i > 1 ? 'text-right' : 'text-left'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr
                    key={b.hash}
                    className="border-b border-mim-border last:border-0 hover:bg-mim-surface-2 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/explorer/block/${b.height}`}
                        className="font-mono font-bold text-bitcoin-orange hover:underline"
                      >
                        {formatNumber(b.height)}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/explorer/block/${b.hash}`}
                        className="text-hash hover:text-mim-text transition-colors"
                      >
                        {formatHash(b.hash, 12)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-mim-text-muted font-mono">
                      {formatNumber(b.nTx)}
                    </td>
                    <td className="px-4 py-3 text-right text-mim-text-muted">
                      {formatBytes(b.size)}
                    </td>
                    <td className="px-4 py-3 text-right text-mim-text-muted font-mono">
                      {b.totalFees.toFixed(5)}
                    </td>
                    <td className="px-4 py-3 text-right text-mim-text-muted">
                      {formatTimeAgo(b.time)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ExplorerPage() {
  return (
    <Suspense fallback={
      <div className="text-mim-text-muted text-sm animate-pulse">Loading…</div>
    }>
      <ExplorerContent />
    </Suspense>
  );
}
