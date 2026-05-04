'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatTimeAgo, formatHash } from '@/lib/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────
type WatchEntry = {
  id: string;
  address: string;
  label: string;
  active: boolean;
};

type AlertRule = {
  id: string;
  type: 'new_tx' | 'balance_change' | 'block' | 'fee_spike';
  condition: string;
  threshold: string;
  active: boolean;
};

type AlertEvent = {
  id: string;
  ruleId: string;
  type: string;
  data: string;
  time: number;
  read: boolean;
};

const RULE_TYPES: { id: AlertRule['type']; label: string }[] = [
  { id: 'new_tx',        label: 'New Transaction (address)' },
  { id: 'balance_change',label: 'Balance Change' },
  { id: 'block',         label: 'New Block' },
  { id: 'fee_spike',     label: 'Fee Spike' },
];

// ── Small UI ──────────────────────────────────────────────────────────────────
function SectionTitle({ children, badge }: { children: React.ReactNode; badge?: number }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
        {children}
      </h2>
      {badge !== undefined && badge > 0 && (
        <span className="bg-bitcoin-orange text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
          {badge}
        </span>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-mim-green' : 'bg-mim-border'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`}
      />
    </button>
  );
}

function FieldInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`bg-mim-surface border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim transition-colors ${className}`}
    />
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AlertsPage() {
  const [watchlist,  setWatchlist]  = useState<WatchEntry[]>([]);
  const [rules,      setRules]      = useState<AlertRule[]>([]);
  const [events,     setEvents]     = useState<AlertEvent[]>([]);

  const [newAddress, setNewAddress] = useState('');
  const [newLabel,   setNewLabel]   = useState('');
  const [addingWatch,setAddingWatch]= useState(false);

  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleForm, setRuleForm] = useState<Omit<AlertRule, 'id' | 'active'>>({
    type: 'new_tx', condition: '', threshold: '',
  });
  const [savingRule, setSavingRule] = useState(false);

  const [error,  setError]  = useState('');
  const [notice, setNotice] = useState('');

  const unread = events.filter((e) => !e.read).length;

  useEffect(() => {
    Promise.all([
      api<{ entries: WatchEntry[] }>('/api/alerts/watchlist'),
      api<{ rules: AlertRule[] }>('/api/alerts/rules'),
      api<{ events: AlertEvent[] }>('/api/alerts/history'),
    ])
      .then(([w, r, ev]) => {
        setWatchlist(w.entries);
        setRules(r.rules);
        setEvents(ev.events);
      })
      .catch((e) => setError(e.message));
  }, []);

  function flash(msg: string) { setNotice(msg); setTimeout(() => setNotice(''), 3000); }

  // Watchlist actions
  async function handleAddWatch() {
    if (!newAddress.trim()) return;
    setAddingWatch(true);
    try {
      const d = await api<{ entry: WatchEntry }>('/api/alerts/watchlist', {
        method: 'POST',
        body: JSON.stringify({ address: newAddress.trim(), label: newLabel.trim() }),
      });
      setWatchlist((p) => [...p, d.entry]);
      setNewAddress('');
      setNewLabel('');
      flash('Address added to watchlist.');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setAddingWatch(false); }
  }

  async function handleToggleWatch(id: string) {
    const entry = watchlist.find((w) => w.id === id);
    if (!entry) return;
    try {
      await api(`/api/alerts/watchlist/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !entry.active }),
      });
      setWatchlist((p) => p.map((w) => w.id === id ? { ...w, active: !w.active } : w));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleRemoveWatch(id: string) {
    try {
      await api(`/api/alerts/watchlist/${id}`, { method: 'DELETE' });
      setWatchlist((p) => p.filter((w) => w.id !== id));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  // Rule actions
  async function handleSaveRule() {
    setSavingRule(true);
    try {
      const d = await api<{ rule: AlertRule }>('/api/alerts/rules', {
        method: 'POST',
        body: JSON.stringify(ruleForm),
      });
      setRules((p) => [...p, d.rule]);
      setShowRuleForm(false);
      setRuleForm({ type: 'new_tx', condition: '', threshold: '' });
      flash('Alert rule created.');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSavingRule(false); }
  }

  async function handleToggleRule(id: string) {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return;
    try {
      await api(`/api/alerts/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !rule.active }),
      });
      setRules((p) => p.map((r) => r.id === id ? { ...r, active: !r.active } : r));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleMarkAllRead() {
    try {
      await api('/api/alerts/history/read-all', { method: 'POST' });
      setEvents((p) => p.map((e) => ({ ...e, read: true })));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-10 max-w-3xl">
      {error  && <p className="text-mim-red  text-xs font-mono">{error}</p>}
      {notice && <p className="text-mim-green text-xs font-mono">{notice}</p>}

      {/* ── Watchlist ─────────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Watchlist</SectionTitle>

        {/* Add form */}
        <div className="flex flex-wrap gap-2 mb-4">
          <FieldInput
            placeholder="Bitcoin address…"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            className="flex-1 min-w-48"
          />
          <FieldInput
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-40"
          />
          <button
            onClick={handleAddWatch}
            disabled={addingWatch || !newAddress.trim()}
            className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
          >
            {addingWatch ? '…' : '+ Watch'}
          </button>
        </div>

        {watchlist.length === 0 ? (
          <p className="text-xs text-mim-text-dim">No addresses in watchlist.</p>
        ) : (
          <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
            {watchlist.map((w, i) => (
              <div
                key={w.id}
                className={`flex items-center gap-3 px-4 py-3 ${i < watchlist.length - 1 ? 'border-b border-mim-border' : ''}`}
              >
                <Toggle checked={w.active} onChange={() => handleToggleWatch(w.id)} />
                <div className="flex-1 min-w-0">
                  <p className="text-hash font-mono text-xs truncate">{formatHash(w.address, 14)}</p>
                  {w.label && <p className="text-mim-text-muted text-[11px]">{w.label}</p>}
                </div>
                <button
                  onClick={() => handleRemoveWatch(w.id)}
                  className="text-mim-text-dim hover:text-mim-red text-sm transition-colors flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Alert Rules ───────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <SectionTitle>Alert Rules</SectionTitle>
          <button
            onClick={() => setShowRuleForm((v) => !v)}
            className="text-xs text-bitcoin-orange hover:underline"
          >
            {showRuleForm ? '✕ Cancel' : '+ New Rule'}
          </button>
        </div>

        {/* New rule form */}
        {showRuleForm && (
          <div className="bg-mim-surface border border-mim-border rounded-xl p-4 mb-4 space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted block mb-1">Type</label>
              <select
                value={ruleForm.type}
                onChange={(e) => setRuleForm((f) => ({ ...f, type: e.target.value as AlertRule['type'] }))}
                className="bg-mim-bg border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-bitcoin-orange/60"
              >
                {RULE_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted block mb-1">Condition</label>
                <FieldInput
                  placeholder='e.g. "address = bc1q…"'
                  value={ruleForm.condition}
                  onChange={(e) => setRuleForm((f) => ({ ...f, condition: e.target.value }))}
                  className="w-full"
                />
              </div>
              <div className="w-36">
                <label className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted block mb-1">Threshold</label>
                <FieldInput
                  placeholder="e.g. 0.01"
                  value={ruleForm.threshold}
                  onChange={(e) => setRuleForm((f) => ({ ...f, threshold: e.target.value }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveRule}
                disabled={savingRule}
                className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
              >
                {savingRule ? 'Saving…' : 'Save Rule'}
              </button>
              <button
                onClick={() => setShowRuleForm(false)}
                className="px-4 py-2 rounded-lg border border-mim-border text-mim-text-muted text-xs hover:border-mim-border-light transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <p className="text-xs text-mim-text-dim">No rules configured.</p>
        ) : (
          <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
            {rules.map((r, i) => {
              const typeLabel = RULE_TYPES.find((t) => t.id === r.type)?.label ?? r.type;
              return (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i < rules.length - 1 ? 'border-b border-mim-border' : ''}`}
                >
                  <Toggle checked={r.active} onChange={() => handleToggleRule(r.id)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-mim-text text-sm font-medium">{typeLabel}</p>
                    <p className="text-mim-text-muted text-xs truncate">
                      {r.condition}{r.threshold ? ` · threshold: ${r.threshold}` : ''}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Alert History ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between">
          <SectionTitle badge={unread}>Alert History</SectionTitle>
          {unread > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-mim-text-muted hover:text-mim-text transition-colors mb-4"
            >
              Mark all read
            </button>
          )}
        </div>

        {events.length === 0 ? (
          <p className="text-xs text-mim-text-dim">No alerts fired yet.</p>
        ) : (
          <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
            {events.map((ev, i) => (
              <div
                key={ev.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  !ev.read ? 'bg-bitcoin-orange/5' : ''
                } ${i < events.length - 1 ? 'border-b border-mim-border' : ''}`}
              >
                {!ev.read && (
                  <span className="w-1.5 h-1.5 rounded-full bg-bitcoin-orange mt-1.5 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-mim-text">{ev.type}</span>
                    <span className="text-[10px] text-mim-text-muted">{formatTimeAgo(ev.time)}</span>
                  </div>
                  <p className="text-hash text-xs truncate">{ev.data}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
