'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { formatBtcValue, type BtcUnit } from '@/lib/formatters';

type BtcUnitCtx = {
  unit: BtcUnit;
  setUnit: (u: BtcUnit) => void;
  fmt: (btcAmount: number) => string;
};

const Ctx = createContext<BtcUnitCtx>({
  unit: 'BTC',
  setUnit: () => {},
  fmt: (v) => formatBtcValue(v, 'BTC'),
});

export function BtcUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<BtcUnit>('BTC');

  useEffect(() => {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('mim-btc-unit') : null;
    if (cached === 'sats' || cached === 'BTC') setUnitState(cached);

    api<{ btcUnit?: string }>('/api/settings/preferences')
      .then((d) => {
        const u = d.btcUnit === 'sats' ? 'sats' : 'BTC';
        setUnitState(u);
        localStorage.setItem('mim-btc-unit', u);
      })
      .catch(() => {});
  }, []);

  const setUnit = useCallback((u: BtcUnit) => {
    setUnitState(u);
    localStorage.setItem('mim-btc-unit', u);
  }, []);

  const fmt = useCallback((btcAmount: number) => formatBtcValue(btcAmount, unit), [unit]);

  return <Ctx.Provider value={{ unit, setUnit, fmt }}>{children}</Ctx.Provider>;
}

export function useBtcUnit() {
  return useContext(Ctx);
}
