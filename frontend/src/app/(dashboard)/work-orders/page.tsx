'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Plus, Search, ChevronDown, ChevronUp,
  Calendar, User, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { WorkOrder, Technician } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

const priorityVariant: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warning',
  LOW: 'info',
};

const statusVariant: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'default'> = {
  PENDING: 'info',
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
};

export default function WorkOrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    service_request_id: '',
    assigned_technician_id: '',
    description: '',
    priority: 'MEDIUM',
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [ordersRes, techRes] = await Promise.all([
        api.get<{ work_orders: WorkOrder[] }>('/api/work-orders'),
        api.get<{ technicians: Technician[] }>('/api/technicians'),
      ]);
      setOrders(ordersRes?.work_orders ?? []);
      setTechnicians(techRes?.technicians ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load work orders');
    } finally {
      setLoading(false);
    }
  }

  const filtered = search.trim()
    ? orders.filter(o =>
        o.order_number.toLowerCase().includes(search.toLowerCase()) ||
        (o.description || '').toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/work-orders', {
        service_request_id: form.service_request_id,
        technician_id: form.assigned_technician_id,
        description: form.description || undefined,
        priority: form.priority,
      });
      toast.success('Work order created');
      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create work order');
    } finally {
      setSubmitting(false);
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
          <h1 className="text-2xl font-bold text-gray-100">Work Orders</h1>
          <p className="text-gray-400 text-sm mt-1">{orders.length} work orders</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {canManage && (
            <Button onClick={() => { setForm({ service_request_id: '', assigned_technician_id: '', description: '', priority: 'MEDIUM' }); setShowModal(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Create Order
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="No work orders found"
          description={search ? 'Try a different search term' : 'No work orders have been created yet'}
          action={canManage ? { label: 'Create Order', onClick: () => setShowModal(true) } : undefined}
        />
      ) : (
        <div className="bg-[#111827] border border-[#2a3050] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden md:grid grid-cols-[1fr_2fr_100px_100px_140px_120px_40px] gap-4 px-5 py-3 border-b border-[#2a3050] text-xs text-gray-400 font-medium uppercase tracking-wider">
            <span>Order #</span>
            <span>Description</span>
            <span>Priority</span>
            <span>Status</span>
            <span>Technician</span>
            <span>Created</span>
            <span />
          </div>

          {/* Rows */}
          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {filtered.map(order => {
              const isExpanded = expandedId === order.id;
              return (
                <motion.div key={order.id} variants={rowVariants} layout>
                  <div
                    className="grid grid-cols-1 md:grid-cols-[1fr_2fr_100px_100px_140px_120px_40px] gap-2 md:gap-4 px-5 py-4 border-b border-[#2a3050] hover:bg-[#1a1f2e] cursor-pointer transition-colors items-center"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  >
                    <span className="text-sm font-mono text-blue-400">{order.order_number ?? ''}</span>
                    <span className="text-sm text-gray-300 truncate">{order.description || '--'}</span>
                    <div>
                      <Badge variant={priorityVariant[order.service_requests?.priority ?? ''] || 'default'}>
                        {order.service_requests?.priority ?? '--'}
                      </Badge>
                    </div>
                    <div>
                      <Badge variant={statusVariant[order.status ?? ''] || 'default'}>
                        {(order.status ?? '').replace('_', ' ')}
                      </Badge>
                    </div>
                    <span className="text-sm text-gray-400 truncate">
                      {order.technicians?.users?.full_name ?? order.technicians?.employee_code ?? '--'}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()}
                    </span>
                    <div className="hidden md:block">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden bg-[#0f1320]"
                      >
                        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <ClipboardList className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-400">Service Request:</span>
                            <span className="text-gray-200 text-xs">{order.service_requests?.request_number ?? '--'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-400">Assigned To:</span>
                            <span className="text-gray-200 text-xs">{order.technicians?.users?.full_name ?? order.technicians?.employee_code ?? '--'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-400">Created:</span>
                            <span className="text-gray-200">{new Date(order.created_at).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-400">Priority:</span>
                            <span className="text-gray-200">{order.service_requests?.priority ?? '--'}</span>
                          </div>
                          {order.notes && (
                            <div className="col-span-full">
                              <span className="text-gray-400">Notes: </span>
                              <span className="text-gray-200">{order.notes}</span>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* Create Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Create Work Order">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Service Request ID</label>
            <input
              required
              value={form.service_request_id}
              onChange={e => setForm(f => ({ ...f, service_request_id: e.target.value }))}
              placeholder="UUID of the service request"
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Assigned Technician</label>
            <select
              required
              value={form.assigned_technician_id}
              onChange={e => setForm(f => ({ ...f, assigned_technician_id: e.target.value }))}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Select technician</option>
              {technicians.filter(t => t.is_available).map(t => (
                <option key={t.id} value={t.id}>
                  {t.users?.full_name || t.employee_code} ({t.current_job_count}/{t.max_concurrent_jobs})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Priority</label>
            <select
              value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
