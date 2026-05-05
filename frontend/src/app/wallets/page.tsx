'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatHash, formatTimeAgo, formatNumber } from '@/lib/formatters';

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
  amount: number;
  confirmations: number;
  locked: boolean;
};

type WalletTx = {
  txid: string;
  category: 'send' | 'receive' | 'generate' | 'immature';
  amount: number;
  confirmations: number;
  time: number;
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

const ADDR_TYPES = ['bech32', 'bech32m', 'p2sh-segwit', 'legacy'] as const;

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

  const notLoaded = available.filter((w) => !loaded.includes(w));

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
      .then(([bal, addrs, utxoData, hist]) => {
        setBalance(bal);
        setAddresses(addrs.addresses);
        setUtxos(utxoData.utxos);
        setHistory(hist.txs);
        setSelected(new Set());
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

  async function handleBackup() {
    setBackingUp(true);
    try {
      await api(`/api/wallets/${encodeURIComponent(active)}/backup`, { method: 'POST' });
      flash('Backup saved on node.');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setBackingUp(false); }
  }

  function toggleUtxo(key: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  }

  function toggleAll() {
    setSelected(selected.size === utxos.length ? new Set() : new Set(utxos.map((u) => `${u.txid}:${u.vout}`)));
  }

  const catColor = (c: WalletTx['category']) =>
    c === 'receive' || c === 'generate' ? 'text-mim-green' : 'text-mim-red';

  const selectedTotal = utxos
    .filter((u) => selected.has(`${u.txid}:${u.vout}`))
    .reduce((s, u) => s + u.amount, 0);

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
              {backingUp ? 'Saving…' : 'Backup'}
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

              {/* UTXOs */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <SectionTitle>UTXOs — Coin Control</SectionTitle>
                  {selected.size > 0 && (
                    <span className="text-xs text-bitcoin-orange font-semibold">
                      {selected.size} selected · {selectedTotal.toFixed(8)} BTC
                    </span>
                  )}
                </div>
                {utxos.length === 0 ? (
                  <p className="text-xs text-mim-text-dim">No UTXOs.</p>
                ) : (
                  <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-mim-border">
                          <th className="px-4 py-3 w-8">
                            <input type="checkbox" checked={selected.size === utxos.length} onChange={toggleAll} className="accent-bitcoin-orange" />
                          </th>
                          {['Outpoint', 'Address', 'Amount (BTC)', 'Confs', 'Status'].map((h, i) => (
                            <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {utxos.map((u) => {
                          const key = `${u.txid}:${u.vout}`;
                          return (
                            <tr key={key} className={`border-b border-mim-border last:border-0 transition-colors ${selected.has(key) ? 'bg-bitcoin-orange/5' : 'hover:bg-mim-surface-2'}`}>
                              <td className="px-4 py-2.5">
                                <input type="checkbox" checked={selected.has(key)} onChange={() => toggleUtxo(key)} className="accent-bitcoin-orange" />
                              </td>
                              <td className="px-4 py-2.5 text-hash font-mono text-xs">{formatHash(u.txid, 8)}:{u.vout}</td>
                              <td className="px-4 py-2.5 text-hash text-xs">{formatHash(u.address, 10)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-mim-text text-xs">{u.amount.toFixed(8)}</td>
                              <td className="px-4 py-2.5 text-right text-mim-text-muted text-xs">{u.confirmations}</td>
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => handleToggleLock(u)}
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                                    u.locked
                                      ? 'border-mim-yellow/40 text-mim-yellow hover:border-mim-yellow'
                                      : 'border-mim-border text-mim-text-dim hover:border-mim-border-light'
                                  }`}
                                >
                                  {u.locked ? '🔒 locked' : 'unlock'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* History */}
              <div>
                <SectionTitle>History</SectionTitle>
                {history.length === 0 ? (
                  <p className="text-xs text-mim-text-dim">No transactions yet.</p>
                ) : (
                  <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-mim-border">
                          {['Txid', 'Category', 'Amount', 'Confs', 'Time'].map((h, i) => (
                            <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((tx, idx) => (
                          <tr key={`${tx.txid}-${idx}`} className="border-b border-mim-border last:border-0 hover:bg-mim-surface-2 transition-colors">
                            <td className="px-4 py-2.5 text-hash font-mono text-xs">{formatHash(tx.txid, 10)}</td>
                            <td className={`px-4 py-2.5 text-xs font-semibold ${catColor(tx.category)}`}>{tx.category}</td>
                            <td className={`px-4 py-2.5 text-right font-mono text-xs ${catColor(tx.category)}`}>
                              {tx.amount > 0 ? '+' : ''}{tx.amount.toFixed(8)}
                            </td>
                            <td className="px-4 py-2.5 text-right text-mim-text-muted text-xs">{tx.confirmations}</td>
                            <td className="px-4 py-2.5 text-right text-mim-text-muted text-xs">{formatTimeAgo(tx.time)}</td>
                          </tr>
                        ))}
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
