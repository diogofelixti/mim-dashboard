'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type RpcInfo = {
  host: string;
  port: number;
  network: string;
  connected: boolean;
};

type Prefs = {
  theme: 'dark' | 'light';
  currency: 'usd' | 'brl' | 'eur';
};

// ── Shared UI ─────────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-4">
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted block mb-1">
      {children}
    </label>
  );
}

function FieldInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-mim-surface border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim transition-colors ${className}`}
    />
  );
}

function SaveBtn({ loading, label = 'Save' }: { loading?: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="px-5 py-2 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
    >
      {loading ? 'Saving…' : label}
    </button>
  );
}

// ── bitcoin.conf editor ───────────────────────────────────────────────────────
function BitcoinConfEditor() {
  const [conf,    setConf]    = useState('');
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    api<{ conf: string }>('/api/settings/bitcoin-conf')
      .then((d) => setConf(d.conf))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Simple keyword highlighting rendered as styled spans in a <pre> overlay
  function highlight(text: string) {
    return text.split('\n').map((line, i) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#')) {
        return <div key={i} className="text-mim-text-dim">{line}</div>;
      }
      const eq = line.indexOf('=');
      if (eq > 0) {
        const key = line.slice(0, eq);
        const val = line.slice(eq);
        return (
          <div key={i}>
            <span className="text-bitcoin-orange">{key}</span>
            <span className="text-mim-text-muted">{val}</span>
          </div>
        );
      }
      return <div key={i} className="text-mim-text">{line || ' '}</div>;
    });
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      {loading ? (
        <p className="text-xs text-mim-text-muted animate-pulse">Loading…</p>
      ) : (
        <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-mim-border bg-mim-bg">
            <span className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
              bitcoin.conf
            </span>
            <span className="text-[10px] text-mim-text-dim">read-only (host mount)</span>
          </div>
          <pre className="px-4 py-3 text-sm font-mono leading-relaxed overflow-x-auto max-h-[500px] overflow-y-auto">
            {highlight(conf)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Preferences ───────────────────────────────────────────────────────────────
function PreferencesSection() {
  const [prefs,   setPrefs]   = useState<Prefs>({ theme: 'dark', currency: 'usd' });
  const [saving,  setSaving]  = useState(false);
  const [notice,  setNotice]  = useState('');
  const [error,   setError]   = useState('');

  useEffect(() => {
    api<Prefs>('/api/settings/preferences')
      .then(setPrefs)
      .catch(() => {/* use defaults */});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/api/settings/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
      setNotice('Preferences saved.');
      setTimeout(() => setNotice(''), 3000);
    } catch (ex: unknown) { setError((ex as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {error  && <p className="text-mim-red  text-xs font-mono">{error}</p>}
      {notice && <p className="text-mim-green text-xs font-mono">{notice}</p>}

      <div>
        <Label>Theme</Label>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, theme: t }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                prefs.theme === t
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {t === 'dark' ? '🌑 Dark' : '☀️ Light'}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>Default Currency</Label>
        <div className="flex gap-2">
          {([['usd', 'USD $'], ['brl', 'BRL R$'], ['eur', 'EUR €']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, currency: id }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                prefs.currency === id
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SaveBtn loading={saving} />
    </form>
  );
}

// ── RPC Connection ────────────────────────────────────────────────────────────
function RpcInfoSection() {
  const [info,    setInfo]    = useState<RpcInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [error,   setError]   = useState('');
  const [status,  setStatus]  = useState('');

  useEffect(() => {
    api<RpcInfo>('/api/settings/rpc')
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, []);

  async function handleTest() {
    setTesting(true);
    setStatus('');
    try {
      await api('/api/settings/rpc/test', { method: 'POST' });
      setStatus('✓ Connection OK');
    } catch (ex: unknown) { setStatus(`✗ ${(ex as Error).message}`); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      {info ? (
        <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
          {[
            ['Host',    info.host],
            ['Port',    String(info.port)],
            ['Network', info.network],
            ['Status',  info.connected ? '🟢 Connected' : '🔴 Disconnected'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-3 border-b border-mim-border last:border-0">
              <span className="text-xs text-mim-text-muted font-semibold uppercase tracking-widest">{k}</span>
              <span className={`text-sm font-mono ${k === 'Status' ? (info.connected ? 'text-mim-green' : 'text-mim-red') : 'text-mim-text'}`}>
                {v}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-mim-text-muted animate-pulse">Loading…</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 rounded-lg border border-mim-border text-mim-text-muted text-sm hover:border-mim-border-light hover:text-mim-text disabled:opacity-50 transition-colors"
        >
          {testing ? 'Testing…' : 'Test Connection'}
        </button>
        {status && (
          <span className={`text-xs font-mono ${status.startsWith('✓') ? 'text-mim-green' : 'text-mim-red'}`}>
            {status}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Change Password ───────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const [current, setCurrent]   = useState('');
  const [next,    setNext]      = useState('');
  const [confirm, setConfirm]   = useState('');
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState('');
  const [notice,  setNotice]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    if (next.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setSaving(true);
    setError('');
    try {
      await api('/api/settings/password', {
        method: 'PUT',
        body: JSON.stringify({ current, next }),
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setNotice('Password changed.');
      setTimeout(() => setNotice(''), 3000);
    } catch (ex: unknown) { setError((ex as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      {error  && <p className="text-mim-red  text-xs font-mono">{error}</p>}
      {notice && <p className="text-mim-green text-xs font-mono">{notice}</p>}

      <div>
        <Label>Current password</Label>
        <FieldInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <Label>New password</Label>
        <FieldInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <Label>Confirm new password</Label>
        <FieldInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>

      <SaveBtn loading={saving} label="Change Password" />
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Section = 'conf' | 'prefs' | 'rpc' | 'password';

const NAV: { id: Section; label: string }[] = [
  { id: 'conf',     label: 'bitcoin.conf' },
  { id: 'prefs',    label: 'Preferences' },
  { id: 'rpc',      label: 'RPC Connection' },
  { id: 'password', label: 'Change Password' },
];

export default function SettingsPage() {
  const [section, setSection] = useState<Section>('conf');

  return (
    <div className="flex gap-8 max-w-5xl">
      {/* Sidebar nav */}
      <nav className="w-44 flex-shrink-0 space-y-1">
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              section === id
                ? 'bg-mim-surface-2 text-mim-text font-medium'
                : 'text-mim-text-muted hover:text-mim-text hover:bg-mim-surface'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <SectionTitle>{NAV.find((n) => n.id === section)?.label}</SectionTitle>
        {section === 'conf'     && <BitcoinConfEditor />}
        {section === 'prefs'    && <PreferencesSection />}
        {section === 'rpc'      && <RpcInfoSection />}
        {section === 'password' && <ChangePasswordSection />}
      </div>
    </div>
  );
}
