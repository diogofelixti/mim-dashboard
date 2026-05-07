'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { translate, type Lang } from '@/lib/i18n';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STEPS = [
  { id: 1, i18nKey: 'setup.step.welcome' },
  { id: 2, i18nKey: 'setup.step.detect' },
  { id: 3, i18nKey: 'setup.step.rpc' },
  { id: 4, i18nKey: 'setup.step.zmq' },
  { id: 5, i18nKey: 'setup.step.password' },
  { id: 6, i18nKey: 'setup.step.launch' },
];

type Network  = 'mainnet' | 'signet' | 'testnet';
type AuthMode = 'userpass' | 'cookie';

interface NodeInfo {
  confPath:    string;
  datadir:     string;
  network:     string;
  parsed:      Record<string, string>;
  zmqDetected: boolean;
  cookie:      { found: boolean; user?: string; path?: string };
  suggestedConfig: {
    rpc_host:       string;
    rpc_port:       number;
    rpc_user:       string;
    rpc_pass:       string;
    auth_type:      string;
    zmq_block_url:  string;
    zmq_tx_url:     string;
    zmq_raw_tx_url: string;
    zmq_detected:   boolean;
    cookie_path:    string | null;
  };
}

interface DetectResult {
  nodes:           NodeInfo[];
  suggestedConfig: NodeInfo['suggestedConfig'] | null;
}

interface Form {
  btcNetwork:      Network;
  rpcHost:         string;
  rpcPort:         string;
  authMode:        AuthMode;
  cookiePaste:     string;
  rpcUser:         string;
  rpcPass:         string;
  cookiePath:      string;
  zmqBlockUrl:     string;
  zmqTxUrl:        string;
  zmqRawTxUrl:     string;
  skipZmq:         boolean;
  password:        string;
  passwordConfirm: string;
  btcUnit:         'BTC' | 'sats';
  language:        Lang;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────

function ProgressBar({ step, t }: { step: number; t: (key: string) => string }) {
  return (
    <div className="w-full mb-10">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 right-0 top-4 h-0.5 bg-mim-border z-0" />
        <div
          className="absolute left-0 top-4 h-0.5 bg-bitcoin-orange z-0 transition-all duration-500"
          style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
        />
        {STEPS.map((s) => {
          const done   = s.id < step;
          const active = s.id === step;
          return (
            <div key={s.id} className="relative z-10 flex flex-col items-center gap-1.5">
              <div className={[
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300',
                done   ? 'bg-bitcoin-orange border-bitcoin-orange text-black' : '',
                active ? 'bg-mim-surface border-bitcoin-orange text-bitcoin-orange' : '',
                !done && !active ? 'bg-mim-surface border-mim-border text-mim-text-muted' : '',
              ].join(' ')}>
                {done ? '✓' : s.id}
              </div>
              <span className={`text-[10px] font-mono hidden sm:block ${active ? 'text-bitcoin-orange' : 'text-mim-text-muted'}`}>
                {t(s.i18nKey)}
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
    <div className="bg-mim-surface rounded-2xl p-8 border border-mim-border w-full"
         style={{ boxShadow: '0 0 40px rgba(247,147,26,0.04)' }}>
      {children}
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder, hint, readOnly }: {
  label: string; type?: string; value: string; onChange?: (v: string) => void;
  placeholder?: string; hint?: string; readOnly?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-mim-text-muted mb-1.5 uppercase tracking-widest">{label}</label>
      <input
        type={type} value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={[
          'w-full px-4 py-2.5 rounded-lg font-mono text-sm',
          'bg-mim-bg border border-mim-border text-mim-text placeholder-mim-text-dim',
          'focus:outline-none focus:border-bitcoin-orange focus:ring-1 focus:ring-bitcoin-orange',
          'transition-colors duration-150',
          readOnly ? 'opacity-60 cursor-default' : '',
        ].join(' ')}
      />
      {hint && <p className="text-xs text-mim-text-dim mt-1">{hint}</p>}
    </div>
  );
}

function PillGroup<T extends string>({ options, value, onChange, labels }: {
  options: T[]; value: T; onChange: (v: T) => void; labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-mim-border">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={[
            'flex-1 py-2 text-xs font-mono capitalize transition-colors',
            value === o ? 'bg-bitcoin-orange/20 text-bitcoin-orange' : 'bg-mim-bg text-mim-text-muted hover:text-mim-text',
          ].join(' ')}>
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}

function Btn({ onClick, disabled, loading, variant = 'primary', children }: {
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
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <div className={[
      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-mono border',
      ok ? 'bg-green-950/40 border-green-900/50 text-green-400'
         : 'bg-yellow-950/40 border-yellow-900/50 text-yellow-400',
    ].join(' ')}>
      <span>{ok ? '✓' : '⚠'}</span>
      {children}
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 rounded-lg bg-mim-bg border border-mim-border text-xs font-mono text-mim-text-muted leading-relaxed space-y-1">
      {children}
    </div>
  );
}

function NetworkBadge({ network }: { network: string }) {
  const colors: Record<string, string> = {
    mainnet: 'bg-bitcoin-orange/10 border-bitcoin-orange/30 text-bitcoin-orange',
    signet:  'bg-purple-950/40 border-purple-900/50 text-purple-400',
    testnet: 'bg-blue-950/40 border-blue-900/50 text-blue-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border uppercase tracking-widest ${colors[network] ?? colors.mainnet}`}>
      {network}
    </span>
  );
}

function NodeCard({ node, selected, onSelect }: { node: NodeInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={[
        'w-full text-left p-4 rounded-xl border transition-all duration-150',
        selected
          ? 'border-bitcoin-orange bg-bitcoin-orange/5'
          : 'border-mim-border bg-mim-bg hover:border-bitcoin-orange/50',
      ].join(' ')}
    >
      <div className="flex items-center justify-between mb-2">
        <NetworkBadge network={node.network} />
        <div className="flex items-center gap-2">
          {node.cookie.found && (
            <span className="text-[10px] font-mono text-green-400 bg-green-950/40 border border-green-900/50 px-2 py-0.5 rounded">
              cookie
            </span>
          )}
          {node.zmqDetected && (
            <span className="text-[10px] font-mono text-bitcoin-orange/80 bg-bitcoin-orange/5 border border-bitcoin-orange/20 px-2 py-0.5 rounded">
              zmq
            </span>
          )}
          {selected && (
            <span className="text-[10px] font-mono text-bitcoin-orange">✓ selected</span>
          )}
        </div>
      </div>
      <p className="text-xs font-mono text-mim-text-muted truncate">{node.confPath}</p>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep]               = useState(1);
  const [busy, setBusy]               = useState(false);
  const [err,  setErr]                = useState('');
  const [rpcOk, setRpcOk]             = useState<{ chain: string; blocks: number } | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeInfo | null>(null);
  const [detectDone, setDetectDone]   = useState(false);

  const [form, setForm] = useState<Form>({
    btcNetwork:      'mainnet',
    rpcHost:         'host.docker.internal',
    rpcPort:         '8332',
    authMode:        'userpass',
    cookiePaste:     '',
    rpcUser:         '',
    rpcPass:         '',
    cookiePath:      '',
    zmqBlockUrl:     'tcp://host.docker.internal:28332',
    zmqTxUrl:        'tcp://host.docker.internal:28333',
    zmqRawTxUrl:     'tcp://host.docker.internal:28334',
    skipZmq:         false,
    password:        '',
    passwordConfirm: '',
    btcUnit:         'BTC',
    language:        'en',
  });

  const t = (key: string, params?: Record<string, string | number>) => translate(form.language, key, params);

  const patch = (u: Partial<Form>) => setForm((f) => ({ ...f, ...u }));

  // Auto-parse pasted cookie → rpcUser / rpcPass
  useEffect(() => {
    if (form.authMode !== 'cookie' || !form.cookiePaste) return;
    const t = form.cookiePaste.trim();
    const i = t.indexOf(':');
    if (i !== -1) patch({ rpcUser: t.slice(0, i), rpcPass: t.slice(i + 1) });
  }, [form.cookiePaste]); // eslint-disable-line react-hooks/exhaustive-deps

  // Redirect if already set up
  useEffect(() => {
    fetch(`${API_BASE}/api/setup/status`)
      .then((r) => r.json())
      .then(({ completed }) => { if (completed) router.replace('/login'); })
      .catch(() => {});
  }, [router]);

  // Auto-trigger detect when entering step 2
  useEffect(() => {
    if (step === 2 && !detectDone && !busy) {
      detect();
    }
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function applyNode(node: NodeInfo) {
    const s = node.suggestedConfig;
    patch({
      btcNetwork:  node.network as Network,
      rpcHost:     s.rpc_host,
      rpcPort:     String(s.rpc_port),
      rpcUser:     s.rpc_user,
      rpcPass:     s.rpc_pass,
      authMode:    s.auth_type === 'cookie' ? 'cookie' : 'userpass',
      cookiePath:  s.cookie_path ?? '',
      zmqBlockUrl: s.zmq_block_url,
      zmqTxUrl:    s.zmq_tx_url,
      zmqRawTxUrl: s.zmq_raw_tx_url,
    });
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function detect() {
    setBusy(true); setErr(''); setDetectResult(null); setSelectedNode(null);
    try {
      const r = await fetch(`${API_BASE}/api/setup/detect`);
      const data: DetectResult = await r.json();
      if (!r.ok) { setErr((data as { error?: string }).error ?? 'Detection failed'); return; }
      setDetectResult(data);
      setDetectDone(true);
      if (data.nodes.length === 1) {
        setSelectedNode(data.nodes[0]);
        applyNode(data.nodes[0]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Detection failed');
      setDetectDone(true);
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
        rpcHost:    form.rpcHost,
        rpcPort:    parseInt(form.rpcPort, 10),
        rpcUser:    form.rpcUser,
        rpcPass:    form.rpcPass,
        authType:   form.authMode,
        btcNetwork: form.btcNetwork,
        password:   form.password,
        btcUnit:    form.btcUnit,
        language:   form.language,
      };
      localStorage.setItem('mim-language', form.language);
      if (!form.skipZmq) {
        body.zmqBlockUrl  = form.zmqBlockUrl;
        body.zmqTxUrl     = form.zmqTxUrl;
        body.zmqRawTxUrl  = form.zmqRawTxUrl;
      }
      if (selectedNode?.confPath) body.btcConfPath = selectedNode.confPath;
      if (form.authMode === 'cookie' && form.cookiePath) body.cookiePath = form.cookiePath;

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

  const rpcReady     = Boolean(form.rpcHost && form.rpcUser && form.rpcPass);
  const confParsed   = selectedNode?.parsed ?? {};
  const zmqNotDetected = selectedNode && !selectedNode.zmqDetected;
  const detected     = Boolean(selectedNode);

  const zmqExampleConf = form.btcNetwork === 'mainnet'
    ? `zmqpubhashblock=tcp://0.0.0.0:28332\nzmqpubhashtx=tcp://0.0.0.0:28333\nzmqpubrawtx=tcp://0.0.0.0:28334`
    : `[${form.btcNetwork}]\nzmqpubhashblock=tcp://0.0.0.0:28332\nzmqpubhashtx=tcp://0.0.0.0:28333\nzmqpubrawtx=tcp://0.0.0.0:28334`;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-mim-bg px-4 py-10">
      <div className="absolute inset-0 opacity-[0.025]" style={{
        backgroundImage: `linear-gradient(#F7931A 1px, transparent 1px), linear-gradient(to right, #F7931A 1px, transparent 1px)`,
        backgroundSize: '48px 48px',
      }} />

      <div className="relative z-10 w-full max-w-lg">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-3 glow-orange"
               style={{ background: 'linear-gradient(135deg, #1A1A25 0%, #12121A 100%)', border: '1px solid rgba(247,147,26,0.4)' }}>
            <span className="text-2xl font-bold text-bitcoin-orange">₿</span>
          </div>
          <h1 className="text-xl font-semibold text-mim-text">{t('setup.title')}</h1>
        </div>

        <ProgressBar step={step} t={t} />

        {/* ── Step 1: Welcome ── */}
        {step === 1 && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-mim-text">{t('setup.welcome.title')}</h2>
              <PillGroup<Lang>
                options={['en', 'pt']}
                value={form.language}
                onChange={(v) => patch({ language: v })}
                labels={{ en: 'English', pt: 'Português' }}
              />
            </div>
            <p className="text-sm text-mim-text-muted mb-6 leading-relaxed">
              {t('setup.welcome.desc')}
            </p>
            <ul className="space-y-2 mb-8">
              {[
                t('setup.welcome.autoDetect'),
                t('setup.welcome.readConf'),
                t('setup.welcome.connectRpc'),
                t('setup.welcome.configZmq'),
                t('setup.welcome.setPassword'),
              ].map((text) => (
                <li key={text} className="flex items-center gap-2 text-sm text-mim-text-muted">
                  <span className="text-bitcoin-orange">›</span> {text}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Btn onClick={next}>{t('setup.welcome.start')}</Btn>
            </div>
          </Card>
        )}

        {/* ── Step 2: Detect Node ── */}
        {step === 2 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">{t('setup.detect.title')}</h2>
            <p className="text-sm text-mim-text-muted mb-5">
              {t('setup.detect.desc')}
            </p>

            {/* Scanning spinner */}
            {busy && (
              <div className="flex flex-col items-center py-8 gap-3">
                <svg className="animate-spin h-8 w-8 text-bitcoin-orange" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-sm text-mim-text-muted font-mono">{t('setup.detect.scanning')}</p>
              </div>
            )}

            {/* Results: multiple nodes */}
            {!busy && detectDone && detectResult && detectResult.nodes.length > 1 && (
              <div className="space-y-3">
                <p className="text-xs text-mim-text-muted font-mono">
                  {t('setup.detect.found', { count: detectResult.nodes.length })}
                </p>
                {detectResult.nodes.map((node) => (
                  <NodeCard
                    key={node.confPath}
                    node={node}
                    selected={selectedNode?.confPath === node.confPath}
                    onSelect={() => { setSelectedNode(node); applyNode(node); }}
                  />
                ))}
                {selectedNode && (
                  <p className="text-xs text-green-400 font-mono">{t('setup.detect.preFilled')}</p>
                )}
              </div>
            )}

            {/* Results: single node */}
            {!busy && detectDone && detectResult && detectResult.nodes.length === 1 && (
              <div className="space-y-2">
                <NodeCard
                  node={detectResult.nodes[0]}
                  selected
                  onSelect={() => {}}
                />
                <div className="space-y-2 mt-2">
                  {detectResult.nodes[0].cookie.found && (
                    <Badge ok>Cookie auth — {detectResult.nodes[0].cookie.path}</Badge>
                  )}
                  {detectResult.nodes[0].zmqDetected && (
                    <Badge ok>ZMQ endpoints detected in bitcoin.conf</Badge>
                  )}
                </div>
                <p className="text-xs text-green-400 font-mono">{t('setup.detect.preFilled')}</p>
              </div>
            )}

            {/* Results: nothing found */}
            {!busy && detectDone && detectResult && detectResult.nodes.length === 0 && (
              <div className="space-y-3">
                <Badge ok={false}>{t('setup.detect.notFound')}</Badge>
                <InfoBox>
                  <p>{t('setup.detect.searchedDirs')}</p>
                  <p className="text-mim-text-dim mt-1">
                    {t('setup.detect.proceedManual')}
                  </p>
                </InfoBox>
              </div>
            )}

            {/* Error */}
            {!busy && err && (
              <p className="text-xs text-red-400 font-mono">{err}</p>
            )}

            {/* Re-scan button (shown after first scan) */}
            {!busy && detectDone && (
              <div className="mt-4">
                <Btn onClick={() => { setDetectDone(false); detect(); }} variant="ghost">
                  {t('setup.detect.rescan')}
                </Btn>
              </div>
            )}

            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">{t('setup.nav.back')}</Btn>
              <Btn onClick={next} disabled={busy}>
                {detectResult?.nodes.length === 0 ? t('setup.detect.skip') : t('setup.nav.next')}
              </Btn>
            </div>
          </Card>
        )}

        {/* ── Step 3: RPC ── */}
        {step === 3 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">{t('setup.rpc.title')}</h2>
            <p className="text-sm text-mim-text-muted mb-5">
              {detected ? t('setup.rpc.descDetected') : t('setup.rpc.descManual')}
            </p>

            {/* Docker rpcallowip warning */}
            <div className="mb-5 px-4 py-3 rounded-lg border border-yellow-700/60 bg-yellow-950/30">
              <p className="text-xs font-semibold text-yellow-400 mb-2">
                ⚠ {t('setup.rpc.dockerWarning')}
              </p>
              <p className="text-xs text-mim-text-muted mb-2">
                {t('setup.rpc.dockerHint')} <code className="text-mim-text">[signet]</code>):
              </p>
              <pre className="px-3 py-2 rounded bg-mim-bg border border-mim-border text-xs font-mono text-mim-text whitespace-pre mb-2">{`rpcbind=0.0.0.0\nrpcallowip=172.16.0.0/12\nrpcallowip=127.0.0.1`}</pre>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText('rpcbind=0.0.0.0\nrpcallowip=172.16.0.0/12\nrpcallowip=127.0.0.1')}
                  className="px-2.5 py-1 rounded text-[10px] font-mono bg-mim-bg border border-mim-border text-mim-text-muted hover:text-bitcoin-orange hover:border-bitcoin-orange transition-colors"
                >
                  {t('setup.rpc.copyClipboard')}
                </button>
                <span className="text-[10px] text-mim-text-dim">{t('setup.rpc.restartHint')}</span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Host + Port */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label={t('setup.rpc.host')} value={form.rpcHost} onChange={(v) => patch({ rpcHost: v })}
                         placeholder="host.docker.internal"
                         hint={t('setup.rpc.hostHint')} />
                </div>
                <Field label={t('setup.rpc.port')} value={form.rpcPort} onChange={(v) => patch({ rpcPort: v })} />
              </div>

              {/* Auth method */}
              <div>
                <label className="block text-xs text-mim-text-muted mb-1.5 uppercase tracking-widest">
                  {t('setup.rpc.auth')}
                </label>
                <PillGroup<AuthMode>
                  options={['userpass', 'cookie']}
                  value={form.authMode}
                  onChange={(v) => { patch({ authMode: v }); setErr(''); }}
                  labels={{ userpass: t('setup.rpc.userPass'), cookie: t('setup.rpc.cookieFile') }}
                />
              </div>

              {/* User/Password */}
              {form.authMode === 'userpass' && (
                <div className="space-y-3">
                  <Field label={t('setup.rpc.rpcUser')} value={form.rpcUser} onChange={(v) => patch({ rpcUser: v })}
                         placeholder="bitcoinrpc" />
                  <Field label={t('setup.rpc.rpcPassword')} type="password" value={form.rpcPass}
                         onChange={(v) => patch({ rpcPass: v })} placeholder="••••••••" />
                </div>
              )}

              {/* Cookie auth */}
              {form.authMode === 'cookie' && (
                <div className="space-y-3">
                  {selectedNode?.cookie.found ? (
                    <>
                      <Badge ok>
                        {t('setup.rpc.cookieAutoLoaded', { path: selectedNode.cookie.path ?? '' })}
                      </Badge>
                      <InfoBox>
                        <p className="text-green-400">{t('setup.summary.user')} {form.rpcUser}</p>
                        <p className="text-mim-text-dim mt-1">
                          {t('setup.rpc.cookieAutoRefresh')}
                        </p>
                      </InfoBox>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <InfoBox>
                        <p>{t('setup.rpc.runTerminal')}</p>
                        <p className="text-bitcoin-orange">
                          cat ~/.bitcoin/{form.btcNetwork !== 'mainnet' ? `${form.btcNetwork}/` : ''}.cookie
                        </p>
                        <p className="text-mim-text-dim mt-1">
                          {t('setup.rpc.cookieFormat')} <span className="text-mim-text">__cookie__:&lt;password&gt;</span>
                        </p>
                      </InfoBox>
                      <div>
                        <label className="block text-xs text-mim-text-muted mb-1.5 uppercase tracking-widest">
                          {t('setup.rpc.pasteCookie')}
                        </label>
                        <textarea
                          value={form.cookiePaste}
                          onChange={(e) => patch({ cookiePaste: e.target.value })}
                          placeholder="__cookie__:abc123def456..."
                          rows={2}
                          className="w-full px-4 py-2.5 rounded-lg font-mono text-sm bg-mim-bg border border-mim-border text-mim-text placeholder-mim-text-dim focus:outline-none focus:border-bitcoin-orange focus:ring-1 focus:ring-bitcoin-orange transition-colors resize-none"
                        />
                        {form.rpcUser === '__cookie__' && form.rpcPass && (
                          <p className="text-xs text-green-400 font-mono mt-1">{t('setup.rpc.parsed', { user: form.rpcUser })}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t('setup.rpc.userAuto')} value={form.rpcUser}
                               onChange={(v) => patch({ rpcUser: v })} readOnly={form.rpcUser === '__cookie__'} />
                        <Field label={t('setup.rpc.passAuto')} type="password" value={form.rpcPass}
                               onChange={(v) => patch({ rpcPass: v })} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Conf-detected fields summary */}
            {detected && Object.keys(confParsed).length > 0 && (
              <details className="mt-4">
                <summary className="text-xs text-mim-text-muted cursor-pointer hover:text-mim-text font-mono">
                  {t('setup.rpc.showParsed', { count: Object.keys(confParsed).length })}
                </summary>
                <div className="mt-2 max-h-36 overflow-y-auto rounded-lg bg-mim-bg border border-mim-border p-3 text-xs font-mono text-mim-text-muted space-y-0.5">
                  {Object.entries(confParsed).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-bitcoin-orange">{k}</span>=<span className="text-mim-text">{k.includes('pass') || k.includes('cookie') ? '●●●●' : v}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {rpcOk && (
              <div className="mt-4 px-4 py-3 rounded-lg bg-green-950/40 border border-green-900/50 text-xs font-mono text-green-400">
                {t('setup.rpc.connected', { chain: rpcOk.chain, blocks: rpcOk.blocks.toLocaleString() })}
              </div>
            )}
            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}

            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">{t('setup.nav.back')}</Btn>
              <div className="flex gap-2">
                <Btn onClick={testRpc} loading={busy} variant="secondary" disabled={!rpcReady}>{t('setup.rpc.test')}</Btn>
                <Btn onClick={next} disabled={!rpcReady}>{t('setup.nav.next')}</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* ── Step 4: ZMQ ── */}
        {step === 4 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">{t('setup.zmq.title')}</h2>
            <p className="text-sm text-mim-text-muted mb-4">
              {t('setup.zmq.desc')}
            </p>

            {/* ZMQ binding warning */}
            {!form.skipZmq && (
              <div className="mb-4 px-4 py-3 rounded-lg border border-yellow-700/60 bg-yellow-950/30">
                <p className="text-xs font-semibold text-yellow-400 mb-2">
                  ⚠ {t('setup.zmq.bindWarning')}
                </p>
                <p className="text-xs text-mim-text-muted mb-2">
                  {t('setup.zmq.bindHint')}
                </p>
                <pre className="px-3 py-2 rounded bg-mim-bg border border-mim-border text-xs font-mono text-mim-text whitespace-pre mb-2">{`zmqpubhashblock=tcp://0.0.0.0:28332\nzmqpubhashtx=tcp://0.0.0.0:28333\nzmqpubrawtx=tcp://0.0.0.0:28334`}</pre>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText('zmqpubhashblock=tcp://0.0.0.0:28332\nzmqpubhashtx=tcp://0.0.0.0:28333\nzmqpubrawtx=tcp://0.0.0.0:28334')}
                  className="px-2.5 py-1 rounded text-[10px] font-mono bg-mim-bg border border-mim-border text-mim-text-muted hover:text-bitcoin-orange hover:border-bitcoin-orange transition-colors"
                >
                  {t('setup.rpc.copyClipboard')}
                </button>
              </div>
            )}

            {zmqNotDetected && !form.skipZmq && (
              <div className="mb-4 space-y-2">
                <Badge ok={false}>{t('setup.zmq.notFound')}</Badge>
                <details>
                  <summary className="text-xs text-yellow-400 cursor-pointer hover:text-yellow-300 font-mono">
                    {t('setup.zmq.addLines')}
                  </summary>
                  <pre className="mt-2 px-4 py-3 rounded-lg bg-mim-bg border border-mim-border text-xs font-mono text-mim-text whitespace-pre-wrap">
                    {zmqExampleConf}
                  </pre>
                </details>
              </div>
            )}

            {selectedNode?.zmqDetected && !form.skipZmq && (
              <Badge ok>{t('setup.zmq.autoFilled')}</Badge>
            )}

            <label className="flex items-center gap-2 my-4 cursor-pointer">
              <input type="checkbox" checked={form.skipZmq}
                     onChange={(e) => patch({ skipZmq: e.target.checked })}
                     className="accent-bitcoin-orange" />
              <span className="text-sm text-mim-text-muted">{t('setup.zmq.skip')}</span>
            </label>

            {!form.skipZmq && (
              <div className="space-y-3">
                <Field label="Block URL (zmqpubhashblock)" value={form.zmqBlockUrl}
                       onChange={(v) => patch({ zmqBlockUrl: v })} />
                <Field label="Tx URL (zmqpubhashtx)" value={form.zmqTxUrl}
                       onChange={(v) => patch({ zmqTxUrl: v })} />
                <Field label="Raw Tx URL (zmqpubrawtx)" value={form.zmqRawTxUrl}
                       onChange={(v) => patch({ zmqRawTxUrl: v })} />
              </div>
            )}

            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}
            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">{t('setup.nav.back')}</Btn>
              <Btn onClick={next}>{t('setup.nav.next')}</Btn>
            </div>
          </Card>
        )}

        {/* ── Step 5: Password ── */}
        {step === 5 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-1">{t('setup.password.title')}</h2>
            <p className="text-sm text-mim-text-muted mb-6">{t('setup.password.desc')}</p>
            <div className="space-y-3">
              <Field label={t('setup.password.password')} type="password" value={form.password}
                     onChange={(v) => patch({ password: v })} placeholder={t('setup.password.min8')} />
              <Field label={t('setup.password.confirm')} type="password" value={form.passwordConfirm}
                     onChange={(v) => patch({ passwordConfirm: v })} placeholder="••••••••" />
            </div>
            {form.password && form.passwordConfirm && form.password !== form.passwordConfirm && (
              <p className="text-xs text-red-400 mt-3 font-mono">{t('setup.password.mismatch')}</p>
            )}

            <div className="mt-5">
              <label className="block text-xs text-mim-text-muted mb-1.5 uppercase tracking-widest">
                {t('setup.password.btcUnit')}
              </label>
              <PillGroup<'BTC' | 'sats'>
                options={['BTC', 'sats']}
                value={form.btcUnit}
                onChange={(v) => patch({ btcUnit: v })}
                labels={{ BTC: '₿ BTC', sats: 'sats' }}
              />
              <p className="text-xs text-mim-text-dim mt-1.5">
                {form.btcUnit === 'BTC' ? t('setup.password.btcHint') : t('setup.password.satsHint')}
              </p>
            </div>
            {err && <p className="text-xs text-red-400 mt-3 font-mono">{err}</p>}
            <div className="flex justify-between mt-6">
              <Btn onClick={back} variant="ghost">{t('setup.nav.back')}</Btn>
              <Btn onClick={next} disabled={form.password.length < 8 || form.password !== form.passwordConfirm}>
                {t('setup.nav.next')}
              </Btn>
            </div>
          </Card>
        )}

        {/* ── Step 6: Summary ── */}
        {step === 6 && (
          <Card>
            <h2 className="text-lg font-semibold text-mim-text mb-4">{t('setup.summary.title')}</h2>
            <div className="rounded-lg overflow-hidden border border-mim-border mb-6">
              {[
                [t('setup.summary.network'), form.btcNetwork],
                [t('setup.summary.rpcHost'), `${form.rpcHost}:${form.rpcPort}`],
                [t('setup.summary.auth'),    form.authMode === 'cookie'
                  ? (selectedNode?.cookie.found ? t('setup.summary.cookieAuto') : t('setup.summary.cookiePasted'))
                  : `${t('setup.summary.user')} ${form.rpcUser}`],
                [t('setup.summary.zmq'),     form.skipZmq ? t('setup.summary.disabled') : form.zmqBlockUrl],
                ['bitcoin.conf',             selectedNode?.confPath ?? t('setup.summary.notSet')],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between px-4 py-2.5 border-b border-mim-border last:border-0 bg-mim-bg/40">
                  <span className="text-mim-text-muted font-mono text-xs uppercase tracking-wider">{k}</span>
                  <span className="text-mim-text font-mono text-xs truncate max-w-[220px] text-right">{v}</span>
                </div>
              ))}
            </div>

            {rpcOk && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-green-950/40 border border-green-900/50 text-xs font-mono text-green-400">
                {t('setup.summary.rpcVerified', { chain: rpcOk.chain, blocks: rpcOk.blocks.toLocaleString() })}
              </div>
            )}
            {err && <p className="text-xs text-red-400 mb-4 font-mono">{err}</p>}
            <div className="flex justify-between">
              <Btn onClick={back} variant="ghost">{t('setup.nav.back')}</Btn>
              <Btn onClick={save} loading={busy}>{t('setup.summary.launch')}</Btn>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
