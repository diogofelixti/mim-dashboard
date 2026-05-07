'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { api, getToken } from '@/lib/api';
import { formatHash, formatNumber } from '@/lib/formatters';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type WalletBalance = {
  confirmed: number;
  unconfirmed: number;
  immature: number;
  utxoCount: number;
};

type WalletAddress = {
  address: string;
  label: string;
  type: string;
  used: boolean;
};

type UTXO = {
  txid: string;
  vout: number;
  address: string;
  label: string;
  amount: number;
  amount_sats: number;
  confirmations: number;
  spendable: boolean;
  solvable: boolean;
  safe: boolean;
  locked: boolean;
};

type WalletTx = {
  txid: string;
  category: 'send' | 'receive' | 'generate' | 'immature';
  amount: number;
  confirmations: number;
  time: number;
};

type TxNote = {
  id: number;
  txid: string;
  note: string;
  created_at: string;
};

type CreateForm = {
  name: string;
  descriptors: boolean;
  blank: boolean;
  disablePrivateKeys: boolean;
};

type NewAddrForm = {
  label: string;
  type: 'bech32' | 'bech32m' | 'p2sh-segwit' | 'legacy';
};

type ConfFilter = 'all' | '1' | '6' | '100';

const ADDR_TYPES = ['bech32', 'bech32m', 'p2sh-segwit', 'legacy'] as const;
const CONF_FILTERS: { id: ConfFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: '1',   label: '1+' },
  { id: '6',   label: '6+' },
  { id: '100', label: '100+' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
      {children}
    </h2>
  );
}

function StatCard({ label, value, color = 'text-mim-text' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-mim-surface border border-mim-border rounded-xl p-4 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">{label}</p>
      <p className={`font-mono text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
      title="Copy"
      className="text-mim-text-dim hover:text-mim-text transition-colors text-sm flex-shrink-0"
    >
      {ok ? '✓' : '⧉'}
    </button>
  );
}

function confColor(c: number): string {
  if (c === 0) return 'text-mim-red';
  if (c < 6)   return 'text-mim-yellow';
  return 'text-mim-green';
}

export default function WalletsPage() {
  const [loaded,         setLoaded]         = useState<string[]>([]);
  const [available,      setAvailable]      = useState<string[]>([]);
  const [active,         setActive]         = useState('');
  const [balance,        setBalance]        = useState<WalletBalance | null>(null);
  const [addresses,      setAddresses]      = useState<WalletAddress[]>([]);
  const [utxos,          setUtxos]          = useState<UTXO[]>([]);
  const [history,        setHistory]        = useState<WalletTx[]>([]);
  const [selected,       setSelected]       = useState<Set<string>>(new Set());
  const [loadingData,    setLoadingData]    = useState(false);
  const [loadingWallet,  setLoadingWallet]  = useState('');
  const [creating,       setCreating]       = useState(false);
  const [generatingAddr, setGeneratingAddr] = useState(false);
  const [backingUp,      setBackingUp]      = useState(false);
  const [error,          setError]          = useState('');
  const [notice,         setNotice]         = useState('');
  const [showModal,      setShowModal]      = useState(false);
  const [createForm,     setCreateForm]     = useState<CreateForm>({
    name: '', descriptors: true, blank: false, disablePrivateKeys: false,
  });
  const [newAddrForm, setNewAddrForm] = useState<NewAddrForm>({ label: '', type: 'bech32' });

  // TX Notes
  const [txNotes,        setTxNotes]        = useState<Record<string, TxNote[]>>({});
  const [expandedTx,     setExpandedTx]     = useState<string | null>(null);
  const [noteDraft,      setNoteDraft]      = useState('');
  const [savingNote,     setSavingNote]     = useState(false);

  // Coin Control filters
  const [search,         setSearch]         = useState('');
  const [confFilter,     setConfFilter]     = useState<ConfFilter>('all');
  const [spendableOnly,  setSpendableOnly]  = useState(false);

  const notLoaded = available.filter((w) => !loaded.includes(w));

  // Filtered UTXOs
  const filteredUtxos = useMemo(() => {
    let list = utxos;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) =>
        u.address.toLowerCase().includes(q) ||
        u.txid.toLowerCase().includes(q) ||
        (u.label && u.label.toLowerCase().includes(q))
      );
    }
    if (confFilter !== 'all') {
      const min = parseInt(confFilter, 10);
      list = list.filter((u) => u.confirmations >= min);
    }
    if (spendableOnly) {
      list = list.filter((u) => u.spendable && !u.locked);
    }
    return list;
  }, [utxos, search, confFilter, spendableOnly]);

  const selectedTotal = utxos
    .filter((u) => selected.has(`${u.txid}:${u.vout}`))
    .reduce((s, u) => s + u.amount, 0);

  const selectedTotalSats = utxos
    .filter((u) => selected.has(`${u.txid}:${u.vout}`))
    .reduce((s, u) => s + u.amount_sats, 0);

  const totalBtc  = utxos.reduce((s, u) => s + u.amount, 0);
  const totalSats = utxos.reduce((s, u) => s + u.amount_sats, 0);

  async function refreshWallets() {
    const d = await api<{ loaded: string[]; available: string[] }>('/api/wallets');
    setLoaded(d.loaded);
    setAvailable(d.available);
    return d;
  }

  useEffect(() => {
    refreshWallets()
      .then((d) => { if (d.loaded.length) setActive(d.loaded[0]); })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!active) return;
    setLoadingData(true);
    const enc = encodeURIComponent(active);
    Promise.all([
      api<WalletBalance>(`/api/wallets/${enc}/balance`),
      api<{ addresses: WalletAddress[] }>(`/api/wallets/${enc}/addresses`),
      api<{ utxos: UTXO[] }>(`/api/wallets/${enc}/utxos`),
      api<{ txs: WalletTx[] }>(`/api/wallets/${enc}/history?limit=20`),
    ])
      .then(async ([bal, addrs, utxoData, hist]) => {
        setBalance(bal);
        setAddresses(addrs.addresses);
        setUtxos(utxoData.utxos);
        setHistory(hist.txs);
        setSelected(new Set());
        setSearch('');
        setConfFilter('all');
        setSpendableOnly(false);
        setExpandedTx(null);
        setNoteDraft('');
        // Batch-fetch notes for history txids
        const txids = [...new Set(hist.txs.map((t: WalletTx) => t.txid))];
        if (txids.length > 0) {
          try {
            const nd = await api<{ notes: Record<string, TxNote[]> }>('/api/tx/notes/batch', {
              method: 'POST',
              body: JSON.stringify({ txids }),
            });
            setTxNotes(nd.notes);
          } catch { setTxNotes({}); }
        } else {
          setTxNotes({});
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingData(false));
  }, [active]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  }

  async function handleCreate() {
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await api('/api/wallets', { method: 'POST', body: JSON.stringify(createForm) });
      await refreshWallets();
      setActive(createForm.name.trim());
      setShowModal(false);
      setCreateForm({ name: '', descriptors: true, blank: false, disablePrivateKeys: false });
      flash('Wallet created.');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setCreating(false); }
  }

  async function handleUnload() {
    try {
      await api(`/api/wallets/${encodeURIComponent(active)}/unload`, { method: 'POST' });
      const d = await refreshWallets();
      setActive(d.loaded[0] ?? '');
      setBalance(null);
      flash('Wallet unloaded.');
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleLoad(name: string) {
    setLoadingWallet(name);
    try {
      await api(`/api/wallets/${encodeURIComponent(name)}/load`, { method: 'POST' });
      await refreshWallets();
      setActive(name);
      flash(`Wallet "${name || '(default)'}" loaded.`);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoadingWallet(''); }
  }

  async function handleGenerateAddress() {
    setGeneratingAddr(true);
    try {
      const d = await api<{ address: string }>(`/api/wallets/${encodeURIComponent(active)}/address`, {
        method: 'POST',
        body: JSON.stringify(newAddrForm),
      });
      setAddresses((prev) => [
        { address: d.address, label: newAddrForm.label, type: newAddrForm.type, used: false },
        ...prev,
      ]);
      flash(`Generated: ${d.address}`);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setGeneratingAddr(false); }
  }

  async function handleToggleLock(utxo: UTXO) {
    const action = utxo.locked ? 'unlock' : 'lock';
    try {
      await api(`/api/wallets/${encodeURIComponent(active)}/utxos/${action}`, {
        method: 'POST',
        body: JSON.stringify({ txid: utxo.txid, vout: utxo.vout }),
      });
      setUtxos((prev) =>
        prev.map((u) => u.txid === utxo.txid && u.vout === utxo.vout ? { ...u, locked: !u.locked } : u)
      );
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleBulkLock(lock: boolean) {
    const targets = utxos.filter((u) => selected.has(`${u.txid}:${u.vout}`));
    const action = lock ? 'lock' : 'unlock';
    try {
      for (const u of targets) {
        await api(`/api/wallets/${encodeURIComponent(active)}/utxos/${action}`, {
          method: 'POST',
          body: JSON.stringify({ txid: u.txid, vout: u.vout }),
        });
      }
      setUtxos((prev) =>
        prev.map((u) => selected.has(`${u.txid}:${u.vout}`) ? { ...u, locked: lock } : u)
      );
      flash(`${targets.length} UTXOs ${lock ? 'locked' : 'unlocked'}.`);
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleBackup() {
    setBackingUp(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_BASE}/api/wallets/${encodeURIComponent(active)}/backup`,
        {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="(.+?)"/);
      const filename = match?.[1] ?? `wallet-${active || 'default'}-backup.dat`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      flash(`Backup downloaded: ${filename}`);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setBackingUp(false); }
  }

  function toggleUtxo(key: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function selectAll() {
    setSelected(new Set(filteredUtxos.map((u) => `${u.txid}:${u.vout}`)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleAddNote(txid: string) {
    if (!noteDraft.trim()) return;
    setSavingNote(true);
    try {
      const note = await api<TxNote>(`/api/tx/${encodeURIComponent(txid)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: noteDraft.trim() }),
      });
      setTxNotes((prev) => ({
        ...prev,
        [txid]: [note, ...(prev[txid] ?? [])],
      }));
      setNoteDraft('');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSavingNote(false); }
  }

  async function handleDeleteNote(txid: string, noteId: number) {
    try {
      await api(`/api/tx/${encodeURIComponent(txid)}/notes/${noteId}`, { method: 'DELETE' });
      setTxNotes((prev) => ({
        ...prev,
        [txid]: (prev[txid] ?? []).filter((n) => n.id !== noteId),
      }));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  function handleSendSelected() {
    const selectedUtxos = utxos
      .filter((u) => selected.has(`${u.txid}:${u.vout}`))
      .map((u) => ({
        txid: u.txid,
        vout: u.vout,
        amount: u.amount,
        amount_sats: u.amount_sats,
        address: u.address,
        confirmations: u.confirmations,
      }));
    localStorage.setItem('mim-selected-utxos', JSON.stringify(selectedUtxos));
    localStorage.setItem('mim-coin-control-wallet', active);
    window.location.href = '/transactions';
  }

  const catColor = (c: WalletTx['category']) =>
    c === 'receive' || c === 'generate' ? 'text-mim-green' : 'text-mim-red';

  const formatTimeAgo = (ts: number) => {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {error  && <p className="text-mim-red  text-xs font-mono">{error}</p>}
      {notice && <p className="text-mim-green text-xs font-mono">{notice}</p>}

      {/* Active Wallets */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle>Active Wallets</SectionTitle>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-2 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark transition-colors"
          >
            + Create
          </button>
        </div>
        {loaded.length === 0 ? (
          <p className="text-xs text-mim-text-dim">No wallets loaded.</p>
        ) : (
          <div className="grid gap-2">
            {loaded.map((w) => (
              <button
                key={w}
                onClick={() => setActive(w)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                  active === w
                    ? 'border-bitcoin-orange/60 bg-bitcoin-orange/5'
                    : 'border-mim-border bg-mim-surface hover:border-mim-border-light'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-mim-green flex-shrink-0" />
                <span className="text-sm font-medium text-mim-text flex-1">{w || '(default)'}</span>
                <span className="text-[10px] font-semibold text-mim-green">Loaded</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Available (not loaded) Wallets */}
      {notLoaded.length > 0 && (
        <section>
          <SectionTitle>Available Wallets</SectionTitle>
          <div className="grid gap-2">
            {notLoaded.map((w) => (
              <div
                key={w}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-mim-border bg-mim-surface"
              >
                <span className="w-2 h-2 rounded-full bg-mim-text-dim flex-shrink-0" />
                <span className="text-sm text-mim-text-muted flex-1">{w || '(default)'}</span>
                <button
                  onClick={() => handleLoad(w)}
                  disabled={loadingWallet === w}
                  className="px-3 py-1.5 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
                >
                  {loadingWallet === w ? 'Loading…' : 'Load'}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Wallet Detail */}
      {active && loaded.includes(active) && (
        <>
          {/* Wallet actions */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h3 className="text-sm font-semibold text-mim-text">{active || '(default)'}</h3>
            <button
              onClick={handleUnload}
              className="px-3 py-1.5 rounded-lg border border-mim-border text-mim-text-muted text-xs hover:border-mim-border-light hover:text-mim-text transition-colors"
            >
              Unload
            </button>
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="ml-auto px-3 py-1.5 rounded-lg border border-mim-border text-mim-text-muted text-xs hover:border-mim-border-light hover:text-mim-text transition-colors disabled:opacity-40"
            >
              {backingUp ? 'Downloading…' : '↓ Backup'}
            </button>
          </div>

          {loadingData ? (
            <p className="text-xs text-mim-text-muted animate-pulse">Loading wallet data…</p>
          ) : (
            <>
              {/* Balance */}
              {balance && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard label="Confirmed"   value={`${balance.confirmed.toFixed(8)} BTC`}  color="text-mim-green" />
                  <StatCard label="Unconfirmed" value={`${balance.unconfirmed.toFixed(8)} BTC`} color="text-mim-yellow" />
                  <StatCard label="Immature"    value={`${balance.immature.toFixed(8)} BTC`}    color="text-mim-text-muted" />
                  <StatCard label="UTXOs"       value={formatNumber(balance.utxoCount)} />
                </div>
              )}

              {/* Addresses */}
              <div>
                <SectionTitle>Addresses</SectionTitle>
                <div className="flex flex-wrap gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={newAddrForm.label}
                    onChange={(e) => setNewAddrForm((f) => ({ ...f, label: e.target.value }))}
                    className="bg-mim-surface border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2 w-44 focus:outline-none focus:border-bitcoin-orange/60"
                  />
                  <select
                    value={newAddrForm.type}
                    onChange={(e) => setNewAddrForm((f) => ({ ...f, type: e.target.value as NewAddrForm['type'] }))}
                    className="bg-mim-surface border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-bitcoin-orange/60"
                  >
                    {ADDR_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button
                    onClick={handleGenerateAddress}
                    disabled={generatingAddr}
                    className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
                  >
                    {generatingAddr ? '…' : '+ New Address'}
                  </button>
                </div>
                {addresses.length > 0 && (
                  <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-mim-border">
                          {['Address', '', 'Label', 'Type', 'Status'].map((h, i) => (
                            <th key={`${h}-${i}`} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${i > 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {addresses.map((a) => (
                          <tr key={a.address} className="border-b border-mim-border last:border-0 hover:bg-mim-surface-2 transition-colors">
                            <td className="px-4 py-2.5 text-hash font-mono text-xs">{formatHash(a.address, 12)}</td>
                            <td className="py-2.5 w-8"><CopyBtn text={a.address} /></td>
                            <td className="px-4 py-2.5 text-mim-text-muted text-xs">{a.label || '—'}</td>
                            <td className="px-4 py-2.5 text-right text-mim-text-dim text-xs">{a.type}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`text-[10px] font-semibold ${a.used ? 'text-mim-text-dim' : 'text-mim-green'}`}>
                                {a.used ? 'used' : 'fresh'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {addresses.length === 0 && <p className="text-xs text-mim-text-dim">No addresses yet.</p>}
              </div>

              {/* ── Coin Control ─────────────────────────────────────────────── */}
              <div>
                {/* Header */}
                <div className="flex items-center justify-between mb-1">
                  <SectionTitle>Coin Control — UTXOs</SectionTitle>
                  <span className="text-xs text-mim-text-muted font-mono">
                    {utxos.length} UTXOs · {totalBtc.toFixed(8)} BTC ({formatNumber(totalSats)} sats)
                  </span>
                </div>

                {selected.size > 0 && (
                  <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-bitcoin-orange/5 border border-bitcoin-orange/20">
                    <span className="text-xs text-bitcoin-orange font-semibold">
                      Selected: {selected.size} UTXOs · {selectedTotal.toFixed(8)} BTC ({formatNumber(selectedTotalSats)} sats)
                    </span>
                  </div>
                )}

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Search address, txid, or label…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-mim-surface border border-mim-border text-mim-text text-xs rounded-lg px-3 py-2 w-64 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim"
                  />
                  <div className="flex gap-1">
                    {CONF_FILTERS.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setConfFilter(f.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          confFilter === f.id
                            ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                            : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={spendableOnly}
                      onChange={(e) => setSpendableOnly(e.target.checked)}
                      className="accent-bitcoin-orange w-3.5 h-3.5"
                    />
                    <span className="text-xs text-mim-text-muted">Spendable only</span>
                  </label>
                  <div className="ml-auto flex gap-1">
                    <button
                      onClick={selectAll}
                      className="px-2.5 py-1.5 rounded-lg text-xs border border-mim-border text-mim-text-muted hover:border-mim-border-light hover:text-mim-text transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={deselectAll}
                      className="px-2.5 py-1.5 rounded-lg text-xs border border-mim-border text-mim-text-muted hover:border-mim-border-light hover:text-mim-text transition-colors"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* UTXO Table */}
                {filteredUtxos.length === 0 ? (
                  <p className="text-xs text-mim-text-dim">
                    {utxos.length === 0 ? 'No UTXOs.' : 'No UTXOs match current filters.'}
                  </p>
                ) : (
                  <div className="bg-mim-surface border border-mim-border rounded-xl overflow-x-auto">
                    <div>
                      <table className="w-full text-sm min-w-[700px]">
                        <thead>
                          <tr className="border-b border-mim-border">
                            <th className="px-3 py-3 w-8">
                              <input
                                type="checkbox"
                                checked={filteredUtxos.length > 0 && filteredUtxos.every((u) => selected.has(`${u.txid}:${u.vout}`))}
                                onChange={() => {
                                  const allSelected = filteredUtxos.every((u) => selected.has(`${u.txid}:${u.vout}`));
                                  if (allSelected) {
                                    setSelected((prev) => {
                                      const s = new Set(prev);
                                      filteredUtxos.forEach((u) => s.delete(`${u.txid}:${u.vout}`));
                                      return s;
                                    });
                                  } else {
                                    setSelected((prev) => {
                                      const s = new Set(prev);
                                      filteredUtxos.forEach((u) => s.add(`${u.txid}:${u.vout}`));
                                      return s;
                                    });
                                  }
                                }}
                                className="accent-bitcoin-orange"
                              />
                            </th>
                            {[
                              { label: 'Amount (BTC)',  align: 'text-right' },
                              { label: 'Sats',          align: 'text-right' },
                              { label: 'Address',       align: 'text-left' },
                              { label: 'Confs',         align: 'text-right' },
                              { label: 'Outpoint',      align: 'text-left' },
                              { label: 'Label',         align: 'text-left' },
                              { label: '',              align: 'text-right' },
                            ].map((h, i) => (
                              <th key={i} className={`px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${h.align} whitespace-nowrap`}>
                                {h.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUtxos.map((u) => {
                            const key = `${u.txid}:${u.vout}`;
                            const isSel = selected.has(key);
                            return (
                              <tr
                                key={key}
                                onClick={() => toggleUtxo(key)}
                                className={`border-b border-mim-border last:border-0 transition-colors cursor-pointer ${
                                  isSel
                                    ? 'bg-bitcoin-orange/5 border-l-2 border-l-bitcoin-orange'
                                    : u.locked
                                      ? 'opacity-50'
                                      : 'hover:bg-mim-surface-2'
                                } ${u.confirmations === 0 ? 'border-l-2 border-l-mim-yellow' : ''}`}
                              >
                                <td className="px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={isSel}
                                    onChange={() => toggleUtxo(key)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="accent-bitcoin-orange"
                                  />
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-mim-text text-xs whitespace-nowrap">
                                  {u.amount.toFixed(8)}
                                </td>
                                <td className="px-3 py-2.5 text-right font-mono text-mim-text-muted text-xs whitespace-nowrap">
                                  {formatNumber(u.amount_sats)}
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-hash font-mono">{formatHash(u.address, 10)}</span>
                                    <CopyBtn text={u.address} />
                                  </div>
                                </td>
                                <td className={`px-3 py-2.5 text-right text-xs font-semibold ${confColor(u.confirmations)}`}>
                                  {formatNumber(u.confirmations)}
                                </td>
                                <td className="px-3 py-2.5 text-xs">
                                  <a
                                    href={`/explorer/tx/${u.txid}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-hash font-mono hover:text-bitcoin-orange transition-colors"
                                  >
                                    {formatHash(u.txid, 8)}:{u.vout}
                                  </a>
                                </td>
                                <td className="px-3 py-2.5 text-mim-text-muted text-xs max-w-[120px] truncate">
                                  {u.label || '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleToggleLock(u); }}
                                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                                      u.locked
                                        ? 'border-mim-yellow/40 text-mim-yellow hover:border-mim-yellow'
                                        : 'border-mim-border text-mim-text-dim hover:border-mim-border-light'
                                    }`}
                                  >
                                    {u.locked ? '🔒 locked' : '🔓 unlock'}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Footer actions */}
                {selected.size > 0 && (
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <button
                      onClick={handleSendSelected}
                      className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark transition-colors"
                    >
                      Send Selected UTXOs →
                    </button>
                    <button
                      onClick={() => handleBulkLock(true)}
                      className="px-3 py-2 rounded-lg border border-mim-border text-mim-text-muted text-xs hover:border-mim-border-light hover:text-mim-text transition-colors"
                    >
                      Lock Selected
                    </button>
                    <button
                      onClick={() => handleBulkLock(false)}
                      className="px-3 py-2 rounded-lg border border-mim-border text-mim-text-muted text-xs hover:border-mim-border-light hover:text-mim-text transition-colors"
                    >
                      Unlock Selected
                    </button>
                  </div>
                )}
              </div>

              {/* History */}
              <div>
                <SectionTitle>History</SectionTitle>
                {history.length === 0 ? (
                  <p className="text-xs text-mim-text-dim">No transactions yet.</p>
                ) : (
                  <div className="bg-mim-surface border border-mim-border rounded-xl overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead>
                        <tr className="border-b border-mim-border">
                          {['Txid', 'Category', 'Amount', 'Confs', 'Time', 'Notes'].map((h, i) => (
                            <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${i > 1 && i < 5 ? 'text-right' : 'text-left'} ${i === 5 ? 'text-center' : ''}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((tx, idx) => {
                          const notes = txNotes[tx.txid] ?? [];
                          const isExpanded = expandedTx === `${tx.txid}-${idx}`;
                          const rowKey = `${tx.txid}-${idx}`;
                          return (
                            <Fragment key={rowKey}>
                              <tr
                                onClick={() => { setExpandedTx(isExpanded ? null : rowKey); setNoteDraft(''); }}
                                className={`border-b border-mim-border last:border-0 hover:bg-mim-surface-2 transition-colors cursor-pointer ${isExpanded ? 'bg-mim-surface-2' : ''}`}
                              >
                                <td className="px-4 py-2.5">
                                  <a
                                    href={`/explorer/tx/${tx.txid}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-hash font-mono text-xs hover:text-bitcoin-orange transition-colors"
                                  >
                                    {formatHash(tx.txid, 10)}
                                  </a>
                                </td>
                                <td className={`px-4 py-2.5 text-xs font-semibold ${catColor(tx.category)}`}>{tx.category}</td>
                                <td className={`px-4 py-2.5 text-right font-mono text-xs ${catColor(tx.category)}`}>
                                  {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(8)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-mim-text-muted text-xs">{tx.confirmations}</td>
                                <td className="px-4 py-2.5 text-right text-mim-text-muted text-xs">{formatTimeAgo(tx.time)}</td>
                                <td className="px-4 py-2.5 text-center">
                                  {notes.length > 0 ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-bitcoin-orange">
                                      {notes.length}
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-mim-text-dim">+</span>
                                  )}
                                </td>
                              </tr>
                              {isExpanded && (
                                <tr key={`${rowKey}-notes`} className="border-b border-mim-border last:border-0">
                                  <td colSpan={6} className="px-4 py-3 bg-mim-bg/50">
                                    <div className="space-y-2 max-w-lg">
                                      {/* Existing notes */}
                                      {notes.map((n) => (
                                        <div key={n.id} className="flex items-start gap-2 group">
                                          <p className="text-xs text-mim-text flex-1">{n.note}</p>
                                          <span className="text-[10px] text-mim-text-dim flex-shrink-0">
                                            {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteNote(tx.txid, n.id); }}
                                            className="text-[10px] text-mim-red opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                          >
                                            delete
                                          </button>
                                        </div>
                                      ))}
                                      {/* Add note input */}
                                      <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                        <input
                                          type="text"
                                          value={noteDraft}
                                          onChange={(e) => setNoteDraft(e.target.value)}
                                          onKeyDown={(e) => e.key === 'Enter' && handleAddNote(tx.txid)}
                                          placeholder="Add a note…"
                                          className="flex-1 bg-mim-surface border border-mim-border text-mim-text text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim"
                                        />
                                        <button
                                          onClick={() => handleAddNote(tx.txid)}
                                          disabled={savingNote || !noteDraft.trim()}
                                          className="px-3 py-1.5 rounded-lg bg-bitcoin-orange text-black text-[10px] font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
                                        >
                                          {savingNote ? '…' : 'Save'}
                                        </button>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Create Wallet Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-mim-surface border border-mim-border rounded-2xl p-6 w-full max-w-sm space-y-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-mim-text">Create Wallet</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted block mb-1">Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="my-wallet"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  className="w-full bg-mim-bg border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-bitcoin-orange/60"
                />
              </div>
              {(
                [
                  ['descriptors',        'Descriptor wallet'],
                  ['blank',              'Blank (no keys generated)'],
                  ['disablePrivateKeys', 'Disable private keys (watch-only)'],
                ] as [keyof CreateForm, string][]
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createForm[key] as boolean}
                    onChange={(e) => setCreateForm((f) => ({ ...f, [key]: e.target.checked }))}
                    className="accent-bitcoin-orange w-4 h-4"
                  />
                  <span className="text-sm text-mim-text">{label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-mim-border text-mim-text-muted text-sm hover:border-mim-border-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createForm.name.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
