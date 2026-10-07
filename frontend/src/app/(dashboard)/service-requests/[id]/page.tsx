'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  MapPin,
  Cpu,
  User,
  Calendar,
  Clock,
  AlertTriangle,
  ChevronRight,
  Send,
  Play,
  CheckCircle2,
  XCircle,
  FileText,
  Gavel,
  Brain,
  History,
  Shield,
  UserCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type {
  ServiceRequest,
  Technician,
  WorkOrder,
  AuditLog,
  Bid,
} from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALL_STATES = [
  'DRAFT',
  'SUBMITTED',
  'VALIDATING',
  'PENDING_APPROVAL',
  'APPROVED',
  'BIDDING',
  'BID_REVIEW',
  'BID_ACCEPTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
  'CLOSED',
] as const;

const TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['VALIDATING'],
  VALIDATING: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['APPROVED'],
  APPROVED: ['BIDDING', 'ASSIGNED'],
  BIDDING: ['BID_REVIEW'],
  BID_REVIEW: ['BID_ACCEPTED'],
  BID_ACCEPTED: ['ASSIGNED'],
  ASSIGNED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['VERIFIED'],
  VERIFIED: ['CLOSED'],
};

const statusBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  if (['COMPLETED', 'VERIFIED', 'CLOSED'].includes(status)) return 'success';
  if (['VALIDATING', 'PENDING_APPROVAL'].includes(status)) return 'warning';
  if (['EXCEPTION'].includes(status)) return 'danger';
  if (['SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS'].includes(status)) return 'info';
  if (['BIDDING', 'BID_REVIEW', 'BID_ACCEPTED'].includes(status)) return 'info';
  return 'default';
};

const priorityBadgeVariant = (p: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  if (p === 'CRITICAL') return 'danger';
  if (p === 'HIGH') return 'warning';
  if (p === 'MEDIUM') return 'info';
  return 'success';
};

const EXCEPTION_TYPES = [
  'SCOPE_CHANGE',
  'RESOURCE_UNAVAILABLE',
  'PARTS_DELAY',
  'SAFETY_CONCERN',
  'CUSTOMER_REQUEST',
  'OTHER',
];

const SEVERITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

type TabKey = 'overview' | 'workorders' | 'bidding' | 'ai' | 'audit';

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function ServiceRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const id = params.id as string;

  // Core state
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Secondary data
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    type: 'OTHER',
    description: '',
    severity: 'MEDIUM',
  });

  // ---- Fetch service request ----
  const fetchRequest = useCallback(async () => {
    try {
      const res = await api.get<{ service_requests: ServiceRequest[] } | ServiceRequest>(`/api/service-requests/${id}`);
      // Handle both wrapped array and direct object responses
      if (res && 'service_requests' in res) {
        const list = (res as { service_requests: ServiceRequest[] }).service_requests ?? [];
        setRequest(list[0] ?? null);
      } else {
        setRequest((res as ServiceRequest) ?? null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load service request';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchRequest();
  }, [fetchRequest]);

  // ---- Fetch tab data ----
  useEffect(() => {
    if (!request) return;

    const loadTabData = async () => {
      setTabLoading(true);
      try {
        switch (activeTab) {
          case 'workorders': {
            const woRes = await api.get<{ work_orders?: WorkOrder[] }>(`/api/work-orders?service_request_id=${id}`);
            setWorkOrders(woRes?.work_orders ?? []);
            break;
          }
          case 'bidding': {
            const bRes = await api.get<{ bids?: Bid[] } | Bid[]>(`/api/bids/${id}`);
            if (Array.isArray(bRes)) {
              setBids(bRes);
            } else {
              setBids((bRes as { bids?: Bid[] })?.bids ?? []);
            }
            break;
          }
          case 'audit': {
            const aRes = await api.get<{ audit_logs?: AuditLog[] }>(`/api/audit?entity_type=service_request&entity_id=${id}`);
            setAuditLogs(aRes?.audit_logs ?? []);
            break;
          }
        }
      } catch {
        // Silently handle - tabs show empty state
      } finally {
        setTabLoading(false);
      }
    };

    loadTabData();
  }, [activeTab, id, request]);

  // ---- Fetch technicians when needed ----
  useEffect(() => {
    if (!showAssignModal) return;
    api.get<{ technicians: Technician[] }>('/api/technicians')
      .then((res) => setTechnicians(res?.technicians ?? []))
      .catch(() => toast.error('Failed to load technicians'));
  }, [showAssignModal]);

  // ---- Transition handler ----
  const handleTransition = async (newStatus: string, metadata?: Record<string, unknown>) => {
    if (newStatus === 'ASSIGNED' && !metadata?.assigned_technician_id) {
      setShowAssignModal(true);
      return;
    }

    setTransitioning(true);
    try {
      await api.post(`/api/service-requests/${id}/transition`, {
        status: newStatus,
        ...metadata,
      });
      toast.success(`Status updated to ${newStatus.replace(/_/g, ' ')}`);
      await fetchRequest();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transition failed';
      toast.error(msg);
    } finally {
      setTransitioning(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedTechId) {
      toast.error('Select a technician');
      return;
    }
    setShowAssignModal(false);
    await handleTransition('ASSIGNED', { assigned_technician_id: selectedTechId });
    setSelectedTechId('');
  };

  const handleException = async () => {
    if (!exceptionForm.description.trim()) {
      toast.error('Description is required');
      return;
    }
    setShowExceptionModal(false);
    await handleTransition('EXCEPTION', {
      exception_type: exceptionForm.type,
      exception_description: exceptionForm.description,
      exception_severity: exceptionForm.severity,
    });
    setExceptionForm({ type: 'OTHER', description: '', severity: 'MEDIUM' });
  };

  // ---- Valid transitions for current state ----
  const validTransitions = useMemo(() => {
    if (!request) return [];
    return TRANSITIONS[request.status] || [];
  }, [request]);

  // ---- SLA countdown ----
  const slaInfo = useMemo(() => {
    if (!request?.sla_deadline) return null;
    const deadline = new Date(request.sla_deadline);
    const now = new Date();
    const remaining = deadline.getTime() - now.getTime();
    const overdue = remaining < 0;
    return {
      deadline,
      remaining: formatDistanceToNow(deadline, { addSuffix: true }),
      overdue,
    };
  }, [request]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-[var(--accent-red)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Request not found</h2>
          <Button variant="ghost" onClick={() => router.push('/service-requests')} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to list
          </Button>
        </div>
      </div>
    );
  }

  const selectClasses =
    'w-full bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)]';

  const inputClasses =
    'w-full bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)] placeholder:text-[var(--text-muted)]';

  const tabs: { key: TabKey; label: string; icon: typeof FileText }[] = [
    { key: 'overview', label: 'Overview', icon: FileText },
    { key: 'workorders', label: 'Work Orders', icon: Cpu },
    { key: 'bidding', label: 'Bidding', icon: Gavel },
    { key: 'ai', label: 'AI Analysis', icon: Brain },
    { key: 'audit', label: 'Audit Trail', icon: History },
  ];

  // Get the index of the current status in the workflow
  const currentIdx = ALL_STATES.indexOf(request.status as (typeof ALL_STATES)[number]);

  return (
    <div className="space-y-6">
      {/* ================================================================
          HEADER
      ================================================================ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => router.push('/service-requests')}
          className="flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Service Requests
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{request.request_number}</h1>
              <Badge variant={statusBadgeVariant(request.status)}>
                {request.status.replace(/_/g, ' ')}
              </Badge>
              <Badge variant={priorityBadgeVariant(request.priority)}>
                {request.priority}
              </Badge>
            </div>
            <p className="text-lg text-[var(--text-secondary)]">{request.title}</p>
          </div>

          {/* Exception button */}
          <Button
            variant="ghost"
            onClick={() => setShowExceptionModal(true)}
            className="!text-[var(--accent-red)] hover:!bg-red-500/10 border border-red-500/30"
          >
            <AlertTriangle className="w-4 h-4 mr-2" /> Raise Exception
          </Button>
        </div>
      </motion.div>

      {/* ================================================================
          INFO CARDS ROW
      ================================================================ */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Cpu className="w-5 h-5 text-[var(--accent-blue)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Machine</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {request.machine_id ? request.machine_id.slice(0, 8) + '...' : 'N/A'}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {request.machine_id ? 'Assigned' : '-'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <MapPin className="w-5 h-5 text-[var(--accent-purple)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Site</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{request.site_id}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <User className="w-5 h-5 text-[var(--accent-emerald)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Requester</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">{request.requester_id ? request.requester_id.slice(0, 12) + '...' : 'N/A'}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <Calendar className="w-5 h-5 text-[var(--accent-cyan)]" />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Created</p>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {format(new Date(request.created_at), 'dd MMM yyyy')}
              </p>
            </div>
          </div>
        </Card>

        <Card className={`p-4 ${slaInfo?.overdue ? 'border-[var(--accent-red)]' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${slaInfo?.overdue ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
              <Clock className={`w-5 h-5 ${slaInfo?.overdue ? 'text-[var(--accent-red)]' : 'text-[var(--accent-amber)]'}`} />
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">SLA Deadline</p>
              {slaInfo ? (
                <>
                  <p className={`text-sm font-medium ${slaInfo.overdue ? 'text-[var(--accent-red)]' : 'text-[var(--text-primary)]'}`}>
                    {slaInfo.remaining}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {format(slaInfo.deadline, 'dd MMM yyyy HH:mm')}
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Not set</p>
              )}
            </div>
          </div>
        </Card>
      </motion.div>

      {/* ================================================================
          WORKFLOW STATE MACHINE
      ================================================================ */}
      <motion.div
        className="glass-card p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-5">Workflow Progress</h3>

        {/* Visual state machine */}
        <div className="overflow-x-auto pb-2">
          <div className="flex items-center gap-1 min-w-max">
            {ALL_STATES.map((state, idx) => {
              const isCurrent = request.status === state;
              const isPast = currentIdx >= 0 && idx < currentIdx;
              const isException = request.status === 'EXCEPTION';

              return (
                <div key={state} className="flex items-center">
                  {idx > 0 && (
                    <div
                      className={`w-6 h-0.5 ${
                        isPast ? 'bg-[var(--accent-emerald)]' : 'bg-[var(--border-primary)]'
                      }`}
                    />
                  )}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                        isCurrent
                          ? isException
                            ? 'bg-[var(--accent-red)] text-white ring-4 ring-red-500/20'
                            : 'bg-[var(--accent-blue)] text-white ring-4 ring-blue-500/20'
                          : isPast
                          ? 'bg-[var(--accent-emerald)] text-white'
                          : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border border-[var(--border-primary)]'
                      }`}
                    >
                      {isPast ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <span
                      className={`text-[9px] mt-1 whitespace-nowrap ${
                        isCurrent
                          ? 'text-[var(--accent-blue)] font-semibold'
                          : isPast
                          ? 'text-[var(--accent-emerald)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {state.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Show EXCEPTION as a separate node if current */}
            {request.status === 'EXCEPTION' && (
              <div className="flex items-center">
                <div className="w-6 h-0.5 bg-[var(--accent-red)]" />
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center bg-[var(--accent-red)] text-white ring-4 ring-red-500/20">
                    <AlertTriangle className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[9px] mt-1 text-[var(--accent-red)] font-semibold">EXCEPTION</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Transition Buttons */}
        {validTransitions.length > 0 && (
          <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-[var(--border-primary)]">
            <span className="text-sm text-[var(--text-muted)] self-center mr-2">Transition to:</span>
            {validTransitions.map((nextStatus) => (
              <Button
                key={nextStatus}
                size="sm"
                loading={transitioning}
                disabled={transitioning}
                onClick={() => handleTransition(nextStatus)}
              >
                <ChevronRight className="w-3 h-3 mr-1" />
                {nextStatus.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>
        )}
      </motion.div>

      {/* ================================================================
          TABS
      ================================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-[var(--border-primary)] mb-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                  activeTab === tab.key
                    ? 'border-[var(--accent-blue)] text-[var(--accent-blue)]'
                    : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tabLoading ? (
              <div className="flex justify-center py-12"><LoadingSpinner /></div>
            ) : (
              <>
                {/* ---- OVERVIEW ---- */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <Card className="p-6">
                      <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">Description</h4>
                      <p className="text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
                        {request.description || 'No description provided.'}
                      </p>
                    </Card>

                    {request.cascading_impact_score !== undefined && request.cascading_impact_score !== null && (
                      <Card className="p-6">
                        <h4 className="text-sm font-medium text-[var(--text-muted)] mb-3">Impact Analysis</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">Cascading Impact Score</p>
                            <p className="text-2xl font-bold text-[var(--accent-amber)]">
                              {request.cascading_impact_score.toFixed(1)}
                            </p>
                          </div>
                          {request.impact_inr !== undefined && request.impact_inr !== null && (
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Estimated Impact (INR)</p>
                              <p className="text-2xl font-bold text-[var(--accent-red)]">
                                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(request.impact_inr)}
                              </p>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}

                    {request.assigned_technician_id && (
                      <Card className="p-6">
                        <h4 className="text-sm font-medium text-[var(--text-muted)] mb-2">Assigned Technician</h4>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[var(--accent-purple)]/20 flex items-center justify-center">
                            <UserCheck className="w-5 h-5 text-[var(--accent-purple)]" />
                          </div>
                          <div>
                            <p className="text-[var(--text-primary)] font-medium font-mono text-sm">
                              {request.assigned_technician_id}
                            </p>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {/* ---- WORK ORDERS ---- */}
                {activeTab === 'workorders' && (
                  <div>
                    {workOrders.length === 0 ? (
                      <Card className="p-10 text-center">
                        <p className="text-[var(--text-muted)]">No work orders associated with this request.</p>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {workOrders.map((wo) => (
                          <Card key={wo.id} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-mono text-sm text-[var(--accent-blue)]">{wo.order_number ?? ''}</p>
                                <p className="text-[var(--text-secondary)] text-sm mt-1">{wo.description || 'No description'}</p>
                              </div>
                              <div className="flex gap-2">
                                {wo.service_requests?.priority && (
                                  <Badge variant={priorityBadgeVariant(wo.service_requests.priority)}>{wo.service_requests.priority}</Badge>
                                )}
                                <Badge variant={statusBadgeVariant(wo.status ?? '')}>{(wo.status ?? '').replace(/_/g, ' ')}</Badge>
                              </div>
                            </div>
                            {wo.notes && (
                              <p className="text-xs text-[var(--text-muted)] mt-2 border-t border-[var(--border-primary)] pt-2">
                                {wo.notes}
                              </p>
                            )}
                            <p className="text-[10px] text-[var(--text-muted)] mt-2">
                              {wo.created_at ? format(new Date(wo.created_at), 'dd MMM yyyy HH:mm') : '-'}
                            </p>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ---- BIDDING ---- */}
                {activeTab === 'bidding' && (
                  <div>
                    {bids.length === 0 ? (
                      <Card className="p-10 text-center">
                        <p className="text-[var(--text-muted)]">No bids for this service request.</p>
                      </Card>
                    ) : (
                      <div className="space-y-3">
                        {bids.map((bid) => (
                          <Card key={bid.id} className="p-5">
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="text-sm font-medium text-[var(--text-primary)]">
                                  {bid.technicians?.users?.full_name || 'Unknown Technician'}
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {bid.technicians?.employee_code}
                                </p>
                              </div>
                              <Badge variant={bid.status === 'ACCEPTED' ? 'success' : bid.status === 'REJECTED' ? 'danger' : 'default'}>
                                {bid.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-[var(--text-secondary)] mb-3">{bid.proposed_solution}</p>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Labor Hours</p>
                                <p className="font-semibold text-[var(--text-primary)]">{bid.labor_hours}h</p>
                              </div>
                              <div>
                                <p className="text-xs text-[var(--text-muted)]">Total Cost</p>
                                <p className="font-semibold text-[var(--accent-emerald)]">
                                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(bid.total_cost)}
                                </p>
                              </div>
                              {bid.score !== undefined && bid.score !== null && (
                                <div>
                                  <p className="text-xs text-[var(--text-muted)]">Score</p>
                                  <p className="font-semibold text-[var(--accent-amber)]">{bid.score.toFixed(1)}</p>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] mt-3">
                              Submitted {format(new Date(bid.submitted_at), 'dd MMM yyyy HH:mm')}
                            </p>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ---- AI ANALYSIS ---- */}
                {activeTab === 'ai' && (
                  <div className="space-y-4">
                    <Card className="p-6">
                      <h4 className="text-sm font-medium text-[var(--text-muted)] mb-4">AI-Powered Analysis</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Button
                          onClick={async () => {
                            try {
                              const result = await api.post<{ classification: string }>(`/api/ai/classify`, { service_request_id: id });
                              toast.success(`Classification: ${result.classification}`);
                            } catch {
                              toast.error('Classification failed');
                            }
                          }}
                        >
                          <Brain className="w-4 h-4 mr-2" /> Classify Request
                        </Button>
                        <Button
                          onClick={async () => {
                            try {
                              const result = await api.post<{ prediction: string }>(`/api/ai/predict`, { service_request_id: id });
                              toast.success(`Prediction: ${result.prediction}`);
                            } catch {
                              toast.error('Prediction failed');
                            }
                          }}
                        >
                          <Shield className="w-4 h-4 mr-2" /> Predict Outcome
                        </Button>
                      </div>
                    </Card>
                    <Card className="p-6">
                      <p className="text-sm text-[var(--text-muted)]">
                        Use AI capabilities to classify this request type or predict resolution outcomes
                        based on historical data and machine learning models.
                      </p>
                    </Card>
                  </div>
                )}

                {/* ---- AUDIT TRAIL ---- */}
                {activeTab === 'audit' && (
                  <div>
                    {auditLogs.length === 0 ? (
                      <Card className="p-10 text-center">
                        <p className="text-[var(--text-muted)]">No audit records found.</p>
                      </Card>
                    ) : (
                      <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-4 top-0 bottom-0 w-px bg-[var(--border-primary)]" />

                        <div className="space-y-4">
                          {auditLogs.map((log) => (
                            <div key={log.id} className="relative pl-10">
                              <div className="absolute left-2.5 top-4 w-3 h-3 rounded-full bg-[var(--accent-blue)] ring-4 ring-[var(--bg-primary)]" />
                              <Card className="p-4">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-[var(--text-primary)]">
                                      {log.action.replace(/_/g, ' ')}
                                    </p>
                                    {log.field_changed && (
                                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                                        <span className="text-[var(--text-muted)]">{log.field_changed}:</span>{' '}
                                        <span className="line-through text-[var(--accent-red)]">{log.old_value || '-'}</span>{' '}
                                        <span className="text-[var(--accent-emerald)]">{log.new_value || '-'}</span>
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">
                                    {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                                  </span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mt-2">
                                  by {log.performer?.full_name || log.performed_by}
                                </p>
                              </Card>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* ================================================================
          ASSIGN TECHNICIAN MODAL
      ================================================================ */}
      <Modal open={showAssignModal} onClose={() => setShowAssignModal(false)} title="Assign Technician">
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Select a technician to assign to this service request.
          </p>
          <select
            value={selectedTechId}
            onChange={(e) => setSelectedTechId(e.target.value)}
            className={selectClasses}
          >
            <option value="">Select a technician...</option>
            {technicians
              .filter((t) => t.is_available)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.users?.full_name || t.employee_code} ({t.current_job_count}/{t.max_concurrent_jobs} jobs)
                  {t.rating ? ` - ${t.rating.toFixed(1)} rating` : ''}
                </option>
              ))}
          </select>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAssignModal(false)}>Cancel</Button>
            <Button onClick={handleAssign} loading={transitioning}>
              <Send className="w-4 h-4 mr-2" /> Assign
            </Button>
          </div>
        </div>
      </Modal>

      {/* ================================================================
          EXCEPTION MODAL
      ================================================================ */}
      <Modal open={showExceptionModal} onClose={() => setShowExceptionModal(false)} title="Raise Exception">
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Exception Type</label>
            <select
              value={exceptionForm.type}
              onChange={(e) => setExceptionForm({ ...exceptionForm, type: e.target.value })}
              className={selectClasses}
            >
              {EXCEPTION_TYPES.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Description *</label>
            <textarea
              value={exceptionForm.description}
              onChange={(e) => setExceptionForm({ ...exceptionForm, description: e.target.value })}
              rows={3}
              placeholder="Describe the exception..."
              className={`${inputClasses} resize-none`}
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--text-secondary)] mb-1">Severity</label>
            <select
              value={exceptionForm.severity}
              onChange={(e) => setExceptionForm({ ...exceptionForm, severity: e.target.value })}
              className={selectClasses}
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowExceptionModal(false)}>Cancel</Button>
            <Button onClick={handleException} loading={transitioning} className="!bg-[var(--accent-red)] hover:!bg-red-600">
              <AlertTriangle className="w-4 h-4 mr-2" /> Raise Exception
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
