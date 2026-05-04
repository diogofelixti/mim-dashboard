'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────
type PsbtInput  = { txid: string; vout: number; sequence?: number };
type PsbtOutput = { address: string; amount: string };

type Step = 0 | 1 | 2 | 3 | 4;

const STEPS = [
  'Create',
  'Sign / Export',
  'Import Signed',
  'Finalize',
  'Broadcast',
] as const;

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

function HexBox({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }
  return (
    <div className="bg-mim-bg border border-mim-border rounded-xl p-4 space-y-2">
      {label && <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">{label}</p>}
      <pre className="text-hash text-[10px] break-all whitespace-pre-wrap max-h-40 overflow-y-auto">{value}</pre>
      <button onClick={copy} className="text-[10px] text-mim-text-muted hover:text-mim-text transition-colors">
        {copied ? '✓ Copied' : '⧉ Copy'}
      </button>
    </div>
  );
}

// ── Step wizard header ────────────────────────────────────────────────────────
function StepBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, idx) => {
        const done    = idx < current;
        const active  = idx === current;
        const last    = idx === STEPS.length - 1;
        return (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  done   ? 'bg-mim-green text-black' :
                  active ? 'bg-bitcoin-orange text-black' :
                           'bg-mim-surface border border-mim-border text-mim-text-dim'
                }`}
              >
                {done ? '✓' : idx + 1}
              </div>
              <span className={`text-[9px] font-semibold uppercase tracking-wide whitespace-nowrap ${
                active ? 'text-bitcoin-orange' : done ? 'text-mim-green' : 'text-mim-text-dim'
              }`}>
                {label}
              </span>
            </div>
            {!last && (
              <div className={`w-8 sm:w-14 h-px mb-4 transition-colors ${idx < current ? 'bg-mim-green' : 'bg-mim-border'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 0: Create PSBT ───────────────────────────────────────────────────────
function StepCreate({ onDone }: { onDone: (psbt: string) => void }) {
  const [inputs,    setInputs]    = useState<PsbtInput[]>([]);
  const [outputs,   setOutputs]   = useState<PsbtOutput[]>([{ address: '', amount: '' }]);
  const [locktime,  setLocktime]  = useState('');
  const [wallet,    setWallet]    = useState('');
  const [creating,  setCreating]  = useState(false);
  const [error,     setError]     = useState('');

  function addInput()  { setInputs((p)  => [...p, { txid: '', vout: 0 }]); }
  function addOutput() { setOutputs((p) => [...p, { address: '', amount: '' }]); }

  function setIn(i: number, key: keyof PsbtInput, val: string) {
    setInputs((p) => p.map((x, n) => n === i ? { ...x, [key]: key === 'vout' ? parseInt(val) || 0 : val } : x));
  }
  function setOut(i: number, key: keyof PsbtOutput, val: string) {
    setOutputs((p) => p.map((x, n) => n === i ? { ...x, [key]: val } : x));
  }
  function removeIn(i: number)  { setInputs((p)  => p.filter((_, n) => n !== i)); }
  function removeOut(i: number) { setOutputs((p) => p.filter((_, n) => n !== i)); }

  async function handleCreate() {
    setCreating(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        outputs: outputs.filter((o) => o.address.trim()),
      };
      if (inputs.length) body.inputs = inputs.filter((i) => i.txid.trim());
      if (locktime)      body.locktime = parseInt(locktime);
      if (wallet)        body.wallet = wallet;

      const d = await api<{ psbt: string }>('/api/psbt/create', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      onDone(d.psbt);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setCreating(false); }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Inputs (coin control, optional) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Inputs (optional — for coin control)</Label>
          <button onClick={addInput} className="text-xs text-bitcoin-orange hover:underline">+ Add input</button>
        </div>
        {inputs.length === 0 && (
          <p className="text-xs text-mim-text-dim">Leave empty to let the wallet choose UTXOs automatically.</p>
        )}
        {inputs.map((inp, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <FieldInput
              placeholder="txid"
              value={inp.txid}
              onChange={(e) => setIn(i, 'txid', e.target.value)}
              className="flex-1"
            />
            <FieldInput
              type="number"
              placeholder="vout"
              value={inp.vout}
              onChange={(e) => setIn(i, 'vout', e.target.value)}
              className="w-20"
            />
            <button onClick={() => removeIn(i)} className="text-mim-red text-xs px-2 hover:opacity-70">✕</button>
          </div>
        ))}
      </div>

      {/* Outputs */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Outputs</Label>
          <button onClick={addOutput} className="text-xs text-bitcoin-orange hover:underline">+ Add output</button>
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

      {/* Options */}
      <div className="flex gap-4">
        <div className="flex-1">
          <Label>Locktime (optional)</Label>
          <FieldInput
            type="number"
            placeholder="0"
            value={locktime}
            onChange={(e) => setLocktime(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <Label>Wallet (optional)</Label>
          <FieldInput
            placeholder="wallet name"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      <PrimaryBtn onClick={handleCreate} disabled={creating || outputs.every((o) => !o.address.trim())}>
        {creating ? 'Creating…' : 'Create PSBT →'}
      </PrimaryBtn>
    </div>
  );
}

// ── Step 1: Sign / Export ─────────────────────────────────────────────────────
function StepSign({
  psbt,
  onSigned,
  onSkip,
}: {
  psbt: string;
  onSigned: (psbt: string) => void;
  onSkip: () => void;
}) {
  const [signing,  setSigning]  = useState(false);
  const [signed,   setSigned]   = useState('');
  const [error,    setError]    = useState('');
  const [qr,       setQr]       = useState('');

  async function handleSign() {
    setSigning(true);
    setError('');
    try {
      const d = await api<{ psbt: string }>('/api/psbt/sign', {
        method: 'POST',
        body: JSON.stringify({ psbt }),
      });
      setSigned(d.psbt);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSigning(false); }
  }

  async function handleQR() {
    try {
      const QRCode = await import('qrcode');
      const url = await QRCode.toDataURL(psbt, { width: 300 });
      setQr(url);
    } catch { setQr(''); }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <HexBox value={psbt} label="PSBT (unsigned)" />

      <div className="flex gap-2 flex-wrap">
        <PrimaryBtn onClick={handleSign} disabled={signing}>
          {signing ? 'Signing…' : 'Sign with node wallet'}
        </PrimaryBtn>
        <SecondaryBtn onClick={handleQR}>Generate QR</SecondaryBtn>
        <SecondaryBtn onClick={onSkip}>Skip (sign externally)</SecondaryBtn>
      </div>

      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}

      {qr && (
        <div className="p-4 bg-white rounded-xl w-fit">
          <img src={qr} alt="PSBT QR Code" className="w-48 h-48" />
        </div>
      )}

      {signed && (
        <div className="space-y-3">
          <HexBox value={signed} label="PSBT (signed)" />
          <PrimaryBtn onClick={() => onSigned(signed)}>
            Continue with signed PSBT →
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Import signed PSBT ────────────────────────────────────────────────
function StepImport({ onImported }: { onImported: (psbt: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <Label>Paste signed PSBT</Label>
        <FieldTextarea
          rows={6}
          placeholder="cHNidP8B…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <PrimaryBtn onClick={() => onImported(value.trim())} disabled={!value.trim()}>
        Import →
      </PrimaryBtn>
    </div>
  );
}

// ── Step 3: Finalize ──────────────────────────────────────────────────────────
function StepFinalize({ psbt, onFinalized }: { psbt: string; onFinalized: (hex: string) => void }) {
  const [finalizing, setFinalizing] = useState(false);
  const [rawHex,     setRawHex]     = useState('');
  const [error,      setError]      = useState('');

  async function handleFinalize() {
    setFinalizing(true);
    setError('');
    try {
      const d = await api<{ hex: string }>('/api/psbt/finalize', {
        method: 'POST',
        body: JSON.stringify({ psbt }),
      });
      setRawHex(d.hex);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setFinalizing(false); }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <HexBox value={psbt} label="Signed PSBT" />
      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}
      {rawHex ? (
        <div className="space-y-3">
          <HexBox value={rawHex} label="Raw Transaction (ready to broadcast)" />
          <PrimaryBtn onClick={() => onFinalized(rawHex)}>Broadcast →</PrimaryBtn>
        </div>
      ) : (
        <PrimaryBtn onClick={handleFinalize} disabled={finalizing}>
          {finalizing ? 'Finalizing…' : 'Finalize PSBT'}
        </PrimaryBtn>
      )}
    </div>
  );
}

// ── Step 4: Broadcast ─────────────────────────────────────────────────────────
function StepBroadcast({ hex }: { hex: string }) {
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

  return (
    <div className="space-y-5 max-w-2xl">
      <HexBox value={hex} label="Raw Transaction" />
      {error && <p className="text-mim-red text-xs font-mono">{error}</p>}
      {txid ? (
        <div className="bg-mim-green/10 border border-mim-green/30 rounded-xl p-4 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mim-green">Broadcast Successful</p>
          <p className="text-hash font-mono text-xs break-all">{txid}</p>
        </div>
      ) : (
        <PrimaryBtn onClick={handleBroadcast} disabled={sending}>
          {sending ? 'Broadcasting…' : '📡 Broadcast to Network'}
        </PrimaryBtn>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PsbtPage() {
  const [step,       setStep]       = useState<Step>(0);
  const [psbtHex,    setPsbtHex]    = useState('');
  const [signedPsbt, setSignedPsbt] = useState('');
  const [rawHex,     setRawHex]     = useState('');

  function reset() {
    setStep(0);
    setPsbtHex('');
    setSignedPsbt('');
    setRawHex('');
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

      <StepBar current={step} />

      {step === 0 && (
        <StepCreate
          onDone={(psbt) => { setPsbtHex(psbt); setStep(1); }}
        />
      )}

      {step === 1 && (
        <StepSign
          psbt={psbtHex}
          onSigned={(signed) => { setSignedPsbt(signed); setStep(3); }}
          onSkip={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepImport
          onImported={(psbt) => { setSignedPsbt(psbt); setStep(3); }}
        />
      )}

      {step === 3 && (
        <StepFinalize
          psbt={signedPsbt}
          onFinalized={(hex) => { setRawHex(hex); setStep(4); }}
        />
      )}

      {step === 4 && <StepBroadcast hex={rawHex} />}
    </div>
  );
}
