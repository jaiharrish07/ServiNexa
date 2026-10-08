'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  ClipboardList,
  Wrench,
  Cog,
  Users,
  MapPin,
  Package,
  Brain,
  BookOpen,
  Gavel,
  BarChart3,
  Bell,
  Shield,
  Eye,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Hexagon,
  X,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';
import { useRealtimeRefresh } from '@/hooks/useWebSocket';

type NavItem = { href: string; label: string; icon: any; roles?: string[] };

type NavSection = {
  label: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/service-requests', label: 'Service Requests', icon: ClipboardList },
      { href: '/work-orders', label: 'Work Orders', icon: Wrench, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
    ],
  },
  {
    label: 'Assets',
    items: [
      { href: '/machines', label: 'Machines', icon: Cog, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
      { href: '/sites', label: 'Sites', icon: MapPin, roles: ['ADMIN', 'OPS_MANAGER'] },
      { href: '/spare-parts', label: 'Spare Parts', icon: Package, roles: ['ADMIN', 'OPS_MANAGER'] },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/ai', label: 'AI Insights', icon: Brain, roles: ['ADMIN', 'OPS_MANAGER'] },
      { href: '/visual-diagnosis', label: '3D Diagnosis', icon: Eye, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
      { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen },
    ],
  },
  {
    label: 'Management',
    items: [
      { href: '/bidding', label: 'Bidding', icon: Gavel, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
      { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'OPS_MANAGER'] },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/audit', label: 'Audit Log', icon: Shield, roles: ['ADMIN'] },
    ],
  },
];

const roleColors: Record<string, string> = {
  ADMIN: 'bg-red-500/15 text-red-400 border-red-500/25',
  OPS_MANAGER: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  TECHNICIAN: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  CUSTOMER: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  OPS_MANAGER: 'Ops Manager',
  TECHNICIAN: 'Technician',
  CUSTOMER: 'Customer',
};

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(() => {
    const token = api.getToken();
    if (!token) return;
    api
      .get<{ unread_count?: number }>('/api/notifications/unread-count')
      .then((data) => setUnreadCount(data?.unread_count ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchUnreadCount();
  }, [user, fetchUnreadCount]);

  // Refresh unread count when a notification arrives via WebSocket
  useRealtimeRefresh('notification', fetchUnreadCount);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (mobileOpen && onMobileClose) {
      onMobileClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-[260px]';

  const sidebarContent = (
    <aside
      className={`${sidebarWidth} flex flex-col h-screen bg-[var(--bg-primary)]/80 backdrop-blur-2xl border-r border-[var(--border-primary)] transition-[width] duration-300 ease-in-out z-40`}
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--border-subtle)] flex-shrink-0">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2.5"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Hexagon className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <span className="text-lg font-bold gradient-text tracking-tight block leading-tight">
                  ServiNexa
                </span>
                <span className="text-[9px] font-medium text-[var(--text-muted)] tracking-[0.15em] uppercase">
                  CMMS Platform
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/25">
            <Hexagon className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`p-1.5 rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ${collapsed ? 'hidden' : ''}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2.5 scrollbar-thin">
        {navSections.map((section, sectionIdx) => {
          const visibleItems = section.items.filter(
            (item) => !item.roles || (user?.role && item.roles.includes(user.role))
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label}>
              {/* Section divider (skip first section) */}
              {sectionIdx > 0 && (
                <div className="mx-3 my-2 h-px bg-[var(--border-subtle)]" />
              )}

              {/* Section label */}
              {!collapsed && (
                <div className="px-3 pt-2.5 pb-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]/60">
                    {section.label}
                  </span>
                </div>
              )}
              {collapsed && sectionIdx > 0 && (
                <div className="my-1" />
              )}

              {/* Nav items */}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  const isNotifications = item.href === '/notifications';

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? 'bg-blue-500/[0.08] text-blue-400'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-gradient-to-b from-blue-400 to-blue-600"
                          transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        />
                      )}

                      <div className="relative flex-shrink-0">
                        <Icon
                          className={`w-[18px] h-[18px] transition-colors ${
                            isActive
                              ? 'text-blue-400'
                              : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                          }`}
                        />
                        {isNotifications && unreadCount > 0 && collapsed && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                      </div>

                      <AnimatePresence mode="wait">
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.15 }}
                            className="whitespace-nowrap overflow-hidden"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {isNotifications && unreadCount > 0 && !collapsed && (
                        <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500/90 text-[11px] font-bold text-white shadow-sm shadow-red-500/30">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}

                      {collapsed && (
                        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-primary)] text-xs text-[var(--text-primary)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-[60] shadow-xl backdrop-blur-xl">
                          {item.label}
                          {isNotifications && unreadCount > 0 && (
                            <span className="ml-1.5 text-red-400">({unreadCount})</span>
                          )}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="px-2 pb-2">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-white/[0.04] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* User profile card */}
      <div className="border-t border-[var(--border-subtle)] p-3 flex-shrink-0">
        {user ? (
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white shadow-lg shadow-blue-500/20">
                {(user?.full_name ?? '')
                  .split(' ')
                  .map((n) => n?.[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || '??'}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--bg-primary)] shadow-sm shadow-emerald-500/40" />
            </div>

            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 min-w-0 overflow-hidden"
                >
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                    {user?.full_name ?? 'User'}
                  </p>
                  <span
                    className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                      roleColors[user?.role ?? ''] || 'bg-white/10 text-white/60'
                    }`}
                  >
                    {roleLabels[user?.role ?? ''] || user?.role || 'Unknown'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {!collapsed && (
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg hover:bg-red-500/[0.08] text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-white/[0.04] animate-pulse" />
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar - hidden below lg */}
      <div className="hidden lg:block flex-shrink-0">
        {sidebarContent}
      </div>

      {/* Mobile overlay sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] lg:hidden"
              onClick={onMobileClose}
            />
            {/* Sidebar drawer */}
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
              className="fixed inset-y-0 left-0 z-[60] lg:hidden"
            >
              <div className="relative">
                {/* Force expanded state on mobile */}
                <aside className="w-[260px] flex flex-col h-screen bg-[var(--bg-primary)] border-r border-[var(--border-primary)]">
                  {/* Brand with close button */}
                  <div className="flex items-center justify-between px-4 h-16 border-b border-[var(--border-subtle)] flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                        <Hexagon className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
                      </div>
                      <div>
                        <span className="text-lg font-bold gradient-text tracking-tight block leading-tight">
                          ServiNexa
                        </span>
                        <span className="text-[9px] font-medium text-[var(--text-muted)] tracking-[0.15em] uppercase">
                          CMMS Platform
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={onMobileClose}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      aria-label="Close sidebar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Navigation (always expanded in mobile) */}
                  <nav className="flex-1 overflow-y-auto py-2 px-2.5">
                    {navSections.map((section, sectionIdx) => {
                      const visibleItems = section.items.filter(
                        (item) => !item.roles || (user?.role && item.roles.includes(user.role))
                      );
                      if (visibleItems.length === 0) return null;

                      return (
                        <div key={section.label}>
                          {sectionIdx > 0 && (
                            <div className="mx-3 my-2 h-px bg-[var(--border-subtle)]" />
                          )}
                          <div className="px-3 pt-2.5 pb-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]/60">
                              {section.label}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {visibleItems.map((item) => {
                              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                              const Icon = item.icon;
                              const isNotifications = item.href === '/notifications';

                              return (
                                <Link
                                  key={item.href}
                                  href={item.href}
                                  onClick={onMobileClose}
                                  className={`group relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                                    isActive
                                      ? 'bg-blue-500/[0.08] text-blue-400'
                                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.03]'
                                  }`}
                                >
                                  {isActive && (
                                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 rounded-r-full bg-gradient-to-b from-blue-400 to-blue-600" />
                                  )}
                                  <Icon
                                    className={`w-[18px] h-[18px] ${
                                      isActive ? 'text-blue-400' : 'text-[var(--text-muted)]'
                                    }`}
                                  />
                                  <span>{item.label}</span>
                                  {isNotifications && unreadCount > 0 && (
                                    <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500/90 text-[11px] font-bold text-white">
                                      {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                  )}
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </nav>

                  {/* User profile card (mobile) */}
                  <div className="border-t border-[var(--border-subtle)] p-3 flex-shrink-0">
                    {user && (
                      <div className="flex items-center gap-3">
                        <div className="relative flex-shrink-0">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white">
                            {(user?.full_name ?? '')
                              .split(' ')
                              .map((n) => n?.[0] ?? '')
                              .join('')
                              .slice(0, 2)
                              .toUpperCase() || '??'}
                          </div>
                          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[var(--bg-primary)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {user?.full_name ?? 'User'}
                          </p>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                              roleColors[user?.role ?? ''] || 'bg-white/10 text-white/60'
                            }`}
                          >
                            {roleLabels[user?.role ?? ''] || user?.role || 'Unknown'}
                          </span>
                        </div>
                        <button
                          onClick={handleLogout}
                          className="p-1.5 rounded-lg hover:bg-red-500/[0.08] text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                          title="Sign out"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
