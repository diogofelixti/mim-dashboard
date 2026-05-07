'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '@/lib/api';

const NAV = [
  { href: '/dashboard',    label: 'Dashboard',    icon: '📊' },
  { href: '/live',         label: 'Live Feed',    icon: '⚡' },
  { href: '/explorer',     label: 'Explorer',     icon: '🔍' },
  { href: '/wallets',      label: 'Wallets',      icon: '💰' },
  { href: '/transactions', label: 'Transactions', icon: '📤' },
  { href: '/alerts',       label: 'Alerts',       icon: '🔔' },
  { href: '/settings',     label: 'Settings',     icon: '⚙️' },
];

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function Sidebar({ open, onClose }: Props) {
  const pathname = usePathname();
  const router   = useRouter();

  function handleLogout() {
    clearToken();
    router.replace('/login');
  }

  const sidebar = (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col bg-mim-surface border-r border-mim-border z-40">

      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-mim-border">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              background: 'rgba(247,147,26,0.12)',
              border: '1px solid rgba(247,147,26,0.35)',
            }}
          >
            <span className="text-bitcoin-orange font-bold text-base leading-none">₿</span>
          </div>
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
        {NAV.map(({ href, label, icon }) => {
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
              {label}
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
          Logout
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
