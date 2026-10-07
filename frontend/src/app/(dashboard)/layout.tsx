'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/store/auth';
import { Sidebar } from '@/components/layout/Sidebar';

const pageLabels: Record<string, string> = {
  '/dashboard': 'Operations Dashboard',
  '/service-requests': 'Service Requests',
  '/work-orders': 'Work Orders',
  '/machines': 'Machines',
  '/technicians': 'Technicians',
  '/sites': 'Sites',
  '/spare-parts': 'Spare Parts',
  '/ai': 'AI Insights',
  '/visual-diagnosis': '3D Visual Diagnosis',
  '/knowledge': 'Knowledge Base',
  '/bidding': 'Bidding',
  '/reports': 'Reports',
  '/notifications': 'Notifications',
  '/audit': 'Audit Log',
};

function DashboardShell({ children }: { children: React.ReactNode }) {
  const user = useAuth((s) => s.user);
  const loading = useAuth((s) => s.loading);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
          </div>
          <p className="text-sm text-[var(--text-muted)] font-medium tracking-wide">Loading ServiNexa...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const basePath = '/' + (pathname.split('/')[1] ?? '');
  const pageTitle = pageLabels[basePath] ?? '';

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="orb orb-blue w-[500px] h-[500px] -top-32 -left-32" />
        <div className="orb orb-purple w-[400px] h-[400px] top-1/2 right-0" />
        <div className="orb orb-cyan w-[350px] h-[350px] bottom-0 left-1/3" />
      </div>

      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-14 flex items-center justify-between px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            {pageTitle && (
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] tracking-wide">
                {pageTitle}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-[var(--text-muted)]">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>
            <div className="w-px h-6 bg-[var(--border-subtle)]" />
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-blue-500/20">
                {(user.full_name ?? '')
                  .split(' ')
                  .map(n => n?.[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || '??'}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-[var(--text-primary)]">{user.full_name}</p>
                <p className="text-[10px] text-[var(--text-muted)]">{user.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="p-6 lg:p-8"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-[var(--bg-primary)]">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-blue-500 animate-spin" />
            </div>
            <p className="text-sm text-[var(--text-muted)] font-medium tracking-wide">Loading ServiNexa...</p>
          </div>
        </div>
      }
    >
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
