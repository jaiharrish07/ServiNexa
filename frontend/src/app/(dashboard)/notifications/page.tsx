'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BellOff, CheckCheck, Check, MailOpen,
  AlertTriangle, Info, AlertCircle, Wrench, Filter,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Notification } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

function typeIcon(type: string) {
  switch ((type ?? '').toUpperCase()) {
    case 'WARNING': return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    case 'ERROR':
    case 'CRITICAL': return <AlertCircle className="w-5 h-5 text-red-400" />;
    case 'MAINTENANCE': return <Wrench className="w-5 h-5 text-blue-400" />;
    default: return <Info className="w-5 h-5 text-blue-400" />;
  }
}

const listVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
};

const ENTITY_ROUTES: Record<string, string> = {
  service_request: '/service-requests',
  work_order: '/work-orders',
  machine: '/machines',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const res = await api.get<{ notifications: Notification[] }>('/api/notifications');
      setNotifications(res?.notifications ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.is_read).length,
    [notifications]
  );

  const filtered = useMemo(
    () => filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications,
    [notifications, filter]
  );

  async function markAsRead(id: string) {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as read');
    }
  }

  async function markAllAsRead() {
    setMarkingAll(true);
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      toast.success('All notifications marked as read');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark all as read');
    } finally {
      setMarkingAll(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Notifications</h1>
          <p className="text-gray-400 text-sm mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
              : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter */}
          <div className="flex bg-[#1a1f2e] rounded-lg border border-[#2a3050] overflow-hidden">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 text-sm transition-colors flex items-center gap-1.5 ${
                filter === 'unread'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Unread
              {unreadCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500/30 rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>

          {unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={markAllAsRead}
              loading={markingAll}
            >
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<BellOff size={24} />}
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
          description={filter === 'unread' ? 'You have read all your notifications' : 'You have no notifications yet'}
        />
      ) : (
        <motion.div
          className="space-y-2"
          variants={listVariants}
          initial="hidden"
          animate="visible"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map(notification => (
              <motion.div
                key={notification.id}
                variants={itemVariants}
                exit="exit"
                layout
                className={`flex items-start gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${
                  notification.is_read
                    ? 'bg-[#111827] border-[#2a3050] hover:border-[#3a4570]'
                    : 'bg-[#111827] border-blue-500/30 hover:border-blue-500/50'
                }`}
                onClick={() => {
                  if (!notification.is_read) markAsRead(notification.id);
                  const basePath = ENTITY_ROUTES[notification.related_entity_type ?? ''];
                  if (basePath && notification.related_entity_id) {
                    router.push(`${basePath}/${notification.related_entity_id}`);
                  }
                }}
              >
                {/* Icon */}
                <div className="shrink-0 mt-0.5">{typeIcon(notification.type)}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-sm font-semibold truncate ${notification.is_read ? 'text-gray-300' : 'text-gray-100'}`}>
                      {notification.title}
                    </h3>
                    {!notification.is_read && (
                      <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />
                    )}
                  </div>
                  <p className={`text-sm mb-2 ${notification.is_read ? 'text-gray-500' : 'text-gray-400'}`}>
                    {notification.message}
                  </p>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                  </span>
                </div>

                {/* Read indicator */}
                <div className="shrink-0">
                  {notification.is_read ? (
                    <MailOpen className="w-4 h-4 text-gray-600" />
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); markAsRead(notification.id); }}
                      className="p-1 rounded hover:bg-[#2a3050] transition-colors"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4 text-blue-400" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
