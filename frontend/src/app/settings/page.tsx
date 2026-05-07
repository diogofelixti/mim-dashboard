'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useBtcUnit } from '@/hooks/useBtcUnit';
import { usePreferences } from '@/hooks/usePreferences';
import type { BtcUnit } from '@/lib/formatters';
import type { Lang } from '@/lib/i18n';

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
  btcUnit: BtcUnit;
  language: Lang;
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
  const { t } = usePreferences();
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
            <span className="text-[10px] text-mim-text-dim">{t('settings.readOnly')}</span>
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
  const { setUnit } = useBtcUnit();
  const { setTheme, setCurrency, setLanguage, t } = usePreferences();
  const [prefs,   setPrefs]   = useState<Prefs>({ theme: 'dark', currency: 'usd', btcUnit: 'BTC', language: 'en' });
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
      setUnit(prefs.btcUnit);
      setTheme(prefs.theme);
      setCurrency(prefs.currency);
      setLanguage(prefs.language);
      setNotice(t('settings.saved'));
      setTimeout(() => setNotice(''), 3000);
    } catch (ex: unknown) { setError((ex as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {error  && <p className="text-mim-red  text-xs font-mono">{error}</p>}
      {notice && <p className="text-mim-green text-xs font-mono">{notice}</p>}

      <div>
        <Label>{t('settings.language')}</Label>
        <div className="flex gap-2">
          {([['en', 'English'], ['pt', 'Português']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, language: id }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                prefs.language === id
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t('settings.theme')}</Label>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, theme: th }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                prefs.theme === th
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {th === 'dark' ? t('settings.dark') : t('settings.light')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label>{t('settings.currency')}</Label>
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

      <div>
        <Label>{t('settings.btcUnit')}</Label>
        <div className="flex gap-2">
          {([['BTC', '₿ BTC (0.00100000)'], ['sats', 'sats (100,000)']] as [BtcUnit, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setPrefs((p) => ({ ...p, btcUnit: id }))}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                prefs.btcUnit === id
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <SaveBtn loading={saving} label={t('settings.save')} />
    </form>
  );
}

// ── RPC Connection ────────────────────────────────────────────────────────────
function RpcInfoSection() {
  const { t } = usePreferences();
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
      setStatus(t('settings.connectionOk'));
    } catch (ex: unknown) { setStatus(`✗ ${(ex as Error).message}`); }
    finally { setTesting(false); }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      {info ? (
        <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
          {[
            [t('settings.host'),    info.host],
            [t('settings.port'),    String(info.port)],
            [t('settings.network'), info.network],
            [t('settings.status'),  info.connected ? t('settings.connected') : t('settings.disconnected')],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between px-4 py-3 border-b border-mim-border last:border-0">
              <span className="text-xs text-mim-text-muted font-semibold uppercase tracking-widest">{k}</span>
              <span className={`text-sm font-mono ${k === t('settings.status') ? (info.connected ? 'text-mim-green' : 'text-mim-red') : 'text-mim-text'}`}>
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
          {testing ? t('settings.testing') : t('settings.testConnection')}
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
  const { t } = usePreferences();
  const [current, setCurrent]   = useState('');
  const [next,    setNext]      = useState('');
  const [confirm, setConfirm]   = useState('');
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState('');
  const [notice,  setNotice]    = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { setError(t('settings.passwordMismatch')); return; }
    if (next.length < 8)  { setError(t('settings.passwordMin')); return; }
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
      setNotice(t('settings.passwordChanged'));
      setTimeout(() => setNotice(''), 3000);
    } catch (ex: unknown) { setError((ex as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      {error  && <p className="text-mim-red  text-xs font-mono">{error}</p>}
      {notice && <p className="text-mim-green text-xs font-mono">{notice}</p>}

      <div>
        <Label>{t('settings.currentPassword')}</Label>
        <FieldInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <Label>{t('settings.newPassword')}</Label>
        <FieldInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      <div>
        <Label>{t('settings.confirmPassword')}</Label>
        <FieldInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      </div>

      <SaveBtn loading={saving} label={t('settings.changePassword')} />
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
type Section = 'conf' | 'prefs' | 'rpc' | 'password';

const NAV_KEYS: { id: Section; i18nKey: string }[] = [
  { id: 'conf',     i18nKey: 'settings.bitcoinConf' },
  { id: 'prefs',    i18nKey: 'settings.preferences' },
  { id: 'rpc',      i18nKey: 'settings.rpcConnection' },
  { id: 'password', i18nKey: 'settings.changePassword' },
];

export default function SettingsPage() {
  const { t } = usePreferences();
  const [section, setSection] = useState<Section>('conf');

  return (
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 max-w-5xl">
      {/* Sidebar nav */}
      <nav className="w-full sm:w-44 flex-shrink-0 flex sm:flex-col gap-1 overflow-x-auto pb-2 sm:pb-0">
        {NAV_KEYS.map(({ id, i18nKey }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              section === id
                ? 'bg-mim-surface-2 text-mim-text font-medium'
                : 'text-mim-text-muted hover:text-mim-text hover:bg-mim-surface'
            }`}
          >
            {t(i18nKey)}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <SectionTitle>{t(NAV_KEYS.find((n) => n.id === section)!.i18nKey)}</SectionTitle>
        {section === 'conf'     && <BitcoinConfEditor />}
        {section === 'prefs'    && <PreferencesSection />}
        {section === 'rpc'      && <RpcInfoSection />}
        {section === 'password' && <ChangePasswordSection />}
      </div>
    </div>
  );
}
