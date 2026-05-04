'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/api/setup/status`)
      .then((r) => r.json())
      .then(({ completed }) => { if (!completed) router.replace('/setup'); })
      .catch(() => {});
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-mim-bg">

      {/* Grid de fundo */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(#F7931A 1px, transparent 1px),
            linear-gradient(to right, #F7931A 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />

      {/* Glow circular central */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: '600px',
          height: '600px',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(247,147,26,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-sm px-6 animate-fade-in">

        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 glow-orange"
            style={{
              background: 'linear-gradient(135deg, #1A1A25 0%, #12121A 100%)',
              border: '1px solid rgba(247,147,26,0.4)',
            }}
          >
            <span className="text-4xl font-bold text-bitcoin-orange select-none">
              ₿
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-mim-text tracking-tight">
            MIM-Dashboard
          </h1>
          <p className="text-sm text-mim-text-muted mt-1 font-mono tracking-widest uppercase">
            Magic Internet Money
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-mim-text-muted mb-2 uppercase tracking-widest">
              Node Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              autoFocus
              required
              className="
                w-full px-4 py-3 rounded-lg font-mono text-sm
                bg-mim-surface border border-mim-border
                text-mim-text placeholder-mim-text-dim
                focus:outline-none focus:border-bitcoin-orange focus:ring-1 focus:ring-bitcoin-orange
                transition-colors duration-150
              "
            />
          </div>

          {/* Error */}
          {error && (
            <div className="animate-fade-in text-xs text-mim-red bg-red-950/40 border border-red-900/50 rounded-lg px-4 py-3 font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="
              w-full py-3 px-4 rounded-lg font-semibold text-sm
              bg-bitcoin-orange text-black
              hover:bg-bitcoin-orange-dark
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-150
              glow-orange-sm
              flex items-center justify-center gap-2
            "
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12" cy="12" r="10"
                    stroke="currentColor" strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                Verifying…
              </>
            ) : (
              'Unlock Dashboard'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-xs text-mim-text-dim mt-10 font-mono">
          Don&apos;t trust, verify. 🧙‍♂️
        </p>
      </div>
    </div>
  );
}
