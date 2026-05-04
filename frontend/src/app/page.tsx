'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isAuthenticated } from '@/lib/api';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      try {
        const res = await fetch(`${API_BASE}/api/setup/status`);
        const { completed } = await res.json();
        if (!completed) {
          router.replace('/setup');
        } else if (isAuthenticated()) {
          router.replace('/dashboard');
        } else {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    }
    redirect();
  }, [router]);

  return null;
}
