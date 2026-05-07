'use client';

import { useState, useEffect, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatHash, formatNumber, formatBytes } from '@/lib/formatters';
import { useBtcUnit } from '@/hooks/useBtcUnit';
import { usePreferences } from '@/hooks/usePreferences';

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}
      title="Copy"
      className="text-mim-text-dim hover:text-mim-text transition-colors text-sm flex-shrink-0"
    >
      {ok ? '✓' : '⧉'}
    </button>
  );
}

type TxInput = {
  txid: string;
  vout: number;
  address: string;
  value: number;
};

type TxOutput = {
  n: number;
  address: string;
  value: number;
  spent: boolean;
};

type TxDetail = {
  txid: string;
  confirmed: boolean;
  blockHeight?: number;
  blockHash?: string;
  confirmations?: number;
  time?: number;
  size: number;
  vsize: number;
  weight: number;
  fee: number;
  feeRate: number;
  inputs: TxInput[];
  outputs: TxOutput[];
  hex?: string;
};

type TxNote = {
  id: number;
  txid: string;
  note: string;
  created_at: string;
};

// ── Notes Section ────────────────────────────────────────────────────────────
function NotesSection({ txid }: { txid: string }) {
  const { t }                   = usePreferences();
  const [notes,    setNotes]    = useState<TxNote[]>([]);
  const [draft,    setDraft]    = useState('');
  const [editing,  setEditing]  = useState<number | null>(null);
  const [editVal,  setEditVal]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    api<{ notes: TxNote[] }>(`/api/tx/${encodeURIComponent(txid)}/notes`)
      .then((d) => setNotes(d.notes))
      .catch(() => {});
  }, [txid]);

  async function handleAdd() {
    if (!draft.trim()) return;
    setSaving(true);
    setError('');
    try {
      const note = await api<TxNote>(`/api/tx/${encodeURIComponent(txid)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: draft.trim() }),
      });
      setNotes((prev) => [note, ...prev]);
      setDraft('');
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleDelete(noteId: number) {
    try {
      await api(`/api/tx/${encodeURIComponent(txid)}/notes/${noteId}`, { method: 'DELETE' });
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function handleUpdate(noteId: number) {
    if (!editVal.trim()) return;
    try {
      const updated = await api<TxNote>(`/api/tx/${encodeURIComponent(txid)}/notes/${noteId}`, {
        method: 'PUT',
        body: JSON.stringify({ note: editVal.trim() }),
      });
      setNotes((prev) => prev.map((n) => n.id === noteId ? updated : n));
      setEditing(null);
    } catch (e: unknown) { setError((e as Error).message); }
  }

  function startEdit(note: TxNote) {
    setEditing(note.id);
    setEditVal(note.note);
  }

  function formatDate(ts: string) {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  }

  return (
    <div>
      <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
        {t('tx.notes')}
      </h2>

      {/* Add note */}
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={t('tx.addNote')}
          className="flex-1 bg-mim-surface border border-mim-border text-mim-text text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-bitcoin-orange/60 placeholder-mim-text-dim"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !draft.trim()}
          className="px-4 py-2 rounded-lg bg-bitcoin-orange text-black text-xs font-semibold hover:bg-bitcoin-orange-dark disabled:opacity-50 transition-colors"
        >
          {saving ? '…' : t('tx.save')}
        </button>
      </div>

      {error && <p className="text-mim-red text-xs font-mono mb-2">{error}</p>}

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-xs text-mim-text-dim">{t('tx.noNotes')}</p>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className="bg-mim-surface border border-mim-border rounded-lg px-3 py-2.5 group"
            >
              {editing === n.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editVal}
                    onChange={(e) => setEditVal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUpdate(n.id);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    autoFocus
                    className="flex-1 bg-mim-bg border border-mim-border text-mim-text text-sm rounded-lg px-2 py-1 focus:outline-none focus:border-bitcoin-orange/60"
                  />
                  <button onClick={() => handleUpdate(n.id)} className="text-xs text-mim-green hover:underline">{t('tx.save')}</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-mim-text-dim hover:underline">Cancel</button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-mim-text">{n.note}</p>
                    <p className="text-[10px] text-mim-text-dim mt-0.5">{formatDate(n.created_at)}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => startEdit(n)} className="text-[10px] text-mim-text-muted hover:text-mim-text">{t('tx.edit')}</button>
                    <button onClick={() => handleDelete(n.id)} className="text-[10px] text-mim-red hover:text-mim-red/80">{t('tx.delete')}</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TX Detail ────────────────────────────────────────────────────────────────
function TxDetailContent() {
  const { txid } = useParams<{ txid: string }>();
  const searchParams = useSearchParams();
  const { fmt } = useBtcUnit();
  const { t }   = usePreferences();

  const [tx,        setTx]        = useState<TxDetail | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [hexOpen,   setHexOpen]   = useState(false);

  useEffect(() => {
    const blockhash = searchParams.get('blockhash');
    const qs = blockhash ? `?blockhash=${blockhash}` : '';
    api<TxDetail>(`/api/tx/${encodeURIComponent(txid)}${qs}`)
      .then(setTx)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [txid, searchParams]);


  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-mim-text-muted text-sm animate-pulse">
        {t('tx.loading')}
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="space-y-4 max-w-4xl">
        <p className="text-mim-red font-mono text-sm">{error || t('tx.notFound')}</p>
        <Link href="/explorer" className="text-bitcoin-orange text-sm hover:underline">
          {t('tx.backExplorer')}
        </Link>
      </div>
    );
  }

  const totalIn  = tx.inputs.reduce((s, i) => s + i.value, 0);
  const totalOut = tx.outputs.reduce((s, o) => s + o.value, 0);

  return (
    <div className="space-y-6 max-w-5xl">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-mim-text-muted">
        <Link href="/explorer" className="hover:text-mim-text transition-colors">
          Explorer
        </Link>
        <span>/</span>
        {tx.blockHeight && (
          <>
            <Link
              href={`/explorer/block/${tx.blockHash ?? tx.blockHeight}`}
              className="hover:text-mim-text transition-colors"
            >
              Block {tx.blockHeight}
            </Link>
            <span>/</span>
          </>
        )}
        <span className="text-mim-text font-mono">{formatHash(txid, 8)}</span>
      </div>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold ${
              tx.confirmed
                ? 'bg-mim-green/10 text-mim-green border border-mim-green/30'
                : 'bg-bitcoin-orange/10 text-bitcoin-orange border border-bitcoin-orange/30'
            }`}
          >
            {tx.confirmed
              ? `✓ ${t('tx.confirmed')} · ${tx.confirmations} ${tx.confirmations !== 1 ? t('tx.confs') : t('tx.conf')}`
              : `⏳ ${t('tx.unconfirmed')}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <p className="text-hash font-mono text-xs break-all">{txid}</p>
          <CopyBtn text={txid} />
        </div>
      </div>

      {/* Info row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('tx.size'),     value: formatBytes(tx.size) },
          { label: t('tx.vsize'),    value: `${tx.vsize} vB` },
          { label: t('tx.weight'),   value: `${formatNumber(tx.weight)} WU` },
          { label: t('tx.fee'),      value: `${(tx.fee * 1e8).toFixed(0)} sat · ${tx.feeRate} sat/vB` },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-mim-surface border border-mim-border rounded-xl p-4 space-y-1"
          >
            <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">
              {label}
            </p>
            <p className="font-mono text-sm text-mim-text">{value}</p>
          </div>
        ))}
      </div>

      {/* IO Diagram */}
      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
          {t('tx.inputsOutputs')}
        </h2>

        <div className="flex flex-col sm:flex-row gap-4 items-start">

          {/* Inputs */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {tx.inputs.map((inp, i) => (
              <div
                key={i}
                className="bg-mim-surface border border-mim-border rounded-lg px-3 py-2.5 space-y-1"
              >
                <p className="text-hash text-xs truncate">{inp.address || 'coinbase'}</p>
                <p className="font-mono text-xs text-mim-text-muted">
                  {inp.value > 0 ? fmt(inp.value) : '—'}
                </p>
              </div>
            ))}
            <div className="text-[10px] text-mim-text-dim text-right">
              {t('tx.totalIn')} {fmt(totalIn)}
            </div>
          </div>

          {/* Arrow */}
          <div className="flex-shrink-0 flex items-center justify-center sm:pt-3 text-bitcoin-orange text-lg">
            <span className="hidden sm:inline">→</span>
            <span className="sm:hidden">↓</span>
          </div>

          {/* Outputs */}
          <div className="flex-1 min-w-0 space-y-1.5">
            {tx.outputs.map((out) => (
              <div
                key={out.n}
                className={`border rounded-lg px-3 py-2.5 space-y-1 ${
                  out.spent
                    ? 'bg-mim-surface border-mim-border opacity-60'
                    : 'bg-mim-surface border-mim-green/40'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-hash text-xs truncate">{out.address || 'OP_RETURN'}</p>
                  {!out.spent && (
                    <span className="text-[9px] text-mim-green flex-shrink-0">{t('tx.unspent')}</span>
                  )}
                </div>
                <p className="font-mono text-xs text-mim-text">
                  {fmt(out.value)}
                </p>
              </div>
            ))}
            <div className="text-[10px] text-mim-text-dim text-right">
              {t('tx.totalOut')} {fmt(totalOut)}
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <NotesSection txid={txid} />

      {/* Raw hex (collapsible) */}
      {tx.hex && (
        <div className="border border-mim-border rounded-xl overflow-hidden">
          <button
            onClick={() => setHexOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-mim-surface hover:bg-mim-surface-2 transition-colors text-xs text-mim-text-muted font-semibold uppercase tracking-widest"
          >
            <span>{t('tx.rawHex')}</span>
            <span>{hexOpen ? '▲' : '▼'}</span>
          </button>

          {hexOpen && (
            <div className="border-t border-mim-border bg-mim-bg p-4">
              <pre className="text-hash text-[10px] break-all whitespace-pre-wrap">
                {tx.hex}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TxDetailPage() {
  const { t } = usePreferences();
  return (
    <Suspense fallback={
      <div className="text-mim-text-muted text-sm animate-pulse">{t('tx.loading')}</div>
    }>
      <TxDetailContent />
    </Suspense>
  );
}
