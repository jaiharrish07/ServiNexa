'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuth } from '@/store/auth';

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuth((s) => s.hydrate);
  const loadUser = useAuth((s) => s.loadUser);
  const token = useAuth((s) => s.token);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (token) {
      loadUser();
    }
  }, [token, loadUser]);

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1f2e',
            color: '#f1f5f9',
            border: '1px solid #2a3050',
          },
          success: {
            iconTheme: { primary: '#10b981', secondary: '#1a1f2e' },
          },
          error: {
            iconTheme: { primary: '#ef4444', secondary: '#1a1f2e' },
          },
        }}
      />
    </>
  );
}
