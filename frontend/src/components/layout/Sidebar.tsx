'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';
import { usePreferences } from '@/hooks/usePreferences';

const NAV = [
  { href: '/dashboard',    i18nKey: 'nav.dashboard',     icon: '📊' },
  { href: '/live',         i18nKey: 'nav.live',          icon: '⚡' },
  { href: '/explorer',     i18nKey: 'nav.explorer',      icon: '🔍' },
  { href: '/wallets',      i18nKey: 'nav.wallets',       icon: '💰' },
  { href: '/transactions', i18nKey: 'nav.transactions',  icon: '📤' },
  { href: '/alerts',       i18nKey: 'nav.alerts',        icon: '🔔' },
  { href: '/settings',     i18nKey: 'nav.settings',      icon: '⚙️' },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname();
  const router   = useRouter();
  const { t }    = usePreferences();

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  const sidebar = (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col bg-mim-surface border-r border-mim-border z-40">

      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-mim-border">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="MIM"
            className="w-8 h-8 rounded-lg flex-shrink-0"
          />
          <div className="leading-tight">
            <span className="font-semibold text-sm text-mim-text tracking-tight">MIM</span>
            <span className="block text-[10px] text-mim-text-dim font-mono uppercase tracking-widest">
              Dashboard
            </span>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="lg:hidden text-mim-text-muted hover:text-mim-text text-lg"
          aria-label="Close menu"
        >
          ✕
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, i18nKey, icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-100
                ${active
                  ? 'bg-bitcoin-orange/10 text-bitcoin-orange'
                  : 'text-mim-text-muted hover:bg-mim-surface-2 hover:text-mim-text'
                }
              `}
            >
              <span className="text-base w-5 text-center flex-shrink-0">{icon}</span>
              {t(i18nKey)}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 pb-4 border-t border-mim-border pt-3">
        <button
          onClick={handleLogout}
          className="
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
            text-mim-text-muted hover:bg-red-950/40 hover:text-mim-red
            transition-colors duration-100
          "
        >
          <span className="text-base w-5 text-center flex-shrink-0">🚪</span>
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop: always visible */}
      <div className="hidden lg:block">
        {sidebar}
      </div>

      {/* Mobile: drawer overlay */}
      {open && (
        <div className="lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[39] animate-fade-in"
            onClick={onClose}
          />
          {/* Drawer */}
          <div className="animate-slide-in-left">
            {sidebar}
          </div>
        </div>
      )}
    </>
  );
}
