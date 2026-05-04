'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STEPS = [
  { id: 1, label: 'Welcome' },
  { id: 2, label: 'bitcoin.conf' },
  { id: 3, label: 'RPC' },
  { id: 4, label: 'ZMQ' },
  { id: 5, label: 'Password' },
  { id: 6, label: 'Launch' },
];

interface FormState {
  btcConfPath: string;
  rpcHost: string;
  rpcPort: string;
  rpcUser: string;
  rpcPass: string;
  zmqBlockUrl: string;
  zmqTxUrl: string;
  zmqRawTxUrl: string;
  skipZmq: boolean;
  password: string;
  passwordConfirm: string;
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="w-full mb-10">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 right-0 top-4 h-0.5 bg-mim-border z-0" />
        <div
          className="absolute left-0 top-4 h-0.5 bg-bitcoin-orange z-0 transition-all duration-500"
          style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
        />
        {STEPS.map((s) => {
          const done    = s.id < step;
          const active  = s.id === step;
          return (
            <div key={s.id} className="relative z-10 flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300
                  ${done   ? 'bg-bitcoin-orange border-bitcoin-orange text-black' : ''}
                  ${active ? 'bg-mim-surface border-bitcoin-orange text-bitcoin-orange' : ''}
                  ${!done && !active ? 'bg-mim-surface border-mim-border text-mim-text-muted' : ''}
                `}
              >
                {done ? '✓' : s.id}
              </div>
              <span className={`text-[10px] font-mono hidden sm:block ${active ? 'text-bitcoin-orange' : 'text-mim-text-muted'}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-mim-surface rounded-2xl p-8 border border-mim-border w-full max-w-lg mx-auto"
      style={{ boxShadow: '0 0 40px rgba(247,147,26,0.04)' }}
    >
      {children}
    </div>
  );
}

function Field({
  label, type = 'text', value, onChange, placeholder, hint,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-mim-text-muted mb-1.5 uppercase tracking-widest">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="
          w-full px-4 py-2.5 rounded-lg font-mono text-sm
          bg-mim-bg border border-mim-border text-mim-text placeholder-mim-text-dim
          focus:outline-none focus:border-bitcoin-orange focus:ring-1 focus:ring-bitcoin-orange
          transition-colors duration-150
        "
      />
      {hint && <p className="text-xs text-mim-text-dim mt-1">{hint}</p>}
    </div>
  );
}

function Btn({
  onClick, disabled, loading, variant = 'primary', children,
}: {
  onClick?: () => void; disabled?: boolean; loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost'; children: React.ReactNode;
}) {
  const base = 'px-5 py-2.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const styles = {
    primary:   `${base} bg-bitcoin-orange text-black hover:opacity-90 glow-orange-sm`,
    secondary: `${base} bg-mim-bg border border-mim-border text-mim-text hover:border-bitcoin-orange`,
    ghost:     `${base} text-mim-text-muted hover:text-mim-text`,
  };
  return (
    <button onClick={onClick} disabled={disabled || loading} className={styles[variant]}>
      {loading && (
        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep]     = useState(1);
  const [busy, setBusy]     = useState(false);
  const [err, setErr]       = useState('');
  const [rpcOk, setRpcOk]   = useState<null | { chain: string; blocks: number }>(null);
  const [detected, setDetected] = useState<string[]>([]);

  const [form, setForm] = useState<FormState>({
    btcConfPath: '',
    rpcHost: 'host.docker.internal',
    rpcPort: '8332',
    rpcUser: '',
    rpcPass: '',
    zmqBlockUrl: 'tcp://host.docker.internal:28332',
    zmqTxUrl:    'tcp://host.docker.internal:28333',
    zmqRawTxUrl: 'tcp://host.docker.internal:28334',
    skipZmq: false,
    password: '',
    passwordConfirm: '',
  });

  const set = (k: keyof FormState) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Redirect if already set up
  useEffect(() => {
    fetch(`${API_BASE}/api/setup/status`)
      .then((r) => r.json())
      .then(({ completed }) => { if (completed) router.replace('/login'); })
      .catch(() => {});
  }, [router]);

  async function detect() {
    setBusy(true); setErr('');
    try {
      const r = await fetch(`${API_BASE}/api/setup/detect`);
      const { found } = await r.json();
      setDetected(found);
      if (found.length > 0) set('btcConfPath')(found[0]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Detection failed');
    } finally {
      setBusy(false);
    }
  }

  async function testRpc() {
    setBusy(true); setErr(''); setRpcOk(null);
    try {
      const r = await fetch(`${API_BASE}/api/setup/test-rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rpcHost: form.rpcHost,
          rpcPort: parseInt(form.rpcPort, 10),
          rpcUser: form.rpcUser,
          rpcPass: form.rpcPass,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error); return; }
      setRpcOk({ chain: data.chain, blocks: data.blocks });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Test failed');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true); setErr('');
    try {
      const body: Record<string, unknown> = {
        rpcHost: form.rpcHost,
        rpcPort: parseInt(form.rpcPort, 10),
        rpcUser: form.rpcUser,
        rpcPass: form.rpcPass,
        password: form.password,
      };
      if (!form.skipZmq) {
        body.zmqBlockUrl  = form.zmqBlockUrl;
        body.zmqTxUrl     = form.zmqTxUrl;
        body.zmqRawTxUrl  = form.zmqRawTxUrl;
      }
      if (form.btcConfPath) body.btcConfPath = form.btcConfPath;

      const r = await fetch(`${API_BASE}/api/setup/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error); return; }
      router.replace('/login');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  function next() { setErr(''); setStep((s) => s + 1); }
  function back() { setErr(''); setStep((s) => s - 1); }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-mim-bg px-4 py-10">

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `
            linear-gradient(#F7931A 1px, transparent 1px),
            linear-gradient(to right, #F7931A 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      <div className="relative z-10 w-full max-w-lg">

        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 glow-orange"
            style={{
              background: 'linear-gradient(135deg, #1A1A25 0%, #12121A 100%)',
              border: '1px solid rgba(247,147,26,0.4)',
            }}
          >
            <span className="text-2xl font-bold text-bitcoin-orange">₿</span>
          </div>
          <h1 className="text-xl font-semibold text-mim-text">MIM-Dashboard Setup</h1>
        </div>

        <ProgressBar step={step} />

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-2">Welcome</h2>
            <p className="text-sm text-mim-text-muted mb-6 leading-relaxed">
              This wizard will connect MIM-Dashboard to your Bitcoin Core node.
              You&apos;ll need your node&apos;s RPC credentials handy.
            </p>
            <ul className="space-y-2 mb-8">
              {[
                'Connect to Bitcoin Core via RPC',
                'Configure ZeroMQ for live events',
                'Set your dashboard password',
              ].map((t) => (
                <li key={t} className="flex items-center gap-2 text-sm text-mim-text-muted">
                  <span className="text-bitcoin-orange">›</span> {t}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Btn onClick={next}>Get Started →</Btn>
            </div>
          </Card>
        )}

        {/* ── Step 2: bitcoin.conf detection ── */}
        {step === 2 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">Detect bitcoin.conf</h2>
            <p className="text-sm text-mim-text-muted mb-6">
              Optionally point to your bitcoin.conf for reference. You can skip this.
            </p>

            <div className="space-y-4">
              <Btn onClick={detect} loading={busy} variant="secondary">
                Scan common paths
              </Btn>

              {detected.length > 0 && (
                <div className="space-y-1">
                  {detected.map((p) => (
                    <button
                      key={p}
                      onClick={() => set('btcConfPath')(p)}
                      className={`
                        w-full text-left px-3 py-2 rounded-lg text-xs font-mono border transition-colors
                        ${form.btcConfPath === p
                          ? 'border-bitcoin-orange text-bitcoin-orange bg-bitcoin-orange/10'
                          : 'border-mim-border text-mim-text-muted hover:border-mim-text-muted'}
                      `}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}

              {detected.length === 0 && !busy && (
                <p className="text-xs text-mim-text-dim font-mono">No files found in common paths.</p>
              )}

              <Field
                label="Or enter path manually"
                value={form.btcConfPath}
                onChange={set('btcConfPath')}
                placeholder="/home/user/.bitcoin/bitcoin.conf"
              />
            </div>

            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}

            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">← Back</Btn>
              <Btn onClick={next}>Next →</Btn>
            </div>
          </Card>
        )}

        {/* ── Step 3: RPC ── */}
        {step === 3 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">RPC Connection</h2>
            <p className="text-sm text-mim-text-muted mb-6">
              Enter your Bitcoin Core RPC credentials.
            </p>

            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Host" value={form.rpcHost} onChange={set('rpcHost')} placeholder="host.docker.internal" />
                </div>
                <Field label="Port" value={form.rpcPort} onChange={set('rpcPort')} placeholder="8332" />
              </div>
              <Field label="RPC User" value={form.rpcUser} onChange={set('rpcUser')} placeholder="bitcoin" />
              <Field label="RPC Password" type="password" value={form.rpcPass} onChange={set('rpcPass')} placeholder="••••••••" />
            </div>

            {rpcOk && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-green-950/40 border border-green-900/50 text-xs font-mono text-green-400">
                ✓ Connected — {rpcOk.chain} chain, block {rpcOk.blocks.toLocaleString()}
              </div>
            )}
            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}

            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">← Back</Btn>
              <div className="flex gap-2">
                <Btn onClick={testRpc} loading={busy} variant="secondary">Test Connection</Btn>
                <Btn onClick={next} disabled={!form.rpcHost || !form.rpcUser || !form.rpcPass}>Next →</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 4: ZMQ ── */}
        {step === 4 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">ZeroMQ Config</h2>
            <p className="text-sm text-mim-text-muted mb-4">
              ZMQ enables real-time block and transaction feeds. Skip if your node doesn&apos;t have ZMQ enabled.
            </p>

            <label className="flex items-center gap-2 mb-5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.skipZmq}
                onChange={(e) => set('skipZmq')(e.target.checked)}
                className="accent-bitcoin-orange"
              />
              <span className="text-sm text-mim-text-muted">Skip ZMQ (disable live feed)</span>
            </label>

            {!form.skipZmq && (
              <div className="space-y-3">
                <Field
                  label="Block URL (hashblock)"
                  value={form.zmqBlockUrl}
                  onChange={set('zmqBlockUrl')}
                  hint="zmqpubhashblock in bitcoin.conf"
                />
                <Field
                  label="Tx URL (hashtx)"
                  value={form.zmqTxUrl}
                  onChange={set('zmqTxUrl')}
                  hint="zmqpubhashtx in bitcoin.conf"
                />
                <Field
                  label="Raw Tx URL (rawtx)"
                  value={form.zmqRawTxUrl}
                  onChange={set('zmqRawTxUrl')}
                  hint="zmqpubrawtx in bitcoin.conf"
                />
              </div>
            )}

            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}

            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">← Back</Btn>
              <Btn onClick={next}>Next →</Btn>
            </div>
          </Card>
        )}

        {/* ── Step 5: Password ── */}
        {step === 5 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">Dashboard Password</h2>
            <p className="text-sm text-mim-text-muted mb-6">
              Set the password you&apos;ll use to log in to MIM-Dashboard.
            </p>

            <div className="space-y-3">
              <Field
                label="Password"
                type="password"
                value={form.password}
                onChange={set('password')}
                placeholder="Minimum 8 characters"
              />
              <Field
                label="Confirm Password"
                type="password"
                value={form.passwordConfirm}
                onChange={set('passwordConfirm')}
                placeholder="••••••••"
              />
            </div>

            {form.password && form.passwordConfirm && form.password !== form.passwordConfirm && (
              <p className="text-xs text-red-400 mt-3 font-mono">Passwords do not match</p>
            )}
            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}

            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">← Back</Btn>
              <Btn
                onClick={next}
                disabled={
                  form.password.length < 8 ||
                  form.password !== form.passwordConfirm
                }
              >
                Next →
              </Btn>
            </div>
          </Card>
        )}

        {/* ── Step 6: Summary ── */}
        {step === 6 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-4">Ready to Launch</h2>

            <div className="space-y-2 mb-6">
              {[
                ['RPC Host',    `${form.rpcHost}:${form.rpcPort}`],
                ['RPC User',    form.rpcUser],
                ['ZMQ',         form.skipZmq ? 'Disabled' : form.zmqBlockUrl],
                ['bitcoin.conf', form.btcConfPath || 'Not set'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm py-2 border-b border-mim-border last:border-0">
                  <span className="text-mim-text-muted font-mono text-xs uppercase tracking-wider">{k}</span>
                  <span className="text-mim-text font-mono text-xs truncate max-w-[220px] text-right">{v}</span>
                </div>
              ))}
            </div>

            {rpcOk && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-green-950/40 border border-green-900/50 text-xs font-mono text-green-400">
                ✓ RPC verified — {rpcOk.chain} chain, block {rpcOk.blocks.toLocaleString()}
              </div>
            )}

            {err && <p className="text-xs text-red-400 mb-4 font-mono">{err}</p>}

            <div className="flex justify-between">
              <Btn onClick={back} variant="ghost">← Back</Btn>
              <Btn onClick={save} loading={busy}>
                Launch Dashboard →
              </Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
