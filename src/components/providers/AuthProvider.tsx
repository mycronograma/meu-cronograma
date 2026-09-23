'use client';

import { SessionProvider } from 'next-auth/react';
import { isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      session={isLocalDemoAuthEnabled ? null : undefined}
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}
