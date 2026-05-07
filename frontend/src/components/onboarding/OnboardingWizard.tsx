'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePreferences } from '@/hooks/usePreferences';

const STEP_KEYS = [
  { icon: '₿',  titleKey: 'onboarding.welcome.title', descKey: 'onboarding.welcome.desc', hintKey: 'onboarding.welcome.hint' },
  { icon: '⚡', titleKey: 'onboarding.monitor.title', descKey: 'onboarding.monitor.desc', hintKey: 'onboarding.monitor.hint' },
  { icon: '🔍', titleKey: 'onboarding.explore.title', descKey: 'onboarding.explore.desc', hintKey: 'onboarding.explore.hint' },
  { icon: '🔐', titleKey: 'onboarding.manage.title',  descKey: 'onboarding.manage.desc',  hintKey: 'onboarding.manage.hint' },
  { icon: '📝', titleKey: 'onboarding.tx.title',      descKey: 'onboarding.tx.desc',      hintKey: 'onboarding.tx.hint' },
];

export default function OnboardingWizard() {
  const router = useRouter();
  const { t } = usePreferences();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    api<{ completed: boolean }>('/api/settings/onboarding')
      .then((d) => { if (!d.completed) setVisible(true); })
      .catch(() => {});
  }, []);

  async function finish() {
    setClosing(true);
    try {
      await api('/api/settings/onboarding/complete', { method: 'POST' });
    } catch {}
    setTimeout(() => setVisible(false), 300);
  }

  async function skip() {
    await finish();
  }

  if (!visible) return null;

  const current = STEP_KEYS[step];
  const isLast = step === STEP_KEYS.length - 1;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${
        closing ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className={`bg-mim-surface border border-mim-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden transition-transform duration-300 ${
          closing ? 'scale-95' : 'scale-100'
        }`}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 pt-6 pb-2">
          {STEP_KEYS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i === step
                  ? 'w-6 bg-bitcoin-orange'
                  : i < step
                    ? 'w-3 bg-bitcoin-orange/40'
                    : 'w-3 bg-mim-border'
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-8 py-6 text-center space-y-4">
          <div className="text-4xl">{current.icon}</div>

          <h2 className="text-lg font-bold text-mim-text">
            {t(current.titleKey)}
          </h2>

          <p className="text-sm text-mim-text-muted leading-relaxed">
            {t(current.descKey)}
          </p>

          <p className="text-[10px] font-semibold uppercase tracking-widest text-bitcoin-orange/70">
            {t(current.hintKey)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-8 pb-6">
          {step === 0 ? (
            <button
              onClick={skip}
              className="text-xs text-mim-text-dim hover:text-mim-text transition-colors"
            >
              {t('onboarding.skip')}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-xs text-mim-text-muted hover:text-mim-text transition-colors"
            >
              {t('onboarding.back')}
            </button>
          )}

          {isLast ? (
            <button
              onClick={() => { finish(); router.push('/dashboard'); }}
              className="px-5 py-2.5 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark transition-colors"
            >
              {t('onboarding.start')}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-5 py-2.5 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark transition-colors"
            >
              {t('onboarding.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
