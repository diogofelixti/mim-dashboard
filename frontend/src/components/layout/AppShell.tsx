'use client';

import { useState } from 'react';
import Sidebar from './Sidebar';
import Header  from './Header';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { BtcUnitProvider } from '@/hooks/useBtcUnit';
import { PreferencesProvider } from '@/hooks/usePreferences';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <PreferencesProvider>
    <BtcUnitProvider>
      <div className="min-h-screen bg-mim-bg">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="lg:ml-56 mt-14 p-4 sm:p-6 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
        <OnboardingWizard />
      </div>
    </BtcUnitProvider>
    </PreferencesProvider>
  );
}
