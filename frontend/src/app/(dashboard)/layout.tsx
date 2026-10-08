'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Search } from 'lucide-react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  const handleMobileClose = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

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

  const initials = (user.full_name ?? '')
    .split(' ')
    .map(n => n?.[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '??';

  return (
    <div className="flex h-screen bg-[var(--bg-primary)] overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={handleMobileClose} />

      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        <header className="h-14 flex items-center justify-between px-4 lg:px-6 border-b border-[var(--border-subtle)] bg-[var(--bg-primary)]/60 backdrop-blur-xl flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 -ml-1 rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {pageTitle && (
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] tracking-wide">
                {pageTitle}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Global search */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-[var(--border-primary)] hover:border-[var(--border-glow)]/30 transition-colors w-52 lg:w-64 cursor-text group">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors flex-shrink-0" />
              <input
                type="text"
                placeholder="Search..."
                className="bg-transparent border-none outline-none text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] w-full"
                readOnly
              />
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-[var(--text-muted)] bg-white/[0.04] border border-[var(--border-subtle)]">
                /
              </kbd>
            </div>

            <div className="w-px h-6 bg-[var(--border-subtle)] hidden sm:block" />

            <div className="text-right hidden sm:block">
              <p className="text-xs text-[var(--text-muted)]">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
            </div>

            <div className="w-px h-6 bg-[var(--border-subtle)] hidden sm:block" />

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-lg shadow-blue-500/20 ring-2 ring-white/[0.06]">
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-[var(--text-primary)] leading-tight">{user.full_name}</p>
                <p className="text-[10px] text-[var(--text-muted)] leading-tight">{user.role?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="p-4 sm:p-6 lg:p-8"
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
