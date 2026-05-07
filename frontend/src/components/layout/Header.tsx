'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { formatPrice, formatNumber, formatBytes } from '@/lib/formatters';

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

type HealthCheck = {
  status: 'green' | 'yellow' | 'red';
  label: string;
  [key: string]: unknown;
};

type NodeHealth = {
  status: 'green' | 'yellow' | 'red';
  summary: string;
  checks: {
    sync:    HealthCheck & { progress: number; blocks: number; headers: number; headerGap: number };
    peers:   HealthCheck & { total: number; inbound: number; outbound: number };
    mempool: HealthCheck & { txCount: number; bytes: number; usagePct: number };
  };
};

const STATUS_DOT: Record<string, string> = {
  green:  'bg-mim-green',
  yellow: 'bg-mim-yellow',
  red:    'bg-mim-red',
};

const STATUS_TEXT: Record<string, string> = {
  green:  'text-mim-green',
  yellow: 'text-mim-yellow',
  red:    'text-mim-red',
};

const STATUS_ICON: Record<string, string> = {
  green:  '✓',
  yellow: '!',
  red:    '✕',
};

function HealthPopover({ health }: { health: NodeHealth }) {
  const { checks } = health;

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-mim-surface border border-mim-border rounded-xl shadow-2xl p-4 space-y-3 z-50 animate-fade-in">
      {/* Overall */}
      <div className="flex items-center gap-2 pb-2 border-b border-mim-border">
        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[health.status]}`} />
        <span className="text-xs font-semibold text-mim-text">Node Health</span>
        <span className={`ml-auto text-[10px] font-semibold uppercase ${STATUS_TEXT[health.status]}`}>
          {health.status === 'green' ? 'Healthy' : health.status === 'yellow' ? 'Warning' : 'Critical'}
        </span>
      </div>

      {/* Sync */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${STATUS_TEXT[checks.sync.status]}`}>
            {STATUS_ICON[checks.sync.status]}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">Sync</span>
          <span className={`ml-auto text-[10px] font-semibold ${STATUS_TEXT[checks.sync.status]}`}>
            {checks.sync.progress.toFixed(2)}%
          </span>
        </div>
        <div className="w-full h-1 bg-mim-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${STATUS_DOT[checks.sync.status]}`}
            style={{ width: `${Math.min(checks.sync.progress, 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-mim-text-dim">
          <span>Block {checks.sync.blocks}</span>
          <span>Header {checks.sync.headers}</span>
        </div>
      </div>

      {/* Peers */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${STATUS_TEXT[checks.peers.status]}`}>
            {STATUS_ICON[checks.peers.status]}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">Peers</span>
          <span className={`ml-auto text-[10px] font-semibold ${STATUS_TEXT[checks.peers.status]}`}>
            {checks.peers.total}
          </span>
        </div>
        <div className="flex gap-3 text-[10px] text-mim-text-dim">
          <span>↓ {checks.peers.inbound} inbound</span>
          <span>↑ {checks.peers.outbound} outbound</span>
        </div>
      </div>

      {/* Mempool */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold ${STATUS_TEXT[checks.mempool.status]}`}>
            {STATUS_ICON[checks.mempool.status]}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">Mempool</span>
          <span className={`ml-auto text-[10px] font-semibold ${STATUS_TEXT[checks.mempool.status]}`}>
            {checks.mempool.usagePct}%
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-mim-text-dim">
          <span>{formatNumber(checks.mempool.txCount)} txs</span>
          <span>{formatBytes(checks.mempool.bytes)}</span>
        </div>
      </div>

      {/* Summary */}
      {health.status !== 'green' && (
        <p className="text-[10px] text-mim-text-muted pt-1 border-t border-mim-border">
          {health.summary}
        </p>
      )}
    </div>
  );
}

type HeaderProps = {
  onMenuClick: () => void;
};

export default function Header({ onMenuClick }: HeaderProps) {
  const pathname      = usePathname();
  const router        = useRouter();
  const { connected } = useWebSocket();

  const [query,       setQuery]       = useState('');
  const [price,       setPrice]       = useState<PriceData | null>(null);
  const [health,      setHealth]      = useState<NodeHealth | null>(null);
  const [showPop,     setShowPop]     = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  const title = PAGE_TITLES[pathname] ?? 'MIM-Dashboard';

  useEffect(() => {
    async function fetchPrice() {
      try {
        const data = await api<PriceData>('/api/price');
        setPrice(data);
      } catch { /* silent */ }
    }
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const data = await api<NodeHealth>('/api/node/health');
        setHealth(data);
      } catch {
        setHealth({
          status: 'red',
          summary: 'Cannot reach backend',
          checks: {
            sync:    { status: 'red', progress: 0, blocks: 0, headers: 0, headerGap: 0, label: 'Unreachable' },
            peers:   { status: 'red', total: 0, inbound: 0, outbound: 0, label: 'Unreachable' },
            mempool: { status: 'red', txCount: 0, bytes: 0, usagePct: 0, label: 'Unreachable' },
          },
        });
      }
    }
    fetchHealth();
    const id = setInterval(fetchHealth, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close popover on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) {
        setShowPop(false);
      }
    }
    if (showPop) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showPop]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/explorer?q=${encodeURIComponent(q)}`);
    setQuery('');
  }

  const status = health?.status ?? 'yellow';
  const dotColor = STATUS_DOT[status];
  const isHealthy = status === 'green';

  const change24h = price?.usd_24h ?? 0;

  return (
    <header className="fixed top-0 left-0 lg:left-56 right-0 h-14 flex items-center gap-2 sm:gap-4 px-3 sm:px-5 bg-mim-surface/95 border-b border-mim-border backdrop-blur z-30">

      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        className="lg:hidden text-mim-text-muted hover:text-mim-text text-lg flex-shrink-0 p-1"
        aria-label="Open menu"
      >
        ☰
      </button>

      {/* Title */}
      <h1 className="font-semibold text-mim-text text-sm w-auto sm:w-32 flex-shrink-0 truncate">
        {title}
      </h1>

      {/* Search — desktop */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md hidden sm:block">
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

      {/* Search toggle — mobile */}
      <button
        onClick={() => setMobileSearch((v) => !v)}
        className="sm:hidden text-mim-text-dim hover:text-mim-text text-sm flex-shrink-0"
        aria-label="Search"
      >
        🔍
      </button>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-4 ml-auto flex-shrink-0">

        {/* BTC Price */}
        {price && (
          <div className="flex items-center gap-1.5 sm:gap-2 text-sm">
            <span className="text-mim-text-muted text-xs hidden sm:inline">BTC</span>
            <span className="font-mono font-semibold text-mim-text text-xs sm:text-sm">
              {formatPrice(price.usd, 'usd')}
            </span>
            <span
              className={`text-xs font-mono font-medium hidden md:inline ${
                change24h >= 0 ? 'text-mim-green' : 'text-mim-red'
              }`}
            >
              {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
            </span>
          </div>
        )}

        {/* Separator */}
        <div className="w-px h-5 bg-mim-border hidden sm:block" />

        {/* Health Semaphore */}
        <div className="relative" ref={popRef}>
          <button
            onClick={() => setShowPop((p) => !p)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-mim-surface-2 transition-colors"
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${dotColor} ${isHealthy ? 'animate-pulse-live' : ''}`}
            />
            <span className={`text-xs font-semibold hidden sm:inline ${STATUS_TEXT[status]}`}>
              {status === 'green' ? 'Healthy' : status === 'yellow' ? 'Warning' : 'Critical'}
            </span>
          </button>
          {showPop && health && <HealthPopover health={health} />}
        </div>

        {/* WebSocket */}
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-bitcoin-orange animate-pulse-live' : 'bg-mim-text-dim'}`}
          />
          <span className="text-xs text-mim-text-dim hidden sm:inline">
            {connected ? 'Live' : 'WS'}
          </span>
        </div>
      </div>

      {/* Mobile search bar — slides under header */}
      {mobileSearch && (
        <div className="absolute top-full left-0 right-0 sm:hidden bg-mim-surface border-b border-mim-border px-3 py-2 animate-fade-in">
          <form onSubmit={(e) => { handleSearch(e); setMobileSearch(false); }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search block, txid, address…"
              autoFocus
              className="w-full px-3 py-2 rounded-lg text-sm font-mono bg-mim-bg border border-mim-border text-mim-text placeholder-mim-text-dim focus:outline-none focus:border-bitcoin-orange/50"
            />
          </form>
        </div>
      )}
    </header>
  );
}
