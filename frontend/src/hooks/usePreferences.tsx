'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { translate, type Lang } from '@/lib/i18n';

type Theme = 'dark' | 'light';
type Currency = 'usd' | 'brl' | 'eur';

type PreferencesCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  language: Lang;
  setLanguage: (l: Lang) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const Ctx = createContext<PreferencesCtx>({
  theme: 'dark',
  setTheme: () => {},
  currency: 'usd',
  setCurrency: () => {},
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
});

function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === 'dark') {
    el.classList.add('dark');
  } else {
    el.classList.remove('dark');
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [currency, setCurrencyState] = useState<Currency>('usd');
  const [language, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const cachedTheme = localStorage.getItem('mim-theme') as Theme | null;
    if (cachedTheme === 'dark' || cachedTheme === 'light') {
      setThemeState(cachedTheme);
      applyTheme(cachedTheme);
    }

    const cachedCurrency = localStorage.getItem('mim-currency') as Currency | null;
    if (cachedCurrency === 'usd' || cachedCurrency === 'brl' || cachedCurrency === 'eur') {
      setCurrencyState(cachedCurrency);
    }

    const cachedLang = localStorage.getItem('mim-language') as Lang | null;
    if (cachedLang === 'en' || cachedLang === 'pt') {
      setLangState(cachedLang);
    }

    api<{ theme?: string; currency?: string; language?: string }>('/api/settings/preferences')
      .then((d) => {
        const t = d.theme === 'light' ? 'light' : 'dark';
        setThemeState(t);
        applyTheme(t);
        localStorage.setItem('mim-theme', t);

        const c = (d.currency ?? 'usd').toLowerCase() as Currency;
        if (c === 'usd' || c === 'brl' || c === 'eur') {
          setCurrencyState(c);
          localStorage.setItem('mim-currency', c);
        }

        const l = (d.language ?? 'en') as Lang;
        if (l === 'en' || l === 'pt') {
          setLangState(l);
          localStorage.setItem('mim-language', l);
        }
      })
      .catch(() => {});
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    localStorage.setItem('mim-theme', t);
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    localStorage.setItem('mim-currency', c);
  }, []);

  const setLanguage = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem('mim-language', l);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language],
  );

  return (
    <Ctx.Provider value={{ theme, setTheme, currency, setCurrency, language, setLanguage, t }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePreferences() {
  return useContext(Ctx);
}
