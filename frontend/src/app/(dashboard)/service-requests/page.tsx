'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  Wrench,
  ClipboardList,
  Brain,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useRealtimeRefresh } from '@/hooks/useWebSocket';
import type { ServiceRequest, Site, Machine } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STATUS_OPTIONS = [
  'ALL',
  'DRAFT',
  'SUBMITTED',
  'VALIDATING',
  'PENDING_APPROVAL',
  'APPROVED',
  'ASSIGNED',
  'BIDDING',
  'BID_REVIEW',
  'BID_ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
  'EXCEPTION',
] as const;

// Simplified status options for customers
const CUSTOMER_STATUS_OPTIONS = [
  'ALL',
  'SUBMITTED',
  'PENDING_APPROVAL',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
] as const;

const PRIORITY_OPTIONS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

const CATEGORIES = [
  'MECHANICAL',
  'ELECTRICAL',
  'HYDRAULIC',
  'PNEUMATIC',
  'SOFTWARE',
  'OTHER',
] as const;

const statusBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  if (['COMPLETED', 'VERIFIED'].includes(status)) return 'success';
  if (['VALIDATING', 'PENDING_APPROVAL'].includes(status)) return 'warning';
  if (['EXCEPTION'].includes(status)) return 'danger';
  if (['SUBMITTED', 'APPROVED', 'ASSIGNED'].includes(status)) return 'info';
  if (['BIDDING', 'BID_REVIEW', 'BID_ACCEPTED', 'IN_PROGRESS'].includes(status)) return 'info';
  return 'default';
};

const priorityBadgeVariant = (priority: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  if (priority === 'CRITICAL') return 'danger';
  if (priority === 'HIGH') return 'warning';
  if (priority === 'MEDIUM') return 'info';
  if (priority === 'LOW') return 'success';
  return 'default';
};

const CAN_CREATE_ROLES = ['ADMIN', 'OPS_MANAGER', 'CUSTOMER'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface PaginatedResponse {
  service_requests: ServiceRequest[];
  meta: { page: number; limit: number; total: number };
}

interface NewRequestForm {
  title: string;
  description: string;
  category: string;
  priority: string;
  site_id: string;
  machine_id: string;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ServiceRequestsPage() {
  const router = useRouter();
  const { user } = useAuth();

  // Data state
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const limit = 20;

  // Filter state
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');

  // Modal / form state
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [form, setForm] = useState<NewRequestForm>({
    title: '',
    description: '',
    category: 'MECHANICAL',
    priority: 'MEDIUM',
    site_id: '',
    machine_id: '',
  });

  const [aiSuggesting, setAiSuggesting] = useState(false);

  const canCreate = user && CAN_CREATE_ROLES.includes(user.role);
  const isCustomer = user?.role === 'CUSTOMER';

  const autoClassify = async () => {
    if (!form.title && !form.description) {
      toast.error('Enter a title or description first');
      return;
    }
    setAiSuggesting(true);
    try {
      const res = await api.post<{ category?: string; priority?: string; confidence?: number; source?: string }>('/api/ai/classify', {
        description: `${form.title}. ${form.description}`,
      });
      if (res?.category) setForm(f => ({ ...f, category: res.category! }));
      if (res?.priority) setForm(f => ({ ...f, priority: res.priority! }));
      toast.success(`AI suggested: ${res?.category} / ${res?.priority} (${Math.round((res?.confidence ?? 0) * 100)}% confidence)`);
    } catch {
      toast.error('AI classification failed');
    } finally {
      setAiSuggesting(false);
    }
  };

  // ---- Fetch requests ----
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      let path = `/api/service-requests?page=${page}&limit=${limit}`;
      if (statusFilter !== 'ALL') path += `&status=${statusFilter}`;
      if (priorityFilter !== 'ALL') path += `&priority=${priorityFilter}`;
      if (searchQuery.trim()) path += `&search=${encodeURIComponent(searchQuery.trim())}`;
      const res = await api.get<PaginatedResponse>(path);
      setRequests(res?.service_requests ?? []);
      setTotal(res?.meta?.total ?? 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load service requests';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, priorityFilter, searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Refresh list when a service request changes via WebSocket
  useRealtimeRefresh('sr_update', fetchRequests);

  // ---- Fetch sites (on modal open) ----
  useEffect(() => {
    if (!showModal) return;
    api.get<{ sites: Site[] }>('/api/sites')
      .then((res) => setSites(res?.sites ?? []))
      .catch(() => toast.error('Failed to load sites'));
  }, [showModal]);

  // ---- Fetch machines when site changes ----
  useEffect(() => {
    if (!form.site_id) {
      setMachines([]);
      return;
    }
    api.get<{ machines: Machine[] }>(`/api/machines?site_id=${form.site_id}`)
      .then((res) => setMachines(res?.machines ?? []))
      .catch(() => toast.error('Failed to load machines'));
  }, [form.site_id]);

  // ---- Submit new request ----
  const handleSubmit = async () => {
    if (!form.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/service-requests', {
        title: form.title,
        description: form.description,
        category: form.category,
        priority: form.priority,
        site_id: form.site_id || undefined,
        machine_id: form.machine_id || undefined,
      });
      toast.success('Service request created');
      setShowModal(false);
      setForm({ title: '', description: '', category: 'MECHANICAL', priority: 'MEDIUM', site_id: '', machine_id: '' });
      setPage(1);
      fetchRequests();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create request';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Pagination ----
  const totalPages = Math.ceil(total / limit) || 1;

  // ---- Filtered display text ----
  const resultsText = useMemo(() => {
    const from = (page - 1) * limit + 1;
    const to = Math.min(page * limit, total);
    return total > 0 ? `${from}-${to} of ${total}` : '0 results';
  }, [page, total]);

  // ---- Animation ----
  const listContainer = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
  const listItem = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
  };

  // ---- Render helpers ----
  const selectClasses =
    'bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)]';

  const inputClasses =
    'w-full bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)] placeholder:text-[var(--text-muted)]';

  return (
    <div className="space-y-6">
      {/* ---- Header ---- */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-3xl font-bold gradient-text">Service Requests</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            {isCustomer ? 'Track your service requests' : 'Manage and track all service requests'}
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => setShowModal(true)}
            className={isCustomer ? 'px-6 py-3 text-base shadow-lg shadow-blue-500/20' : ''}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </Button>
        )}
      </motion.div>

      {/* ---- Filters ---- */}
      <motion.div
        className="glass-card p-4 flex flex-wrap items-center gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className={`${inputClasses} pl-9`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className={selectClasses}
        >
          {(isCustomer ? CUSTOMER_STATUS_OPTIONS : STATUS_OPTIONS).map((s) => (
            <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value); setPage(1); }}
          className={selectClasses}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>{p === 'ALL' ? 'All Priorities' : p}</option>
          ))}
        </select>

        {/* View toggle */}
        <div className="flex items-center gap-1 border border-[var(--border-primary)] rounded-lg overflow-hidden">
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 transition ${viewMode === 'table' ? 'bg-[var(--accent-blue)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`p-2 transition ${viewMode === 'card' ? 'bg-[var(--accent-blue)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </motion.div>

      {/* ---- Content ---- */}
      {loading ? (
        <div className="flex justify-center py-20"><LoadingSpinner /></div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={24} />}
          title="No service requests found"
          description="Adjust your filters or create a new request."
          action={canCreate ? { label: 'New Request', onClick: () => setShowModal(true) } : undefined}
        />
      ) : viewMode === 'table' ? (
        /* ---- Table View ---- */
        <motion.div
          className="glass-card overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-primary)]">
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Request #</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Title</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Priority</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Machine</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Technician</th>
                  <th className="text-left px-4 py-3 text-[var(--text-muted)] font-medium">Created</th>
                </tr>
              </thead>
              <motion.tbody variants={listContainer} initial="hidden" animate="show">
                {requests.map((sr) => (
                  <motion.tr
                    key={sr.id}
                    variants={listItem}
                    onClick={() => router.push(`/service-requests/${sr.id}`)}
                    className="border-b border-[var(--border-primary)] hover:bg-[var(--bg-card-hover)] cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-mono text-[var(--accent-blue)]">{sr.request_number}</td>
                    <td className="px-4 py-3 text-[var(--text-primary)] max-w-[220px] truncate">{sr.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant={priorityBadgeVariant(sr.priority)}>{sr.priority}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusBadgeVariant(sr.status ?? '')}>{(sr.status ?? '').replace(/_/g, ' ')}</Badge>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {sr.machines?.name ?? sr.machines?.code ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {sr.technician?.users?.full_name ?? sr.technician?.employee_code ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {sr.created_at ? format(new Date(sr.created_at), 'dd MMM yyyy') : '-'}
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        /* ---- Card View ---- */
        <motion.div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          variants={listContainer}
          initial="hidden"
          animate="show"
        >
          {requests.map((sr) => (
            <motion.div
              key={sr.id}
              variants={listItem}
              onClick={() => router.push(`/service-requests/${sr.id}`)}
              className="glass-card p-5 cursor-pointer hover:border-[var(--border-glow)] transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="font-mono text-sm text-[var(--accent-blue)]">{sr.request_number}</span>
                <Badge variant={priorityBadgeVariant(sr.priority)}>{sr.priority}</Badge>
              </div>
              <h3 className="text-[var(--text-primary)] font-semibold mb-2 line-clamp-2 group-hover:text-[var(--accent-blue)] transition">
                {sr.title}
              </h3>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant={statusBadgeVariant(sr.status ?? '')}>{(sr.status ?? '').replace(/_/g, ' ')}</Badge>
              </div>
              <div className="text-xs text-[var(--text-muted)] space-y-1">
                <p>{sr.machines?.name ?? 'No machine assigned'}</p>
                <p>{sr.technician?.users?.full_name ?? sr.technician?.employee_code ?? 'Unassigned'}</p>
                <p>{sr.created_at ? format(new Date(sr.created_at), 'dd MMM yyyy') : '-'}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* ---- Pagination ---- */}
      {total > limit && (
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span className="text-sm text-[var(--text-muted)]">{resultsText}</span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="p-2 rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-glow)] transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-[var(--text-secondary)]">
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="p-2 rounded-lg border border-[var(--border-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-glow)] transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}

      {/* ================================================================
          NEW REQUEST MODAL
      ================================================================ */}
      <AnimatePresence>
        {showModal && (
          <Modal open={showModal} onClose={() => setShowModal(false)} title="New Service Request">
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Brief description of the issue"
                  className={inputClasses}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Detailed description..."
                  className={`${inputClasses} resize-none`}
                />
              </div>

              {/* AI Suggest button */}
              <button
                type="button"
                onClick={autoClassify}
                disabled={aiSuggesting || (!form.title && !form.description)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 text-sm font-medium hover:bg-purple-500/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Brain className="w-4 h-4" />
                {aiSuggesting ? 'Classifying...' : 'AI Auto-Classify Category & Priority'}
              </button>

              {/* Category + Priority row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className={selectClasses + ' w-full'}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-[var(--text-secondary)] mb-1">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className={selectClasses + ' w-full'}
                  >
                    {PRIORITY_OPTIONS.filter((p) => p !== 'ALL').map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Site */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Site</label>
                <select
                  value={form.site_id}
                  onChange={(e) => setForm({ ...form, site_id: e.target.value, machine_id: '' })}
                  className={selectClasses + ' w-full'}
                >
                  <option value="">Select a site...</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                  ))}
                </select>
              </div>

              {/* Machine (dependent on site) */}
              <div>
                <label className="block text-sm text-[var(--text-secondary)] mb-1">Machine</label>
                <select
                  value={form.machine_id}
                  onChange={(e) => setForm({ ...form, machine_id: e.target.value })}
                  disabled={!form.site_id}
                  className={selectClasses + ' w-full disabled:opacity-50'}
                >
                  <option value="">{form.site_id ? 'Select a machine...' : 'Select a site first'}</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
                  ))}
                </select>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit} loading={submitting}>
                  <Wrench className="w-4 h-4 mr-2" />
                  Create Request
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
