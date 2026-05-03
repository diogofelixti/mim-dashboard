'use client';

import { useState, useEffect, FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatPrice } from '@/lib/formatters';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard':    'Dashboard',
  '/live':         'Live Feed',
  '/explorer':     'Explorer',
  '/wallets':      'Wallets',
  '/transactions': 'Transactions',
  '/alerts':       'Alerts',
  '/settings':     'Settings',
};

type PriceData = {
  usd: number;
  usd_24h: number;
};

type NodePing = { connected: boolean };

export default function Header() {
  const pathname      = usePathname();
  const router        = useRouter();
  const { connected } = useWebSocket();

  const [query,     setQuery]     = useState('');
  const [price,     setPrice]     = useState<PriceData | null>(null);
  const [nodeOk,    setNodeOk]    = useState<boolean | null>(null);

  const title = PAGE_TITLES[pathname] ?? 'MIM-Dashboard';

  // Preço a cada 60s
  useEffect(() => {
    async function fetchPrice() {
      try {
        const data = await api<PriceData>('/api/price');
        setPrice(data);
      } catch { /* silencioso */ }
    }
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000);
    return () => clearInterval(id);
  }, []);

  // Saúde do node a cada 30s
  useEffect(() => {
    async function checkNode() {
      try {
        const { connected: ok } = await api<NodePing>('/api/node/ping');
        setNodeOk(ok);
      } catch {
        setNodeOk(false);
      }
    }
    checkNode();
    const id = setInterval(checkNode, 30_000);
    return () => clearInterval(id);
  }, []);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/explorer?q=${encodeURIComponent(q)}`);
    setQuery('');
  }

  const nodeColor =
    nodeOk === null ? 'bg-mim-yellow' :
    nodeOk          ? 'bg-mim-green'  : 'bg-mim-red';

  const change24h = price?.usd_24h ?? 0;

  return (
    <header className="fixed top-0 left-56 right-0 h-14 flex items-center gap-4 px-5 bg-mim-surface/95 border-b border-mim-border backdrop-blur z-30">

      {/* Título */}
      <h1 className="font-semibold text-mim-text text-sm w-32 flex-shrink-0">
        {title}
      </h1>

      {/* Busca */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mim-text-dim text-xs select-none">
            🔍
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search block, txid, address…"
            className="
              w-full pl-8 pr-4 py-1.5 rounded-lg text-sm font-mono
              bg-mim-bg border border-mim-border
              text-mim-text placeholder-mim-text-dim
              focus:outline-none focus:border-bitcoin-orange/50
              transition-colors duration-150
            "
          />
        </div>
      </form>

      {/* Lado direito */}
      <div className="flex items-center gap-4 ml-auto flex-shrink-0">

        {/* Preço BTC */}
        {price && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-mim-text-muted text-xs">BTC</span>
            <span className="font-mono font-semibold text-mim-text">
              {formatPrice(price.usd, 'usd')}
            </span>
            <span
              className={`text-xs font-mono font-medium ${
                change24h >= 0 ? 'text-mim-green' : 'text-mim-red'
              }`}
            >
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Separador */}
        <div className="w-px h-5 bg-mim-border" />

        {/* Node health */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${nodeColor} ${nodeOk ? 'animate-pulse-live' : ''}`}
          />
          <span className="text-xs text-mim-text-dim">
            {nodeOk === null ? 'Checking' : nodeOk ? 'Node' : 'Offline'}
          </span>
        </div>

        {/* WebSocket */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-bitcoin-orange animate-pulse-live' : 'bg-mim-text-dim'}`}
          />
          <span className="text-xs text-mim-text-dim">
            {connected ? 'Live' : 'WS'}
          </span>
        </div>
      </div>
    </header>
  );
}
