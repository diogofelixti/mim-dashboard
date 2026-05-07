'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

const STEPS = [
  {
    icon: '₿',
    title: 'Welcome to MIM Dashboard',
    description:
      'Your Bitcoin node, fully visualized. MIM gives you real-time monitoring, a block explorer, wallet management, and advanced transaction tools — all in one place.',
    hint: 'This quick tour will show you around. Takes about 30 seconds.',
  },
  {
    icon: '⚡',
    title: 'Real-Time Monitoring',
    description:
      'The Dashboard shows your node\'s sync status, peer connections, mempool usage, and fee trends — all updating live. The health semaphore in the header tells you at a glance if something needs attention.',
    hint: 'Dashboard + Live Feed',
  },
  {
    icon: '🔍',
    title: 'Block Explorer',
    description:
      'Browse blocks, search by height, hash, or txid. Every transaction page shows inputs, outputs, and fee details. You can also add personal notes to any transaction for your own records.',
    hint: 'Explorer + TX Notes',
  },
  {
    icon: '🔐',
    title: 'Wallet Management',
    description:
      'Create, load, and manage multiple wallets. Use Coin Control to hand-pick UTXOs for spending. Lock outputs to protect them, backup wallet files, and generate addresses — all without the command line.',
    hint: 'Wallets + Coin Control',
  },
  {
    icon: '📝',
    title: 'Transactions & PSBT',
    description:
      'Send BTC directly or use the PSBT Wizard for hardware wallets and multisig setups. The wizard walks you through create, sign, combine, finalize, and broadcast — step by step.',
    hint: 'Transactions + PSBT Wizard',
  },
];

export default function OnboardingWizard() {
  const router = useRouter();
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

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

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
          {STEPS.map((_, i) => (
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
            {current.title}
          </h2>

          <p className="text-sm text-mim-text-muted leading-relaxed">
            {current.description}
          </p>

          <p className="text-[10px] font-semibold uppercase tracking-widest text-bitcoin-orange/70">
            {current.hint}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between px-8 pb-6">
          {step === 0 ? (
            <button
              onClick={skip}
              className="text-xs text-mim-text-dim hover:text-mim-text transition-colors"
            >
              Skip tour
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-xs text-mim-text-muted hover:text-mim-text transition-colors"
            >
              ← Back
            </button>
          )}

          {isLast ? (
            <button
              onClick={() => { finish(); router.push('/dashboard'); }}
              className="px-5 py-2.5 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark transition-colors"
            >
              Get Started
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="px-5 py-2.5 rounded-lg bg-bitcoin-orange text-black text-sm font-semibold hover:bg-bitcoin-orange-dark transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
