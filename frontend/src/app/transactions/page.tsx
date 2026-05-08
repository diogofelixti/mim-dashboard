'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { formatHash, formatNumber } from '@/lib/formatters';
import { useBtcUnit } from '@/hooks/useBtcUnit';
import { usePreferences } from '@/hooks/usePreferences';

type Tab = 'send' | 'broadcast' | 'decode';

type SelectedUtxo = {
  txid: string;
  vout: number;
  amount: number;
  amount_sats: number;
  address: string;
  confirmations: number;
};

type SendForm = {
  to: string;
  amount: string;
  feeMode: 'auto' | 'manual';
  feeRate: string;
  wallet: string;
};

type DecodedTx = {
  txid: string;
  inputs: { txid: string; vout: number }[];
  outputs: { address: string; value: number }[];
  fee?: number;
  size?: number;
  vsize?: number;
};

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted block mb-1">
      {children}
    </label>
  );
}

function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-mim-surface border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim transition-colors ${className}`}
    />
  );
}

function Textarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-mim-surface border border-mim-border text-mim-text text-sm font-mono rounded-lg px-3 py-2.5 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim resize-none transition-colors ${className}`}
    />
  );
}

// ── Send Tab ──────────────────────────────────────────────────────────────────
function SendTab() {
  const { fmt } = useBtcUnit();
  const { t } = usePreferences();
  const { unit } = useBtcUnit();
  const [form,           setForm]           = useState<SendForm>({ to: '', amount: '', feeMode: 'auto', feeRate: '', wallet: '' });
  const [sending,        setSending]        = useState(false);
  const [result,         setResult]         = useState('');
  const [error,          setError]          = useState('');
  const [selectedUtxos,  setSelectedUtxos]  = useState<SelectedUtxo[]>([]);
  const [coinWallet,     setCoinWallet]     = useState('');
  const [amountUnit,     setAmountUnit]     = useState<'BTC' | 'sats'>(unit);
  const [sendAll,        setSendAll]        = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('mim-selected-utxos');
      const wallet = localStorage.getItem('mim-coin-control-wallet') ?? '';
      if (raw) {
        const parsed = JSON.parse(raw) as SelectedUtxo[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSelectedUtxos(parsed);
          setCoinWallet(wallet);
          setForm((f) => ({ ...f, wallet: wallet }));
        }
      }
    } catch { /* ignore */ }
  }, []);

  const utxoTotal     = selectedUtxos.reduce((s, u) => s + u.amount, 0);
  const utxoTotalSats = selectedUtxos.reduce((s, u) => s + u.amount_sats, 0);

  function set(key: keyof SendForm, val: string) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function clearCoinControl() {
    setSelectedUtxos([]);
    setCoinWallet('');
    localStorage.removeItem('mim-selected-utxos');
    localStorage.removeItem('mim-coin-control-wallet');
  }

  function getAmountBtc(): number {
    const raw = parseFloat(form.amount);
    if (isNaN(raw)) return 0;
    return amountUnit === 'sats' ? raw / 1e8 : raw;
  }

  async function handleSend() {
    if (!form.to.trim() || !form.amount.trim()) return;
    setSending(true);
    setResult('');
    setError('');
    try {
      const amountBtc = getAmountBtc();
      const wallet = coinWallet || form.wallet;
      if (selectedUtxos.length > 0 && wallet) {
        const payload: Record<string, unknown> = {
          address: form.to.trim(),
          amount: amountBtc,
          inputs: selectedUtxos.map((u) => ({ txid: u.txid, vout: u.vout })),
        };
        if (form.feeMode === 'manual' && form.feeRate) {
          payload.fee_rate = parseFloat(form.feeRate);
        }
        if (sendAll) payload.subtract_fee = true;

        const d = await api<{ txid: string }>(
          `/api/wallets/${encodeURIComponent(wallet)}/send`,
          { method: 'POST', body: JSON.stringify(payload) }
        );
        setResult(d.txid);
        clearCoinControl();
      } else {
        const payload: Record<string, unknown> = {
          to: form.to.trim(),
          amount: amountBtc,
        };
        if (form.feeMode === 'manual' && form.feeRate) payload.feeRate = parseFloat(form.feeRate);
        if (form.wallet) payload.wallet = form.wallet;

        const d = await api<{ txid: string }>('/api/tx/send', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setResult(d.txid);
      }
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSending(false); }
  }

  return (
    <div className="space-y-4 max-w-lg">
      {/* Coin Control Section */}
      {selectedUtxos.length > 0 ? (
        <div className="bg-bitcoin-orange/5 border border-bitcoin-orange/20 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest text-bitcoin-orange">
              {t('txPage.coinControl', { count: selectedUtxos.length })}
            </p>
            <div className="flex gap-2">
              <a
                href="/wallets"
                className="text-[10px] text-mim-text-muted hover:text-mim-text transition-colors"
              >
                {t('txPage.changeSelection')}
              </a>
              <button
                onClick={clearCoinControl}
                className="text-[10px] text-mim-red hover:text-mim-red/80 transition-colors"
              >
                {t('txPage.clear')}
              </button>
            </div>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {selectedUtxos.map((u) => (
              <div key={`${u.txid}:${u.vout}`} className="flex items-center justify-between text-xs">
                <span className="font-mono text-hash">{formatHash(u.txid, 8)}:{u.vout}</span>
                <span className="font-mono text-mim-text">{fmt(u.amount)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-bitcoin-orange/10">
            <span className="text-xs text-mim-text-muted">{t('txPage.availableUtxos')}</span>
            <span className="text-xs font-mono font-semibold text-bitcoin-orange">
              {fmt(utxoTotal)}
            </span>
          </div>
          {coinWallet && (
            <p className="text-[10px] text-mim-text-dim">
              {t('txPage.wallet')} <span className="font-semibold text-mim-text-muted">{coinWallet}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="bg-mim-surface border border-mim-border rounded-xl p-3">
          <p className="text-xs text-mim-text-dim">
            {t('txPage.autoCoinSelect')}
            <span className="ml-1 text-mim-text-muted">
              — <a href="/wallets" className="text-bitcoin-orange hover:underline">{t('txPage.goToCoinControl')}</a>
            </span>
          </p>
        </div>
      )}

      <div>
        <Label>{t('txPage.recipient')}</Label>
        <Input
          placeholder="bc1q…"
          value={form.to}
          onChange={(e) => set('to', e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label>{amountUnit === 'sats' ? `${t('txPage.amountBtc').replace('BTC', 'sats')}` : t('txPage.amountBtc')}</Label>
          <div className="flex gap-1">
            {selectedUtxos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const val = amountUnit === 'sats' ? utxoTotalSats.toString() : utxoTotal.toFixed(8);
                  set('amount', val);
                  setSendAll(true);
                }}
                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-bitcoin-orange/10 text-bitcoin-orange hover:bg-bitcoin-orange/20 transition-colors"
              >
                {t('txPage.max')}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const raw = parseFloat(form.amount);
                if (!isNaN(raw) && raw > 0) {
                  if (amountUnit === 'BTC') {
                    set('amount', Math.round(raw * 1e8).toString());
                  } else {
                    set('amount', (raw / 1e8).toFixed(8));
                  }
                }
                setAmountUnit((u) => u === 'BTC' ? 'sats' : 'BTC');
                setSendAll(false);
              }}
              className="px-2 py-0.5 rounded text-[10px] font-semibold border border-mim-border text-mim-text-muted hover:border-mim-border-light transition-colors"
            >
              {amountUnit === 'BTC' ? '→ sats' : '→ BTC'}
            </button>
          </div>
        </div>
        <Input
          type="number"
          step={amountUnit === 'sats' ? '1' : '0.00000001'}
          min="0"
          placeholder={amountUnit === 'sats' ? '100000' : '0.001'}
          value={form.amount}
          onChange={(e) => { set('amount', e.target.value); setSendAll(false); }}
        />
        {sendAll && (
          <p className="text-bitcoin-orange text-[10px] mt-1">{t('txPage.sendingAll')}</p>
        )}
        {selectedUtxos.length > 0 && form.amount && getAmountBtc() > utxoTotal && !sendAll && (
          <p className="text-mim-red text-[10px] mt-1">
            {t('txPage.exceedsTotal', { total: fmt(utxoTotal) })}
          </p>
        )}
      </div>

      <div>
        <Label>{t('txPage.fee')}</Label>
        <div className="flex gap-2 mb-2">
          {(['auto', 'manual'] as const).map((m) => (
            <button
              key={m}
              onClick={() => set('feeMode', m)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                form.feeMode === m
                  ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                  : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
              }`}
            >
              {m === 'auto' ? t('txPage.auto') : t('txPage.manual')}
            </button>
          ))}
        </div>
        {form.feeMode === 'manual' && (
          <Input
            type="number"
            step="1"
            min="1"
            placeholder="e.g. 10"
            value={form.feeRate}
            onChange={(e) => set('feeRate', e.target.value)}
          />
        )}
      </div>

      {selectedUtxos.length === 0 && (
        <div>
          <Label>{t('txPage.walletOptional')}</Label>
          <Input
            placeholder="wallet name"
            value={form.wallet}
            onChange={(e) => set('wallet', e.target.value)}
          />
        </div>
      )}

      {selectedUtxos.length > 0 && (
        <p className="text-xs text-mim-text-muted font-mono">
          {t('txPage.usingUtxos', { count: selectedUtxos.length, total: fmt(utxoTotal) })}
        </p>
      )}

      <button
        onClick={handleSend}
        disabled={
          sending ||
          !form.to.trim() ||
          !form.amount.trim() ||
          (selectedUtxos.length > 0 && !sendAll && getAmountBtc() > utxoTotal)
        }
        className="w-full py-3 rounded-xl bg-bitcoin-orange text-black font-semibold text-sm hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
      >
        {sending ? t('txPage.broadcasting') : t('txPage.sendTx')}
      </button>

      {result && (
        <div className="bg-mim-green/10 border border-mim-green/30 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-green">{t('txPage.sent')}</p>
          <p className="text-hash font-mono text-xs break-all">{result}</p>
        </div>
      )}
      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}
    </div>
  );
}

// ── Broadcast Tab ─────────────────────────────────────────────────────────────
function BroadcastTab() {
  const { t } = usePreferences();
  const [hex,        setHex]        = useState('');
  const [decoded,    setDecoded]    = useState<DecodedTx | null>(null);
  const [decoding,   setDecoding]   = useState(false);
  const [sending,    setSending]    = useState(false);
  const [txid,       setTxid]       = useState('');
  const [error,      setError]      = useState('');

  async function handleDecode() {
    if (!hex.trim()) return;
    setDecoding(true);
    setDecoded(null);
    setError('');
    try {
      const d = await api<DecodedTx>('/api/tx/decode', {
        method: 'POST',
        body: JSON.stringify({ hex: hex.trim() }),
      });
      setDecoded(d);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setDecoding(false); }
  }

  async function handleBroadcast() {
    if (!hex.trim()) return;
    setSending(true);
    setTxid('');
    setError('');
    try {
      const d = await api<{ txid: string }>('/api/tx/broadcast', {
        method: 'POST',
        body: JSON.stringify({ hex: hex.trim() }),
      });
      setTxid(d.txid);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSending(false); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Label>{t('txPage.rawTxHex')}</Label>
        <Textarea
          rows={6}
          placeholder={t('txPage.pasteSignedHex')}
          value={hex}
          onChange={(e) => setHex(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleDecode}
          disabled={decoding || !hex.trim()}
          className="px-4 py-2 rounded-lg border border-mim-border text-mim-text-muted text-sm hover:border-mim-border-light hover:text-mim-text disabled:opacity-50 transition-colors"
        >
          {decoding ? t('txPage.decoding') : t('txPage.decode')}
        </button>
        <button
          onClick={handleBroadcast}
          disabled={sending || !hex.trim()}
          className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
        >
          {sending ? t('txPage.broadcasting') : t('txPage.broadcast')}
        </button>
      </div>

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      {txid && (
        <div className="bg-mim-green/10 border border-mim-green/30 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-green mb-1">{t('txPage.broadcastSuccess')}</p>
          <p className="text-hash font-mono text-xs break-all">{txid}</p>
        </div>
      )}

      {decoded && <DecodedPreview tx={decoded} />}
    </div>
  );
}

// ── Decode Tab ────────────────────────────────────────────────────────────────
function DecodeTab() {
  const { t } = usePreferences();
  const [hex,      setHex]      = useState('');
  const [decoded,  setDecoded]  = useState<DecodedTx | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  async function handleDecode() {
    if (!hex.trim()) return;
    setLoading(true);
    setDecoded(null);
    setError('');
    try {
      const d = await api<DecodedTx>('/api/tx/decode', {
        method: 'POST',
        body: JSON.stringify({ hex: hex.trim() }),
      });
      setDecoded(d);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Label>{t('txPage.txHex')}</Label>
        <Textarea
          rows={6}
          placeholder={t('txPage.pasteTxHex')}
          value={hex}
          onChange={(e) => setHex(e.target.value)}
        />
      </div>
      <button
        onClick={handleDecode}
        disabled={loading || !hex.trim()}
        className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
      >
        {loading ? t('txPage.decoding') : t('txPage.decode')}
      </button>
      {error  && <p className="text-mim-red text-xs font-mono">{error}</p>}
      {decoded && <DecodedPreview tx={decoded} />}
    </div>
  );
}

// ── Shared decoded view ───────────────────────────────────────────────────────
function DecodedPreview({ tx }: { tx: DecodedTx }) {
  const { fmt } = useBtcUnit();
  const { t } = usePreferences();
  return (
    <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-mim-border space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">{t('txPage.decoded')}</p>
        <p className="text-hash font-mono text-xs break-all">{tx.txid}</p>
        {(tx.size !== undefined || tx.fee !== undefined) && (
          <div className="flex gap-4 text-xs text-mim-text-muted">
            {tx.size    !== undefined && <span>{tx.size} B</span>}
            {tx.vsize   !== undefined && <span>{tx.vsize} vB</span>}
            {tx.fee     !== undefined && <span>{(tx.fee * 1e8).toFixed(0)} sat fee</span>}
          </div>
        )}
      </div>

      <div className="flex gap-4 p-4 items-start">
        {/* Inputs */}
        <div className="flex-1 space-y-1.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
            {t('txPage.inputs')} ({tx.inputs.length})
          </p>
          {tx.inputs.map((inp, i) => (
            <div key={i} className="bg-mim-bg border border-mim-border rounded-lg px-3 py-2">
              <p className="text-hash text-xs font-mono truncate">{inp.txid}:{inp.vout}</p>
            </div>
          ))}
        </div>
        <div className="flex-shrink-0 text-bitcoin-orange text-lg pt-6">→</div>
        {/* Outputs */}
        <div className="flex-1 space-y-1.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
            {t('txPage.outputs')} ({tx.outputs.length})
          </p>
          {tx.outputs.map((out, i) => (
            <div key={i} className="bg-mim-bg border border-mim-border rounded-lg px-3 py-2 space-y-0.5">
              <p className="text-hash text-xs truncate">{out.address || 'OP_RETURN'}</p>
              <p className="font-mono text-xs text-mim-text">{fmt(out.value)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const [tab, setTab] = useState<Tab>('send');
  const { t } = usePreferences();

  const TABS: { id: Tab; label: string }[] = [
    { id: 'send',      label: t('txPage.send') },
    { id: 'broadcast', label: t('txPage.broadcastRaw') },
    { id: 'decode',    label: t('txPage.decodeHex') },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Tab bar */}
      <div className="flex gap-1 bg-mim-surface border border-mim-border rounded-xl p-1 w-fit">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? 'bg-bitcoin-orange text-black'
                : 'text-mim-text-muted hover:text-mim-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'send'      && <SendTab />}
      {tab === 'broadcast' && <BroadcastTab />}
      {tab === 'decode'    && <DecodeTab />}
    </div>
  );
}
