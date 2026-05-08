'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatHash, formatNumber } from '@/lib/formatters';
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

type AddrUtxo = {
  txid: string;
  vout: number;
  amount: number;
  height: number;
};

type AddressInfo = {
  address: string;
  total_amount: number;
  utxo_count: number;
  iswitness?: boolean;
  witness_version?: number;
  isscript?: boolean;
  utxos: AddrUtxo[];
};

function StatCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-mim-surface border border-mim-border rounded-xl p-4 space-y-1">
      <p className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted">{label}</p>
      <p className={`text-sm font-semibold text-mim-text ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export default function AddressPage() {
  const params = useParams();
  const addr = params.addr as string;
  const { fmt } = useBtcUnit();
  const { t } = usePreferences();
  const [data, setData] = useState<AddressInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!addr) return;
    api<AddressInfo>(`/api/address/${encodeURIComponent(addr)}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [addr]);

  if (loading) return <p className="text-xs text-mim-text-muted animate-pulse">Loading...</p>;
  if (error) return <p className="text-xs text-mim-red font-mono">{error}</p>;
  if (!data) return null;

  const addrType = data.iswitness
    ? data.witness_version === 0 ? 'bech32 (P2WPKH)' : `bech32m (v${data.witness_version})`
    : data.isscript ? 'P2SH' : 'P2PKH';

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/explorer" className="text-xs text-mim-text-muted hover:text-mim-text transition-colors">
        {t('addr.backExplorer')}
      </Link>

      <div>
        <h1 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-2">
          {t('addr.title')}
        </h1>
        <div className="flex items-center gap-2">
          <p className="font-mono text-sm text-mim-text break-all">{data.address}</p>
          <CopyBtn text={data.address} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label={t('addr.balance')} value={fmt(data.total_amount)} mono />
        <StatCard label={t('addr.utxoCount')} value={formatNumber(data.utxo_count)} />
        <StatCard label={t('addr.type')} value={addrType} />
      </div>

      <div>
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-mim-text-muted mb-3">
          {t('addr.utxos')}
        </h2>
        {data.utxos.length === 0 ? (
          <p className="text-xs text-mim-text-dim">{t('addr.noUtxos')}</p>
        ) : (
          <div className="bg-mim-surface border border-mim-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-mim-border">
                  {[t('addr.txid'), t('addr.amount'), t('addr.height')].map((h, i) => (
                    <th key={h} className={`px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-mim-text-muted ${i > 0 ? 'text-right' : 'text-left'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.utxos.map((u) => (
                  <tr key={`${u.txid}:${u.vout}`} className="border-b border-mim-border last:border-0 hover:bg-mim-surface-2 transition-colors">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/explorer/tx/${u.txid}`}
                        className="text-hash font-mono text-xs hover:text-bitcoin-orange transition-colors"
                      >
                        {formatHash(u.txid, 12)}:{u.vout}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs text-mim-text">{fmt(u.amount)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href={`/explorer/block/${u.height}`}
                        className="text-xs text-mim-text-muted hover:text-bitcoin-orange transition-colors"
                      >
                        {formatNumber(u.height)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[10px] text-mim-text-dim italic">{t('addr.scanNote')}</p>
    </div>
  );
}
