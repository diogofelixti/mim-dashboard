'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { formatHash, formatNumber } from '@/lib/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = 0 | 1 | 2 | 3 | 4 | 5;

type PsbtOutput = { address: string; amount: string };

type SelectedUtxo = {
  txid: string;
  vout: number;
  amount: number;
  amount_sats: number;
  address: string;
  confirmations: number;
};

type FeeEstimate = {
  fast:   { satVb: number | null; blocks: number };
  medium: { satVb: number | null; blocks: number };
  slow:   { satVb: number | null; blocks: number };
};

type DecodedPsbt = {
  tx?: {
    txid?: string;
    vsize?: number;
    vin?: { txid: string; vout: number }[];
    vout?: { value: number; scriptPubKey?: { address?: string } }[];
  };
  inputs?: {
    witness_utxo?: { amount: number; scriptPubKey?: { address?: string } };
    non_witness_utxo?: unknown;
    partial_signatures?: Record<string, string>;
    final_scriptwitness?: string[];
    final_scriptSig?: { hex: string };
  }[];
  outputs?: unknown[];
  fee?: number;
  unknown?: Record<string, string>;
};

type AnalyzePsbt = {
  inputs?: {
    has_utxo: boolean;
    is_final: boolean;
    next?: string;
    missing?: { pubkeys?: string[]; signatures?: string[] };
  }[];
  estimated_vsize?: number;
  estimated_feerate?: number;
  fee?: number;
  next?: string;
};

const STEPS = ['Create', 'Review', 'Sign', 'Combine', 'Finalize', 'Broadcast'] as const;

// ── Small shared components ───────────────────────────────────────────────────
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
      className={`w-full bg-mim-bg border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim transition-colors ${className}`}
    />
  );
}

function FieldTextarea({ className = '', ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full bg-mim-bg border border-mim-border text-mim-text text-sm font-mono rounded-lg px-3 py-2.5 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim resize-none transition-colors ${className}`}
    />
  );
}

function PrimaryBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-5 py-2.5 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

function SecondaryBtn({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`px-5 py-2.5 rounded-lg border border-mim-border text-mim-text-muted text-sm hover:border-mim-border-light hover:text-mim-text disabled:opacity-50 transition-colors ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

function CopyBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return (
    <div className="bg-mim-bg border border-mim-border rounded-xl p-4 space-y-2">
      {label && <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">{label}</p>}
      <pre className="text-hash text-[10px] break-all whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{value}</pre>
      <button onClick={copy} className="text-[10px] text-mim-text-muted hover:text-mim-text transition-colors">
        {copied ? '✓ Copied' : '⧉ Copy'}
      </button>
    </div>
  );
}

function WarningBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-mim-yellow/5 border border-mim-yellow/30 rounded-xl p-4 text-xs text-mim-text">
      {children}
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-mim-green/10 border border-mim-green/30 rounded-xl p-4 text-xs">
      {children}
    </div>
  );
}

// ── Step Bar ──────────────────────────────────────────────────────────────────
function StepBar({ current, onNavigate }: { current: Step; onNavigate: (s: Step) => void }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, idx) => {
        const done   = idx < current;
        const active = idx === current;
        const last   = idx === STEPS.length - 1;
        const canClick = idx < current;
        return (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <button
                onClick={() => canClick && onNavigate(idx as Step)}
                disabled={!canClick}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done   ? 'bg-mim-green text-black cursor-pointer hover:bg-mim-green/80' :
                  active ? 'bg-bitcoin-orange text-black' :
                           'bg-mim-surface border border-mim-border text-mim-text-dim'
                } ${!canClick ? 'cursor-default' : ''}`}
              >
                {done ? '✓' : idx + 1}
              </button>
              <span className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                active ? 'text-bitcoin-orange' : done ? 'text-mim-green' : 'text-mim-text-dim'
              }`}>
                {label}
              </span>
            </div>
            {!last && (
              <div className={`w-6 sm:w-12 h-px mb-4 transition-colors ${idx < current ? 'bg-mim-green' : 'bg-mim-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 0: Create PSBT ───────────────────────────────────────────────────────
function StepCreate({ onDone, onImport }: {
  onDone: (psbt: string, wallet: string) => void;
  onImport: (psbt: string) => void;
}) {
  const [wallets,     setWallets]     = useState<string[]>([]);
  const [wallet,      setWallet]      = useState('');
  const [outputs,     setOutputs]     = useState<PsbtOutput[]>([{ address: '', amount: '' }]);
  const [feeMode,     setFeeMode]     = useState<'auto' | 'custom'>('auto');
  const [feeRate,     setFeeRate]     = useState('');
  const [fees,        setFees]        = useState<FeeEstimate | null>(null);
  const [rbf,         setRbf]         = useState(true);
  const [useCoinCtrl, setUseCoinCtrl] = useState(false);
  const [coinUtxos,   setCoinUtxos]   = useState<SelectedUtxo[]>([]);
  const [showImport,  setShowImport]  = useState(false);
  const [importValue, setImportValue] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    api<{ loaded: string[] }>('/api/wallets')
      .then((d) => { setWallets(d.loaded); if (d.loaded.length) setWallet(d.loaded[0]); })
      .catch(() => {});
    api<FeeEstimate>('/api/node/fees').then(setFees).catch(() => {});
    try {
      const raw = localStorage.getItem('mim-selected-utxos');
      const w   = localStorage.getItem('mim-coin-control-wallet') ?? '';
      if (raw) {
        const parsed = JSON.parse(raw) as SelectedUtxo[];
        if (parsed.length) {
          setCoinUtxos(parsed);
          setUseCoinCtrl(true);
          if (w) setWallet(w);
        }
      }
    } catch { /* ignore */ }
  }, []);

  function addOutput()  { setOutputs((p) => [...p, { address: '', amount: '' }]); }
  function removeOut(i: number) { setOutputs((p) => p.filter((_, n) => n !== i)); }
  function setOut(i: number, key: keyof PsbtOutput, val: string) {
    setOutputs((p) => p.map((x, n) => n === i ? { ...x, [key]: val } : x));
  }

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const outs = outputs
        .filter((o) => o.address.trim() && o.amount.trim())
        .map((o) => ({ [o.address.trim()]: parseFloat(o.amount) }));
      if (!outs.length) { setError('At least one recipient required'); setCreating(false); return; }

      const inputs = useCoinCtrl && coinUtxos.length
        ? coinUtxos.map((u) => ({ txid: u.txid, vout: u.vout }))
        : [];

      const options: Record<string, unknown> = {};
      if (feeMode === 'custom' && feeRate) options.fee_rate = parseFloat(feeRate);
      else if (feeMode === 'auto' && fees?.fast?.satVb) options.fee_rate = fees.fast.satVb;
      if (rbf) options.replaceable = true;

      const d = await api<{ psbt: string; fee: number; changepos: number }>(
        `/api/wallets/${encodeURIComponent(wallet)}/psbt/create`,
        { method: 'POST', body: JSON.stringify({ inputs, outputs: outs, options }) }
      );
      if (useCoinCtrl) {
        localStorage.removeItem('mim-selected-utxos');
        localStorage.removeItem('mim-coin-control-wallet');
      }
      onDone(d.psbt, wallet);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setCreating(false); }
  }

  function handleImportPsbt() {
    if (!importValue.trim()) return;
    onImport(importValue.trim());
  }

  const coinTotal = coinUtxos.reduce((s, u) => s + u.amount, 0);

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      {/* Wallet selector */}
      <div>
        <Label>Wallet</Label>
        <select
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          className="w-full bg-mim-bg border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-bitcoin-orange/60"
        >
          {wallets.map((w) => <option key={w} value={w}>{w || '(default)'}</option>)}
        </select>
      </div>

      {/* Recipients */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Recipients</Label>
          <button onClick={addOutput} className="text-xs text-bitcoin-orange hover:underline">+ Add recipient</button>
        </div>
        {outputs.map((out, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <FieldInput
              placeholder="bc1q… (recipient address)"
              value={out.address}
              onChange={(e) => setOut(i, 'address', e.target.value)}
              className="flex-1"
            />
            <FieldInput
              type="number"
              step="0.00000001"
              min="0"
              placeholder="BTC"
              value={out.amount}
              onChange={(e) => setOut(i, 'amount', e.target.value)}
              className="w-32"
            />
            {outputs.length > 1 && (
              <button onClick={() => removeOut(i)} className="text-mim-red text-xs px-2 hover:opacity-70">✕</button>
            )}
          </div>
        ))}
      </div>

      {/* Fee */}
      <div>
        <Label>Fee Rate</Label>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setFeeMode('auto')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              feeMode === 'auto'
                ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
            }`}
          >
            Auto
          </button>
          <button
            onClick={() => setFeeMode('custom')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              feeMode === 'custom'
                ? 'bg-bitcoin-orange text-black border-bitcoin-orange'
                : 'border-mim-border text-mim-text-muted hover:border-mim-border-light'
            }`}
          >
            Custom
          </button>
        </div>
        {feeMode === 'auto' && fees && (
          <div className="flex gap-3 text-xs text-mim-text-muted">
            {fees.fast.satVb   && <span className="text-mim-green">Fast: {fees.fast.satVb} sat/vB (~{fees.fast.blocks} block)</span>}
            {fees.medium.satVb && <span className="text-mim-yellow">Medium: {fees.medium.satVb} sat/vB (~{fees.medium.blocks} blocks)</span>}
            {fees.slow.satVb   && <span className="text-mim-text-dim">Slow: {fees.slow.satVb} sat/vB (~{fees.slow.blocks} blocks)</span>}
          </div>
        )}
        {feeMode === 'custom' && (
          <FieldInput
            type="number"
            step="1"
            min="1"
            placeholder="sat/vB"
            value={feeRate}
            onChange={(e) => setFeeRate(e.target.value)}
          />
        )}
      </div>

      {/* Options */}
      <div className="space-y-3">
        <Label>Options</Label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={rbf} onChange={(e) => setRbf(e.target.checked)} className="accent-bitcoin-orange w-3.5 h-3.5" />
          <span className="text-sm text-mim-text">RBF (Replace-by-Fee)</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={useCoinCtrl} onChange={(e) => setUseCoinCtrl(e.target.checked)} className="accent-bitcoin-orange w-3.5 h-3.5" />
          <span className="text-sm text-mim-text">Use Coin Control</span>
        </label>
        {useCoinCtrl && (
          <div className="ml-6 space-y-2">
            {coinUtxos.length > 0 ? (
              <div className="bg-bitcoin-orange/5 border border-bitcoin-orange/20 rounded-lg p-3 space-y-1">
                <p className="text-xs text-bitcoin-orange font-semibold">{coinUtxos.length} UTXOs selected ({coinTotal.toFixed(8)} BTC)</p>
                {coinUtxos.map((u) => (
                  <p key={`${u.txid}:${u.vout}`} className="text-[10px] font-mono text-mim-text-muted">
                    {formatHash(u.txid, 8)}:{u.vout} — {u.amount.toFixed(8)} BTC
                  </p>
                ))}
                <a href="/wallets" className="text-[10px] text-bitcoin-orange hover:underline">Change selection</a>
              </div>
            ) : (
              <p className="text-xs text-mim-text-dim">
                No UTXOs selected. <a href="/wallets" className="text-bitcoin-orange hover:underline">Select in Wallets → Coin Control</a>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Import existing PSBT */}
      <div>
        <button
          onClick={() => setShowImport(!showImport)}
          className="text-xs text-mim-text-muted hover:text-mim-text transition-colors"
        >
          {showImport ? '▾ Hide Import' : '▸ Import Existing PSBT'}
        </button>
        {showImport && (
          <div className="mt-2 space-y-2">
            <FieldTextarea
              rows={4}
              placeholder="Paste PSBT base64 here…"
              value={importValue}
              onChange={(e) => setImportValue(e.target.value)}
            />
            <SecondaryBtn onClick={handleImportPsbt} disabled={!importValue.trim()}>
              Load PSBT →
            </SecondaryBtn>
          </div>
        )}
      </div>

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      <PrimaryBtn onClick={handleCreate} disabled={creating || outputs.every((o) => !o.address.trim() || !o.amount.trim())}>
        {creating ? 'Creating…' : 'Create PSBT →'}
      </PrimaryBtn>
    </div>
  );
}

// ── Step 1: Review ───────────────────────────────────────────────────────────
function StepReview({ psbt, decoded, analysis, onBack, onNext }: {
  psbt: string;
  decoded: DecodedPsbt | null;
  analysis: AnalyzePsbt | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const inputs  = decoded?.tx?.vin ?? [];
  const outputs = decoded?.tx?.vout ?? [];
  const decodedInputs = decoded?.inputs ?? [];
  const fee     = analysis?.fee ?? decoded?.fee;
  const vsize   = analysis?.estimated_vsize ?? decoded?.tx?.vsize;
  const feeRate = vsize && fee ? ((fee * 1e8) / vsize).toFixed(1) : null;

  return (
    <div className="space-y-5 max-w-2xl animate-fade-in">
      {/* Transaction preview */}
      <div className="bg-mim-surface border border-mim-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-mim-border">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">Transaction Preview</p>
          {(fee !== undefined || vsize) && (
            <div className="flex gap-4 mt-1 text-xs text-mim-text-muted">
              {fee !== undefined && <span>Fee: {(fee * 1e8).toFixed(0)} sats ({fee.toFixed(8)} BTC)</span>}
              {vsize && <span>Size: ~{vsize} vB</span>}
              {feeRate && <span>Rate: {feeRate} sat/vB</span>}
            </div>
          )}
        </div>

        <div className="flex gap-4 p-4 items-start">
          <div className="flex-1 space-y-1.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
              Inputs ({inputs.length})
            </p>
            {inputs.map((inp, i) => {
              const witnessUtxo = decodedInputs[i]?.witness_utxo;
              const isFinal = decodedInputs[i]?.final_scriptwitness || decodedInputs[i]?.final_scriptSig;
              const hasSig = decodedInputs[i]?.partial_signatures && Object.keys(decodedInputs[i].partial_signatures!).length > 0;
              return (
                <div key={i} className="bg-mim-bg border border-mim-border rounded-lg px-3 py-2 space-y-0.5">
                  <p className="text-hash text-xs font-mono truncate">{formatHash(inp.txid, 10)}:{inp.vout}</p>
                  {witnessUtxo && (
                    <p className="text-xs font-mono text-mim-text">{witnessUtxo.amount.toFixed(8)} BTC</p>
                  )}
                  <span className={`text-[9px] font-semibold ${
                    isFinal ? 'text-mim-green' : hasSig ? 'text-mim-yellow' : 'text-mim-red'
                  }`}>
                    {isFinal ? 'signed' : hasSig ? 'partial' : 'unsigned'}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex-shrink-0 text-bitcoin-orange text-lg pt-6">→</div>
          <div className="flex-1 space-y-1.5 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
              Outputs ({outputs.length})
            </p>
            {outputs.map((out, i) => (
              <div key={i} className="bg-mim-bg border border-mim-border rounded-lg px-3 py-2 space-y-0.5">
                <p className="text-hash text-xs truncate">{out.scriptPubKey?.address || 'OP_RETURN'}</p>
                <p className="font-mono text-xs text-mim-text">{out.value.toFixed(8)} BTC</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Analysis next role */}
      {analysis?.next && (
        <div className="text-xs text-mim-text-muted">
          Next step: <span className="font-semibold text-bitcoin-orange">{analysis.next}</span>
        </div>
      )}

      {/* Raw PSBT */}
      <CopyBox value={psbt} label="PSBT (Base64)" />

      <div className="flex gap-2">
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <PrimaryBtn onClick={onNext}>Sign →</PrimaryBtn>
      </div>
    </div>
  );
}

// ── Step 2: Sign ─────────────────────────────────────────────────────────────
function StepSign({ psbt, wallet, onSigned, onBack, onSkipToFinalize }: {
  psbt: string;
  wallet: string;
  onSigned: (psbt: string, complete: boolean) => void;
  onBack: () => void;
  onSkipToFinalize: (psbt: string) => void;
}) {
  const [signing,    setSigning]    = useState(false);
  const [signResult, setSignResult] = useState<{ psbt: string; complete: boolean } | null>(null);
  const [error,      setError]      = useState('');
  const [qr,         setQr]         = useState('');
  const [importVal,  setImportVal]  = useState('');
  const [tab,        setTab]        = useState<'wallet' | 'external'>('wallet');

  async function handleSign() {
    setSigning(true);
    setError('');
    try {
      const d = await api<{ psbt: string; complete: boolean }>(
        `/api/wallets/${encodeURIComponent(wallet)}/psbt/process`,
        { method: 'POST', body: JSON.stringify({ psbt }) }
      );
      setSignResult(d);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSigning(false); }
  }

  async function handleQR() {
    try {
      const QRCode = await import('qrcode');
      if (psbt.length > 2000) {
        setQr('too-large');
        return;
      }
      const url = await QRCode.toDataURL(psbt, { width: 300, margin: 2 });
      setQr(url);
    } catch { setQr(''); }
  }

  function handleDownload() {
    const blob = new Blob([psbt], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaction-${Date.now()}.psbt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportSigned() {
    if (!importVal.trim()) return;
    onSigned(importVal.trim(), false);
  }

  return (
    <div className="space-y-5 max-w-2xl animate-fade-in">
      {/* Tab choice */}
      <div className="flex gap-1 bg-mim-surface border border-mim-border rounded-xl p-1 w-fit">
        {([
          { id: 'wallet' as const,   label: 'Sign with Wallet' },
          { id: 'external' as const, label: 'Sign Externally' },
        ]).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === id ? 'bg-bitcoin-orange text-black' : 'text-mim-text-muted hover:text-mim-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'wallet' && (
        <div className="space-y-4">
          <p className="text-xs text-mim-text-muted">
            Sign with wallet <span className="font-semibold text-mim-text">{wallet || '(default)'}</span> on this node.
          </p>

          {!signResult && (
            <PrimaryBtn onClick={handleSign} disabled={signing}>
              {signing ? 'Signing…' : 'Sign with Wallet'}
            </PrimaryBtn>
          )}

          {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

          {signResult && (
            <div className="space-y-3">
              {signResult.complete ? (
                <SuccessBox>
                  <p className="text-mim-green font-semibold">Fully signed!</p>
                  <p className="text-mim-text-muted mt-1">All required signatures are present. Ready to finalize.</p>
                </SuccessBox>
              ) : (
                <WarningBox>
                  <p className="text-mim-yellow font-semibold">Partially signed</p>
                  <p className="text-mim-text-muted mt-1">Additional signatures required. Export and sign with other devices/wallets.</p>
                </WarningBox>
              )}

              <CopyBox value={signResult.psbt} label="Signed PSBT" />

              <div className="flex gap-2">
                {signResult.complete ? (
                  <PrimaryBtn onClick={() => onSkipToFinalize(signResult.psbt)}>
                    Finalize →
                  </PrimaryBtn>
                ) : (
                  <PrimaryBtn onClick={() => onSigned(signResult.psbt, signResult.complete)}>
                    Continue to Combine →
                  </PrimaryBtn>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'external' && (
        <div className="space-y-4">
          <p className="text-xs text-mim-text-muted">
            Export this PSBT to sign with a hardware wallet or another device.
          </p>

          <CopyBox value={psbt} label="PSBT to sign" />

          <div className="flex gap-2 flex-wrap">
            <SecondaryBtn onClick={handleQR}>QR Code</SecondaryBtn>
            <SecondaryBtn onClick={handleDownload}>Download .psbt</SecondaryBtn>
          </div>

          {qr === 'too-large' && (
            <WarningBox>
              <p className="font-semibold text-mim-yellow">PSBT too large for QR code</p>
              <p className="text-mim-text-muted mt-1">Use copy/paste or download the .psbt file instead.</p>
            </WarningBox>
          )}
          {qr && qr !== 'too-large' && (
            <div className="p-4 bg-white rounded-xl w-fit">
              <img src={qr} alt="PSBT QR Code" className="w-48 h-48" />
            </div>
          )}

          <div className="space-y-2 pt-4 border-t border-mim-border">
            <Label>Import signed PSBT</Label>
            <FieldTextarea
              rows={4}
              placeholder="Paste the signed PSBT here…"
              value={importVal}
              onChange={(e) => setImportVal(e.target.value)}
            />
            <PrimaryBtn onClick={handleImportSigned} disabled={!importVal.trim()}>
              Import Signed PSBT →
            </PrimaryBtn>
          </div>
        </div>
      )}

      <div className="pt-2">
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
      </div>
    </div>
  );
}

// ── Step 3: Combine ──────────────────────────────────────────────────────────
function StepCombine({ psbt, onCombined, onSkip, onBack }: {
  psbt: string;
  onCombined: (psbt: string) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [additionalPsbts, setAdditionalPsbts] = useState<string[]>([]);
  const [newPsbt,         setNewPsbt]         = useState('');
  const [combining,       setCombining]       = useState(false);
  const [error,           setError]           = useState('');

  function addPsbt() {
    if (!newPsbt.trim()) return;
    setAdditionalPsbts((p) => [...p, newPsbt.trim()]);
    setNewPsbt('');
  }

  function removePsbt(i: number) {
    setAdditionalPsbts((p) => p.filter((_, n) => n !== i));
  }

  async function handleCombine() {
    setCombining(true);
    setError('');
    try {
      const psbts = [psbt, ...additionalPsbts];
      const d = await api<{ psbt: string }>('/api/psbt/combine', {
        method: 'POST',
        body: JSON.stringify({ psbts }),
      });
      onCombined(d.psbt);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setCombining(false); }
  }

  return (
    <div className="space-y-5 max-w-2xl animate-fade-in">
      <p className="text-xs text-mim-text-muted">
        For multisig or multi-party transactions, combine multiple signed PSBTs here.
        If this is a single-signer transaction, skip this step.
      </p>

      <CopyBox value={psbt} label="Current PSBT" />

      {/* Additional PSBTs */}
      <div className="space-y-2">
        <Label>Add signed PSBTs</Label>
        {additionalPsbts.map((p, i) => (
          <div key={i} className="flex items-center gap-2 bg-mim-bg border border-mim-border rounded-lg px-3 py-2">
            <span className="text-[10px] font-mono text-hash flex-1 truncate">{formatHash(p, 20)}</span>
            <button onClick={() => removePsbt(i)} className="text-mim-red text-xs hover:opacity-70">✕</button>
          </div>
        ))}
        <div className="flex gap-2">
          <FieldTextarea
            rows={3}
            placeholder="Paste another signed PSBT…"
            value={newPsbt}
            onChange={(e) => setNewPsbt(e.target.value)}
            className="flex-1"
          />
        </div>
        <SecondaryBtn onClick={addPsbt} disabled={!newPsbt.trim()}>+ Add PSBT</SecondaryBtn>
      </div>

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      <div className="flex gap-2">
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <SecondaryBtn onClick={onSkip}>Skip → Finalize</SecondaryBtn>
        {additionalPsbts.length > 0 && (
          <PrimaryBtn onClick={handleCombine} disabled={combining}>
            {combining ? 'Combining…' : `Combine ${additionalPsbts.length + 1} PSBTs →`}
          </PrimaryBtn>
        )}
      </div>
    </div>
  );
}

// ── Step 4: Finalize ─────────────────────────────────────────────────────────
function StepFinalize({ psbt, onFinalized, onBack }: {
  psbt: string;
  onFinalized: (hex: string) => void;
  onBack: () => void;
}) {
  const [finalizing, setFinalizing] = useState(false);
  const [rawHex,     setRawHex]     = useState('');
  const [error,      setError]      = useState('');
  const [incomplete, setIncomplete] = useState(false);
  const [analysis,   setAnalysis]   = useState<AnalyzePsbt | null>(null);

  async function handleFinalize() {
    setFinalizing(true);
    setError('');
    setIncomplete(false);
    try {
      const d = await api<{ hex?: string; complete: boolean }>('/api/psbt/finalize', {
        method: 'POST',
        body: JSON.stringify({ psbt }),
      });
      if (d.complete && d.hex) {
        setRawHex(d.hex);
      } else {
        setIncomplete(true);
        const a = await api<AnalyzePsbt>('/api/psbt/analyze', {
          method: 'POST',
          body: JSON.stringify({ psbt }),
        }).catch(() => null);
        setAnalysis(a);
      }
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setFinalizing(false); }
  }

  return (
    <div className="space-y-5 max-w-2xl animate-fade-in">
      <p className="text-xs text-mim-text-muted">
        Finalize the PSBT to produce a raw transaction ready for broadcast.
      </p>

      {!rawHex && !incomplete && (
        <PrimaryBtn onClick={handleFinalize} disabled={finalizing}>
          {finalizing ? 'Finalizing…' : 'Finalize PSBT'}
        </PrimaryBtn>
      )}

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      {incomplete && (
        <div className="space-y-3">
          <div className="bg-mim-red/10 border border-mim-red/30 rounded-xl p-4">
            <p className="text-mim-red text-xs font-semibold">Cannot finalize — missing signatures</p>
            {analysis?.inputs && (
              <div className="mt-2 space-y-1">
                {analysis.inputs.map((inp, i) => (
                  <p key={i} className={`text-[10px] font-mono ${inp.is_final ? 'text-mim-green' : 'text-mim-red'}`}>
                    Input #{i}: {inp.is_final ? 'ready' : `needs ${inp.next ?? 'signing'}`}
                    {inp.missing?.signatures && ` (${inp.missing.signatures.length} sig missing)`}
                  </p>
                ))}
              </div>
            )}
          </div>
          <SecondaryBtn onClick={onBack}>← Back to Sign</SecondaryBtn>
        </div>
      )}

      {rawHex && (
        <div className="space-y-3">
          <SuccessBox>
            <p className="text-mim-green font-semibold">Transaction finalized!</p>
            <p className="text-mim-text-muted mt-1">Ready to broadcast to the network.</p>
          </SuccessBox>

          <CopyBox value={rawHex} label="Raw Transaction Hex" />

          <div className="flex gap-2">
            <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
            <PrimaryBtn onClick={() => onFinalized(rawHex)}>Broadcast →</PrimaryBtn>
          </div>
        </div>
      )}

      {!rawHex && !incomplete && (
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
      )}
    </div>
  );
}

// ── Step 5: Broadcast ────────────────────────────────────────────────────────
function StepBroadcast({ hex, onBack, onReset }: {
  hex: string;
  onBack: () => void;
  onReset: () => void;
}) {
  const [sending,  setSending]  = useState(false);
  const [txid,     setTxid]     = useState('');
  const [error,    setError]    = useState('');

  async function handleBroadcast() {
    setSending(true);
    setError('');
    try {
      const d = await api<{ txid: string }>('/api/tx/broadcast', {
        method: 'POST',
        body: JSON.stringify({ hex }),
      });
      setTxid(d.txid);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSending(false); }
  }

  if (txid) {
    return (
      <div className="space-y-5 max-w-2xl animate-fade-in">
        <SuccessBox>
          <p className="text-mim-green font-semibold text-sm">Transaction broadcast!</p>
          <p className="text-mim-text-muted mt-1">Your transaction has been submitted to the Bitcoin network.</p>
        </SuccessBox>

        <div className="bg-mim-surface border border-mim-border rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">Transaction ID</p>
          <p className="text-hash font-mono text-xs break-all">{txid}</p>
        </div>

        <div className="flex gap-2">
          <a
            href={`/explorer/tx/${txid}`}
            className="px-5 py-2.5 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark transition-colors inline-block"
          >
            View in Explorer
          </a>
          <SecondaryBtn onClick={onReset}>Create Another</SecondaryBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl animate-fade-in">
      <WarningBox>
        <p className="font-semibold text-mim-yellow">This action is irreversible</p>
        <p className="text-mim-text-muted mt-1">The transaction will be sent to the Bitcoin network and cannot be undone.</p>
      </WarningBox>

      <CopyBox value={hex} label="Raw Transaction" />

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      <div className="flex gap-2">
        <SecondaryBtn onClick={onBack}>← Back</SecondaryBtn>
        <button
          onClick={handleBroadcast}
          disabled={sending}
          className="flex-1 py-3 rounded-xl bg-bitcoin-orange text-black font-semibold text-sm hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
        >
          {sending ? 'Broadcasting…' : 'Broadcast Transaction'}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PsbtPage() {
  const [step,       setStep]       = useState<Step>(0);
  const [psbtHex,    setPsbtHex]    = useState('');
  const [signedPsbt, setSignedPsbt] = useState('');
  const [rawHex,     setRawHex]     = useState('');
  const [wallet,     setWallet]     = useState('');
  const [decoded,    setDecoded]    = useState<DecodedPsbt | null>(null);
  const [analysis,   setAnalysis]   = useState<AnalyzePsbt | null>(null);

  const decodePsbt = useCallback(async (psbt: string) => {
    try {
      const [dec, ana] = await Promise.all([
        api<DecodedPsbt>('/api/psbt/decode', {
          method: 'POST',
          body: JSON.stringify({ psbt }),
        }),
        api<AnalyzePsbt>('/api/psbt/analyze', {
          method: 'POST',
          body: JSON.stringify({ psbt }),
        }).catch(() => null),
      ]);
      setDecoded(dec);
      setAnalysis(ana);
    } catch { /* silent */ }
  }, []);

  function reset() {
    setStep(0);
    setPsbtHex('');
    setSignedPsbt('');
    setRawHex('');
    setWallet('');
    setDecoded(null);
    setAnalysis(null);
  }

  function navigateBack(target: Step) {
    setStep(target);
  }

  async function handleCreated(psbt: string, w: string) {
    setPsbtHex(psbt);
    setWallet(w);
    await decodePsbt(psbt);
    setStep(1);
  }

  async function handleImport(psbt: string) {
    setPsbtHex(psbt);
    await decodePsbt(psbt);
    setStep(1);
  }

  function handleSigned(psbt: string, complete: boolean) {
    setSignedPsbt(psbt);
    if (complete) {
      setStep(4);
    } else {
      setStep(3);
    }
  }

  function handleSkipToFinalize(psbt: string) {
    setSignedPsbt(psbt);
    setStep(4);
  }

  function handleCombined(psbt: string) {
    setSignedPsbt(psbt);
    setStep(4);
  }

  function handleFinalized(hex: string) {
    setRawHex(hex);
    setStep(5);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-sm font-semibold text-mim-text">PSBT Workflow</h1>
        {step > 0 && (
          <button onClick={reset} className="text-xs text-mim-text-muted hover:text-mim-text transition-colors">
            ↩ Start over
          </button>
        )}
      </div>

      <StepBar current={step} onNavigate={navigateBack} />

      {step === 0 && (
        <StepCreate onDone={handleCreated} onImport={handleImport} />
      )}

      {step === 1 && (
        <StepReview
          psbt={psbtHex}
          decoded={decoded}
          analysis={analysis}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepSign
          psbt={psbtHex}
          wallet={wallet}
          onSigned={handleSigned}
          onBack={() => setStep(1)}
          onSkipToFinalize={handleSkipToFinalize}
        />
      )}

      {step === 3 && (
        <StepCombine
          psbt={signedPsbt || psbtHex}
          onCombined={handleCombined}
          onSkip={() => { if (!signedPsbt) setSignedPsbt(psbtHex); setStep(4); }}
          onBack={() => setStep(2)}
        />
      )}

      {step === 4 && (
        <StepFinalize
          psbt={signedPsbt || psbtHex}
          onFinalized={handleFinalized}
          onBack={() => setStep(2)}
        />
      )}

      {step === 5 && (
        <StepBroadcast
          hex={rawHex}
          onBack={() => setStep(4)}
          onReset={reset}
        />
      )}
    </div>
  );
}
