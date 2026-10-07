'use client';

import { useEffect, useState } from 'react';
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
  ChevronLeft,
  ChevronRight,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { api } from '@/lib/api';

const allNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN', 'CUSTOMER'] },
  { href: '/service-requests', label: 'Service Requests', icon: ClipboardList, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN', 'CUSTOMER'] },
  { href: '/work-orders', label: 'Work Orders', icon: Wrench, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
  { href: '/machines', label: 'Machines', icon: Cog, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
  { href: '/technicians', label: 'Technicians', icon: Users, roles: ['ADMIN', 'OPS_MANAGER'] },
  { href: '/sites', label: 'Sites', icon: MapPin, roles: ['ADMIN', 'OPS_MANAGER'] },
  { href: '/spare-parts', label: 'Spare Parts', icon: Package, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
  { href: '/ai', label: 'AI Insights', icon: Brain, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
  { href: '/knowledge', label: 'Knowledge Base', icon: BookOpen, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN'] },
  { href: '/bidding', label: 'Bidding', icon: Gavel, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN', 'CUSTOMER'] },
  { href: '/reports', label: 'Reports', icon: BarChart3, roles: ['ADMIN', 'OPS_MANAGER'] },
  { href: '/notifications', label: 'Notifications', icon: Bell, roles: ['ADMIN', 'OPS_MANAGER', 'TECHNICIAN', 'CUSTOMER'] },
  { href: '/audit', label: 'Audit Log', icon: Shield, roles: ['ADMIN'] },
];

const roleColors: Record<string, string> = {
  ADMIN: 'bg-red-500/20 text-red-400 border-red-500/30',
  OPS_MANAGER: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  TECHNICIAN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CUSTOMER: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const roleLabels: Record<string, string> = {
  ADMIN: 'Admin',
  OPS_MANAGER: 'Ops Manager',
  TECHNICIAN: 'Technician',
  CUSTOMER: 'Customer',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const navItems = allNavItems.filter((item) => item.roles.includes(user?.role ?? ''));

  useEffect(() => {
    const token = api.getToken();
    if (!token) return;
    let cancelled = false;
    api
      .get<{ unread_count?: number }>('/api/notifications/unread-count')
      .then((data) => {
        if (!cancelled) setUnreadCount(data?.unread_count ?? 0);
      })
      .catch(() => {
        /* notification count is non-critical */
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const sidebarWidth = collapsed ? 'w-[72px]' : 'w-[260px]';

  return (
    <motion.aside
      layout
      className={`${sidebarWidth} flex flex-col h-screen sticky top-0 bg-[#0d1117]/95 backdrop-blur-xl border-r border-white/[0.06] transition-[width] duration-300 ease-in-out z-40`}
    >
      {/* Brand */}
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/[0.06]">
        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <Cog className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-lg font-bold gradient-text tracking-tight">
                ServiNexa
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {collapsed && (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto">
            <Cog className="w-4.5 h-4.5 text-white" />
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`p-1.5 rounded-md hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ${
            collapsed ? 'hidden' : ''
          }`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          const isNotifications = item.href === '/notifications';

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-white/[0.04]'
              }`}
              title={collapsed ? item.label : undefined}
            >
              {/* Active accent bar */}
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full bg-blue-500"
                  transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                />
              )}

              <div className="relative flex-shrink-0">
                <Icon
                  className={`w-[18px] h-[18px] ${
                    isActive
                      ? 'text-blue-400'
                      : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'
                  }`}
                />
                {/* Notification badge on icon */}
                {isNotifications && unreadCount > 0 && collapsed && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
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
                    transition={{ duration: 0.2 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>

              {/* Notification badge inline */}
              {isNotifications && unreadCount > 0 && !collapsed && (
                <span className="ml-auto min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}

              {/* Collapsed tooltip */}
              {collapsed && (
                <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-md bg-[#1a1f2e] border border-[var(--border-primary)] text-xs text-[var(--text-primary)] whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                  {item.label}
                  {isNotifications && unreadCount > 0 && (
                    <span className="ml-1.5 text-red-400">({unreadCount})</span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="px-2 pb-2">
          <button
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* User profile card */}
      <div className="border-t border-white/[0.06] p-3">
        {user ? (
          <div
            className={`flex items-center ${
              collapsed ? 'justify-center' : 'gap-3'
            }`}
          >
            <div className="relative flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-sm font-semibold text-white">
                {(user?.full_name ?? '')
                  .split(' ')
                  .map((n) => n?.[0] ?? '')
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || '??'}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#0d1117]" />
            </div>

            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
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
                className="p-1.5 rounded-md hover:bg-white/[0.06] text-[var(--text-muted)] hover:text-red-400 transition-colors flex-shrink-0"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <div className="w-9 h-9 rounded-full bg-white/[0.06] animate-pulse" />
          </div>
        )}
      </div>
    </motion.aside>
  );
}
