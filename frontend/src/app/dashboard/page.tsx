'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  formatNumber,
  formatBytes,
  formatHash,
  formatTimeAgo,
  formatUptime,
  formatDifficulty,
} from '@/lib/formatters';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

type NodeStatus = {
  blockchain: {
    chain: string;
    blocks: number;
    headers: number;
    bestblockhash: string;
    difficulty: number;
    verificationprogress: number;
    size_on_disk: number;
  };
  network: {
    version: number;
    subversion: string;
    connections: number;
    connections_in: number;
    connections_out: number;
    totalbytessent: number;
    totalbytesrecv: number;
    protocolversion: number;
  };
  mempool: {
    size: number;
    bytes: number;
    usage: number;
    mempoolminfee: number;
  };
  mining: {
    networkhashps: number;
    pooledtx: number;
  };
  uptime: number;
};

type Fees = {
  fast:   { satVb: number | null };
  medium: { satVb: number | null };
  slow:   { satVb: number | null };
};

type LatestBlock = {
  height: number;
  hash: string;
  time: number;
  nTx: number;
  totalFees?: number;
};

type FeeHistoryRow = {
  id: number;
  height: number;
  recorded_at: string;
  fast: number;
  medium: number;
  slow: number;
  mempool_size: number;
};

type FeeRange = '6' | '24' | '48' | '168';

const FEE_RANGES: { id: FeeRange; label: string }[] = [
  { id: '6',   label: '6h' },
  { id: '24',  label: '24h' },
  { id: '48',  label: '2d' },
  { id: '168', label: '7d' },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-mim-text-muted mb-1">
      {children}
    </p>
  );
}

function BigValue({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-2xl font-bold text-mim-text tabular-nums leading-none ${className}`}>
      {children}
    </p>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 border-b border-mim-border last:border-0">
      <span className="text-xs text-mim-text-muted flex-shrink-0">{label}</span>
      <span className={`text-xs text-mim-text text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function Card({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-mim-surface border border-mim-border rounded-xl p-5 flex flex-col gap-4 animate-fade-in">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-mim-text-muted flex items-center gap-2">
        {accent && <span>{accent}</span>}
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Fee History Chart ─────────────────────────────────────────────────────────

function formatChartTime(ts: string, range: FeeRange) {
  const d = new Date(ts);
  if (range === '6' || range === '24') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function FeeHistoryChart() {
  const [range,    setRange]    = useState<FeeRange>('24');
  const [data,     setData]     = useState<FeeHistoryRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showPool, setShowPool] = useState(true);

  const fetchHistory = useCallback(async (hours: string) => {
    setLoading(true);
    try {
      const rows = await api<FeeHistoryRow[]>(`/api/fees/history?hours=${hours}`);
      setData(rows);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchHistory(range);
  }, [range, fetchHistory]);

  const chartData = useMemo(() => {
    const step = data.length > 200 ? Math.ceil(data.length / 200) : 1;
    return data
      .filter((_, i) => i % step === 0 || i === data.length - 1)
      .map((row) => ({
        time:    formatChartTime(row.recorded_at, range),
        rawTime: row.recorded_at,
        fast:    Number(row.fast),
        medium:  Number(row.medium),
        slow:    Number(row.slow),
        mempool: row.mempool_size,
      }));
  }, [data, range]);

  const maxFee = useMemo(() => {
    if (!chartData.length) return 100;
    return Math.max(...chartData.map((d) => Math.max(d.fast, d.medium, d.slow))) * 1.15;
  }, [chartData]);

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) => {
    if (!active || !payload?.length) return null;
    const row = chartData.find((d) => d.time === label);
    return (
      <div className="bg-mim-surface border border-mim-border rounded-lg p-3 shadow-lg">
        <p className="text-[10px] text-mim-text-muted mb-1.5">
          {row ? new Date(row.rawTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : label}
        </p>
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
            <span className="text-mim-text-muted capitalize">{p.name}</span>
            <span className="font-mono text-mim-text ml-auto">
              {p.name === 'mempool' ? formatNumber(p.value) + ' txs' : p.value.toFixed(1) + ' sat/vB'}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card title="Fee History" accent="📈">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {FEE_RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-colors ${
                range === r.id
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showPool}
            onChange={(e) => setShowPool(e.target.checked)}
            className="accent-bitcoin-orange w-3 h-3"
          />
          <span className="text-[10px] text-mim-text-muted">Mempool</span>
        </label>
      </div>

      {/* Chart */}
      {loading ? (
        <div className="h-52 flex items-center justify-center">
          <span className="text-xs text-mim-text-muted animate-pulse">Loading fee data…</span>
        </div>
      ) : chartData.length < 2 ? (
        <div className="h-52 flex items-center justify-center">
          <span className="text-xs text-mim-text-dim">Not enough data yet. Fees are recorded every 5 minutes.</span>
        </div>
      ) : (
        <div className="h-52 -mx-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3A" vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: '#5A5A70' }}
                tickLine={false}
                axisLine={{ stroke: '#2A2A3A' }}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                yAxisId="fee"
                tick={{ fontSize: 9, fill: '#5A5A70' }}
                tickLine={false}
                axisLine={false}
                domain={[0, maxFee]}
                tickFormatter={(v: number) => `${Math.round(v)}`}
              />
              {showPool && (
                <YAxis
                  yAxisId="mempool"
                  orientation="right"
                  tick={{ fontSize: 9, fill: '#5A5A70' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                iconType="circle"
                iconSize={6}
              />
              {showPool && (
                <Area
                  yAxisId="mempool"
                  type="monotone"
                  dataKey="mempool"
                  fill="#3B82F6"
                  fillOpacity={0.06}
                  stroke="#3B82F6"
                  strokeWidth={1}
                  strokeOpacity={0.3}
                  name="mempool"
                  dot={false}
                />
              )}
              <Line
                yAxisId="fee"
                type="monotone"
                dataKey="fast"
                stroke="#EF4444"
                strokeWidth={2}
                dot={false}
                name="fast"
              />
              <Line
                yAxisId="fee"
                type="monotone"
                dataKey="medium"
                stroke="#EAB308"
                strokeWidth={2}
                dot={false}
                name="medium"
              />
              <Line
                yAxisId="fee"
                type="monotone"
                dataKey="slow"
                stroke="#22C55E"
                strokeWidth={2}
                dot={false}
                name="slow"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [status,  setStatus]  = useState<NodeStatus | null>(null);
  const [fees,    setFees]    = useState<Fees | null>(null);
  const [block,   setBlock]   = useState<LatestBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const { subscribe } = useWebSocket();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api<NodeStatus>('/api/node/status');
      setStatus(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch node status');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFees = useCallback(async () => {
    try {
      const data = await api<Fees>('/api/node/fees');
      setFees(data);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchFees();

    const statusId = setInterval(fetchStatus, 30_000);
    const feesId   = setInterval(fetchFees,   60_000);
    return () => { clearInterval(statusId); clearInterval(feesId); };
  }, [fetchStatus, fetchFees]);

  // Novo bloco via WebSocket
  useEffect(() => {
    return subscribe('block', (data) => {
      const b = data as LatestBlock;
      setBlock(b);
      fetchStatus();
    });
  }, [subscribe, fetchStatus]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-mim-text-muted text-sm">
        <span className="animate-pulse">Loading node data…</span>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-mim-red text-sm mb-2">{error}</p>
          <button
            onClick={fetchStatus}
            className="text-xs text-bitcoin-orange hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const bc    = status?.blockchain;
  const net   = status?.network;
  const mem   = status?.mempool;
  const sync  = bc ? Math.min(bc.verificationprogress * 100, 100) : 0;
  const synced = sync >= 99.9;

  const latestBlock: LatestBlock | null = block ?? (bc
    ? { height: bc.blocks, hash: bc.bestblockhash, time: Math.floor(Date.now() / 1000), nTx: 0 }
    : null
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

      {/* Node Info */}
      <Card title="Node Info" accent="🖥️">
        <div className="flex items-end justify-between">
          <div>
            <Label>Height</Label>
            <BigValue>{bc?.blocks ?? 0}</BigValue>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-mono font-semibold ${
              synced
                ? 'bg-mim-green/10 text-mim-green'
                : 'bg-yellow-500/10 text-mim-yellow'
            }`}
          >
            {synced ? 'Synced' : `${sync.toFixed(2)}%`}
          </span>
        </div>

        {/* Sync bar */}
        <div className="w-full h-1.5 bg-mim-surface-2 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-bitcoin-orange transition-all duration-500"
            style={{ width: `${sync}%` }}
          />
        </div>

        <div className="space-y-0">
          <Row label="Chain"    value={bc?.chain ?? '—'} mono />
          <Row label="Headers"  value={formatNumber(bc?.headers ?? 0)} />
          <Row label="Uptime"   value={formatUptime(status?.uptime ?? 0)} />
          <Row label="Version"  value={net?.subversion ?? '—'} mono />
        </div>
      </Card>

      {/* Blockchain */}
      <Card title="Blockchain" accent="⛓️">
        <div>
          <Label>Difficulty</Label>
          <BigValue>{formatDifficulty(bc?.difficulty ?? 0)}</BigValue>
        </div>
        <div className="space-y-0">
          <Row label="Best Hash"    value={formatHash(bc?.bestblockhash ?? '', 8)} mono />
          <Row label="Size on Disk" value={formatBytes(bc?.size_on_disk ?? 0)} />
          <Row label="Protocol"     value={net?.protocolversion ?? '—'} />
        </div>
      </Card>

      {/* Mempool */}
      <Card title="Mempool" accent="📦">
        <div className="flex gap-6">
          <div>
            <Label>Transactions</Label>
            <BigValue>{formatNumber(mem?.size ?? 0)}</BigValue>
          </div>
          <div>
            <Label>Size</Label>
            <BigValue className="text-xl">{formatBytes(mem?.bytes ?? 0)}</BigValue>
          </div>
        </div>
        <div className="space-y-0">
          <Row
            label="Min Fee"
            value={`${((mem?.mempoolminfee ?? 0) * 1e5).toFixed(1)} sat/vB`}
            mono
          />
          <Row label="Usage" value={formatBytes(mem?.usage ?? 0)} />
          <Row label="Pooled Txs" value={formatNumber(status?.mining?.pooledtx ?? 0)} />
        </div>
      </Card>

      {/* Network */}
      <Card title="Network" accent="🌐">
        <div className="flex gap-6">
          <div>
            <Label>Connections</Label>
            <BigValue>{net?.connections ?? 0}</BigValue>
          </div>
          <div className="flex gap-4 self-end mb-1">
            <span className="text-xs text-mim-green font-mono">
              ↓ {net?.connections_in ?? 0} in
            </span>
            <span className="text-xs text-bitcoin-orange font-mono">
              ↑ {net?.connections_out ?? 0} out
            </span>
          </div>
        </div>
        <div className="space-y-0">
          <Row label="Sent"     value={formatBytes(net?.totalbytessent ?? 0)} />
          <Row label="Received" value={formatBytes(net?.totalbytesrecv ?? 0)} />
        </div>
      </Card>

      {/* Fee Estimates */}
      <Card title="Fee Estimates" accent="💸">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Next Block', key: 'fast',   color: 'text-mim-red' },
            { label: '~1 Hour',    key: 'medium', color: 'text-mim-yellow' },
            { label: '~1 Day',     key: 'slow',   color: 'text-mim-green' },
          ].map(({ label, key, color }) => {
            const satVb = fees?.[key as keyof Fees]?.satVb;
            return (
              <div
                key={key}
                className="bg-mim-surface-2 rounded-lg p-3 text-center border border-mim-border"
              >
                <p className={`text-lg font-bold font-mono ${color}`}>
                  {satVb ?? '—'}
                </p>
                <p className="text-[10px] text-mim-text-muted mt-1">sat/vB</p>
                <p className="text-[10px] text-mim-text-dim mt-0.5 uppercase tracking-wide">
                  {label}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Latest Block */}
      <Card title="Latest Block" accent="🧱">
        {latestBlock ? (
          <>
            <div className="flex items-end justify-between">
              <div>
                <Label>Height</Label>
                <BigValue className="text-bitcoin-orange">
                  #{latestBlock.height}
                </BigValue>
              </div>
              <span className="text-xs text-mim-text-muted font-mono">
                {formatTimeAgo(latestBlock.time)}
              </span>
            </div>
            <div className="space-y-0">
              <Row label="Hash" value={formatHash(latestBlock.hash, 10)} mono />
              <Row label="Transactions" value={formatNumber(latestBlock.nTx)} />
              {latestBlock.totalFees != null && (
                <Row
                  label="Total Fees"
                  value={`${latestBlock.totalFees.toFixed(8)} BTC`}
                  mono
                />
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-mim-text-muted">Waiting for block data…</p>
        )}
      </Card>

      {/* Fee History Chart — spans full width */}
      <div className="col-span-1 md:col-span-2 xl:col-span-3">
        <FeeHistoryChart />
      </div>

    </div>
  );
}
