'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
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
  Upload,
  Download,
  Trash2,
  Image,
  File,
  ClipboardList,
  Eye,
  Zap,
  Activity,
  ChevronDown,
  ChevronUp,
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
import type { MachineComponent, SensorData } from '@/components/three/MachineModel';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const MachineModel = dynamic(
  () => import('@/components/three/MachineModel'),
  { ssr: false, loading: () => <div className="h-[450px] flex items-center justify-center"><LoadingSpinner /></div> }
);

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

interface Document {
  id: string;
  name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  created_at: string;
  uploader?: { full_name: string };
}

interface CompletionReport {
  generated_at: string;
  service_request: any;
  machine: any;
  site: any;
  requester: any;
  technician: any;
  work_summary: any;
  parts_used: any;
  bidding_summary: any;
  timeline: any[];
  photos: any[];
  ai_classification: any;
}

interface VisualDiagnosis {
  id: string;
  service_request_id: string;
  machine_type: string;
  affected_component_id: string;
  component_name: string;
  ai_analysis: any;
  status: string;
  created_at: string;
}

interface ThreeDData {
  components: MachineComponent[];
  highlight: { component_id: string; component_name: string };
}

interface TechDiagnosis {
  id: string;
  technician_id: string;
  diagnosis_text: string;
  proposed_solution: string;
  parts_needed: any[];
  estimated_cost?: number;
  estimated_hours?: number;
  confidence_level: string;
  is_selected: boolean;
  submitted_at: string;
  technicians?: { employee_code: string; users?: { full_name: string } };
}

type TabKey = 'overview' | 'workorders' | 'bidding' | 'diagnosis' | 'ai' | 'audit' | 'documents' | 'report';

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

  // 3D Diagnosis state
  const [visDiagnosis, setVisDiagnosis] = useState<VisualDiagnosis | null>(null);
  const [threeData, setThreeData] = useState<ThreeDData | null>(null);
  const [sensorData, setSensorData] = useState<SensorData | undefined>();
  const [techDiagnoses, setTechDiagnoses] = useState<TechDiagnosis[]>([]);
  const [selectedComponent, setSelectedComponent] = useState<MachineComponent | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState(true);
  const [showDiagForm, setShowDiagForm] = useState(false);
  const [submittingDiag, setSubmittingDiag] = useState(false);
  const [diagForm, setDiagForm] = useState({ diagnosis_text: '', proposed_solution: '', estimated_hours: '', estimated_cost: '', confidence_level: 'MEDIUM' });

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [completionReport, setCompletionReport] = useState<CompletionReport | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({
    type: 'OTHER',
    description: '',
    severity: 'MEDIUM',
  });

  // ---- Fetch service request ----
  const fetchRequest = useCallback(async () => {
    try {
      const res = await api.get<{ service_request: ServiceRequest }>(`/api/service-requests/${id}`);
      setRequest(res?.service_request ?? null);
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
          case 'diagnosis': {
            if (request.machine_id) {
              api.get<any>(`/api/machines/${request.machine_id}`).then((m: any) => {
                const machine = m?.machine ?? m;
                if (machine) setSensorData({ air_temp: machine.air_temp, process_temp: machine.process_temp, rotational_speed: machine.rotational_speed, torque: machine.torque, tool_wear: machine.tool_wear });
              }).catch(() => {});
              try {
                const vdRes = await api.get<any>(`/api/visual-diagnoses/${id}`);
                const vd = vdRes?.visual_diagnosis ?? null;
                setVisDiagnosis(vd);
                if (vd?.id) {
                  const tdRes = await api.get<any>(`/api/visual-diagnoses/${vd.id}/3d-data`);
                  setThreeData(tdRes);
                  const techRes = await api.get<any>(`/api/technician-diagnoses/${vd.id}`);
                  setTechDiagnoses(techRes?.technician_diagnoses ?? []);
                }
              } catch { setVisDiagnosis(null); }
            }
            break;
          }
          case 'documents': {
            const dRes = await api.get<{ documents?: Document[] }>(`/api/documents/${id}`);
            setDocuments(dRes?.documents ?? []);
            break;
          }
          case 'report': {
            const rRes = await api.get<{ report?: CompletionReport }>(`/api/reports/completion/${id}`);
            setCompletionReport(rRes?.report ?? null);
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('service_request_id', id);
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      toast.success('File uploaded');
      const dRes = await api.get<{ documents?: Document[] }>(`/api/documents/${id}`);
      setDocuments(dRes?.documents ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (docId: string) => {
    try {
      await api.delete(`/api/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const generateReport = async () => {
    setGeneratingReport(true);
    try {
      const rRes = await api.get<{ report?: CompletionReport }>(`/api/reports/completion/${id}`);
      setCompletionReport(rRes?.report ?? null);
      toast.success('Report generated');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setGeneratingReport(false);
    }
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
    ...(request.machine_id ? [{ key: 'diagnosis' as TabKey, label: '3D Diagnosis', icon: Eye }] : []),
    { key: 'documents', label: 'Documents', icon: File },
    { key: 'ai', label: 'AI Analysis', icon: Brain },
    { key: 'audit', label: 'Audit Trail', icon: History },
    { key: 'report', label: 'Report', icon: ClipboardList },
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
              <Badge variant={statusBadgeVariant(request.status ?? '')}>
                {(request.status ?? '').replace(/_/g, ' ')}
              </Badge>
              <Badge variant={priorityBadgeVariant(request.priority ?? '')}>
                {request.priority ?? ''}
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
                {request.machines?.name ?? request.machines?.code ?? 'N/A'}
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                {request.machines?.type ?? '-'}
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
              <p className="text-sm font-medium text-[var(--text-primary)]">{request.sites?.name ?? request.sites?.code ?? 'N/A'}</p>
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
              <p className="text-sm font-medium text-[var(--text-primary)]">{request.requester?.full_name ?? 'N/A'}</p>
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
                {request.created_at ? format(new Date(request.created_at), 'dd MMM yyyy') : '-'}
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
                            <p className="text-[var(--text-primary)] font-medium text-sm">
                              {request.technician?.users?.full_name ?? request.technician?.employee_code ?? request.assigned_technician_id}
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
                              Submitted {bid.submitted_at ? format(new Date(bid.submitted_at), 'dd MMM yyyy HH:mm') : '-'}
                            </p>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ---- 3D DIAGNOSIS ---- */}
                {activeTab === 'diagnosis' && request.machine_id && (
                  <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                    {/* 3D Viewer */}
                    <div className="xl:col-span-3">
                      <Card className="overflow-hidden">
                        <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                              {request.machines?.name ?? 'Machine'} — 3D View
                            </h3>
                            <p className="text-xs text-[var(--text-muted)]">
                              {request.machines?.code} · {request.machines?.type}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {visDiagnosis && (
                              <Badge variant="info">{(visDiagnosis.status ?? '').replace(/_/g, ' ')}</Badge>
                            )}
                            {(user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER') && (
                              <Button
                                size="sm"
                                onClick={async () => {
                                  setDiagnosing(true);
                                  try {
                                    const res = await api.post<any>('/api/visual-diagnoses', { service_request_id: id });
                                    const vd = res?.visual_diagnosis;
                                    toast.success('AI diagnosis complete');
                                    setVisDiagnosis(vd);
                                    if (vd?.id) {
                                      const td = await api.get<any>(`/api/visual-diagnoses/${vd.id}/3d-data`);
                                      setThreeData(td);
                                    }
                                  } catch (err: any) { toast.error(err?.message || 'Diagnosis failed'); }
                                  finally { setDiagnosing(false); }
                                }}
                                disabled={diagnosing}
                              >
                                {diagnosing ? 'Analyzing...' : visDiagnosis ? 'Re-analyze' : <><Zap className="w-3.5 h-3.5 mr-1" /> Run AI Diagnosis</>}
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="relative bg-gradient-to-b from-[#0a0e1a] to-[#0d1117]">
                          <MachineModel
                            health={visDiagnosis ? (visDiagnosis.ai_analysis?.severity_assessment === 'CRITICAL' ? 20 : visDiagnosis.ai_analysis?.severity_assessment === 'HIGH' ? 40 : 70) : 85}
                            machineType={request.machines?.type}
                            sensorData={sensorData}
                            components={threeData?.components ?? []}
                            highlightId={threeData?.highlight?.component_id}
                            onComponentClick={(c) => setSelectedComponent(c)}
                            className="h-[450px] w-full"
                          />
                          <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-[10px] space-y-1">
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" /><span className="text-red-400">Faulty</span></div>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-blue-400">Selected</span></div>
                            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-slate-500" /><span className="text-slate-400">Normal</span></div>
                          </div>
                        </div>
                        {selectedComponent && (
                          <div className="p-3 border-t border-white/[0.06] bg-blue-500/5">
                            <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                              <Activity className="w-3.5 h-3.5" /> {selectedComponent.component_name}
                            </p>
                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                              ID: {selectedComponent.component_id} · Position: ({selectedComponent.coord_x.toFixed(1)}, {selectedComponent.coord_y.toFixed(1)}, {selectedComponent.coord_z.toFixed(1)})
                            </p>
                          </div>
                        )}
                        {/* Sensor data panel */}
                        {sensorData && (
                          <div className="p-4 border-t border-white/[0.06]">
                            <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">Live Sensor Readings</p>
                            <div className="grid grid-cols-5 gap-2">
                              {[
                                { label: 'Air Temp', value: sensorData.air_temp, unit: '°C' },
                                { label: 'Process Temp', value: sensorData.process_temp, unit: '°C' },
                                { label: 'Speed', value: sensorData.rotational_speed, unit: 'RPM' },
                                { label: 'Torque', value: sensorData.torque, unit: 'Nm' },
                                { label: 'Tool Wear', value: sensorData.tool_wear, unit: 'min' },
                              ].map(s => (
                                <div key={s.label} className="text-center p-2 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                                  <p className="text-lg font-bold text-[var(--text-primary)]">{s.value ?? '—'}</p>
                                  <p className="text-[10px] text-[var(--text-muted)]">{s.label} ({s.unit})</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    </div>

                    {/* Right panel — AI Analysis + Tech Diagnosis */}
                    <div className="xl:col-span-2 space-y-4">
                      {visDiagnosis && visDiagnosis.ai_analysis && (
                        <Card className="overflow-hidden">
                          <button onClick={() => setExpandedAnalysis(!expandedAnalysis)} className="w-full p-4 flex items-center justify-between border-b border-white/[0.06]">
                            <div className="flex items-center gap-2">
                              <Cpu className="w-4 h-4 text-purple-400" />
                              <span className="text-sm font-semibold text-[var(--text-primary)]">AI Analysis</span>
                            </div>
                            {expandedAnalysis ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
                          </button>
                          <AnimatePresence>
                            {expandedAnalysis && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                <div className="p-4 space-y-3">
                                  <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                      <p className="text-xs font-semibold text-red-400">Affected Component</p>
                                      <p className="text-sm text-[var(--text-primary)]">{visDiagnosis.component_name}</p>
                                      <p className="text-xs text-[var(--text-muted)] font-mono">{visDiagnosis.affected_component_id}</p>
                                    </div>
                                  </div>
                                  {visDiagnosis.ai_analysis.severity_assessment && (
                                    <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                                      <span className="text-xs text-[var(--text-muted)]">Severity</span>
                                      <Badge variant={visDiagnosis.ai_analysis.severity_assessment === 'CRITICAL' ? 'danger' : visDiagnosis.ai_analysis.severity_assessment === 'HIGH' ? 'warning' : 'info'}>
                                        {visDiagnosis.ai_analysis.severity_assessment}
                                      </Badge>
                                    </div>
                                  )}
                                  {visDiagnosis.ai_analysis.failure_analysis && (
                                    <div>
                                      <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Failure Analysis</p>
                                      <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{visDiagnosis.ai_analysis.failure_analysis}</p>
                                    </div>
                                  )}
                                  {visDiagnosis.ai_analysis.diagnostic_questions?.length > 0 && (
                                    <div>
                                      <p className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Diagnostic Questions</p>
                                      <ul className="space-y-1">
                                        {visDiagnosis.ai_analysis.diagnostic_questions.map((q: string, i: number) => (
                                          <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                                            <span className="text-purple-400 font-mono mt-0.5">{i + 1}.</span>{q}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </Card>
                      )}

                      {/* Technician diagnosis form */}
                      {user?.role === 'TECHNICIAN' && visDiagnosis && (
                        <Card className="p-4">
                          {!showDiagForm ? (
                            <Button onClick={() => setShowDiagForm(true)} className="w-full text-sm"><Send className="w-4 h-4 mr-1" /> Submit Your Diagnosis</Button>
                          ) : (
                            <div className="space-y-3">
                              <h4 className="text-sm font-semibold text-[var(--text-primary)]">Remote Diagnosis</h4>
                              <textarea placeholder="Your diagnosis..." value={diagForm.diagnosis_text} onChange={(e) => setDiagForm({ ...diagForm, diagnosis_text: e.target.value })} className="w-full p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none h-20 focus:outline-none focus:border-blue-500/40" />
                              <textarea placeholder="Proposed solution..." value={diagForm.proposed_solution} onChange={(e) => setDiagForm({ ...diagForm, proposed_solution: e.target.value })} className="w-full p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none h-20 focus:outline-none focus:border-blue-500/40" />
                              <div className="grid grid-cols-2 gap-2">
                                <input type="number" placeholder="Est. hours" value={diagForm.estimated_hours} onChange={(e) => setDiagForm({ ...diagForm, estimated_hours: e.target.value })} className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/40" />
                                <input type="number" placeholder="Est. cost (₹)" value={diagForm.estimated_cost} onChange={(e) => setDiagForm({ ...diagForm, estimated_cost: e.target.value })} className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/40" />
                              </div>
                              <div className="flex gap-2">
                                <Button onClick={async () => {
                                  setSubmittingDiag(true);
                                  try {
                                    await api.post('/api/technician-diagnoses', { visual_diagnosis_id: visDiagnosis.id, diagnosis_text: diagForm.diagnosis_text, proposed_solution: diagForm.proposed_solution, estimated_hours: diagForm.estimated_hours ? Number(diagForm.estimated_hours) : undefined, estimated_cost: diagForm.estimated_cost ? Number(diagForm.estimated_cost) : undefined, confidence_level: diagForm.confidence_level });
                                    toast.success('Diagnosis submitted');
                                    setShowDiagForm(false);
                                    setDiagForm({ diagnosis_text: '', proposed_solution: '', estimated_hours: '', estimated_cost: '', confidence_level: 'MEDIUM' });
                                  } catch (err: any) { toast.error(err?.message || 'Failed'); }
                                  finally { setSubmittingDiag(false); }
                                }} disabled={submittingDiag || !diagForm.diagnosis_text || !diagForm.proposed_solution} className="flex-1 text-xs">
                                  {submittingDiag ? 'Submitting...' : 'Submit'}
                                </Button>
                                <Button variant="secondary" onClick={() => setShowDiagForm(false)} className="text-xs">Cancel</Button>
                              </div>
                            </div>
                          )}
                        </Card>
                      )}

                      {/* Expert diagnoses list */}
                      {(user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER') && techDiagnoses.length > 0 && (
                        <Card className="overflow-hidden">
                          <div className="p-4 border-b border-white/[0.06]">
                            <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                              <User className="w-4 h-4 text-emerald-400" /> Expert Diagnoses ({techDiagnoses.length})
                            </h4>
                          </div>
                          <div className="divide-y divide-white/[0.04] max-h-[300px] overflow-y-auto">
                            {techDiagnoses.map((td) => (
                              <div key={td.id} className={`p-3 ${td.is_selected ? 'bg-emerald-500/5 border-l-2 border-emerald-500' : ''}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-semibold text-[var(--text-primary)]">{td.technicians?.users?.full_name ?? td.technicians?.employee_code ?? 'Technician'}</span>
                                  {td.is_selected ? (
                                    <Badge variant="success"><CheckCircle2 className="w-3 h-3 mr-0.5" /> Selected</Badge>
                                  ) : (
                                    <Button variant="secondary" onClick={async () => { try { await api.put(`/api/technician-diagnoses/${td.id}/select`); toast.success('Selected'); const res = await api.get<any>(`/api/technician-diagnoses/${visDiagnosis!.id}`); setTechDiagnoses(res?.technician_diagnoses ?? []); } catch (e: any) { toast.error(e?.message || 'Failed'); } }} className="text-[11px] py-0.5 px-2">Select</Button>
                                  )}
                                </div>
                                <p className="text-xs text-[var(--text-secondary)]">{td.diagnosis_text}</p>
                                <p className="text-xs text-blue-400 mt-1">Solution: {td.proposed_solution}</p>
                              </div>
                            ))}
                          </div>
                        </Card>
                      )}

                      {!visDiagnosis && (
                        <Card className="p-8 text-center">
                          <Eye className="w-10 h-10 text-purple-500/40 mx-auto mb-3" />
                          <p className="text-sm font-medium text-[var(--text-primary)]">No Diagnosis Yet</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            {(user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER') ? 'Click "Run AI Diagnosis" to analyze this machine' : 'Waiting for ops to initiate AI diagnosis'}
                          </p>
                        </Card>
                      )}
                    </div>
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

                {/* ---- DOCUMENTS ---- */}
                {activeTab === 'documents' && (
                  <div className="space-y-4">
                    <Card className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-medium text-[var(--text-muted)]">
                          Attachments & Photos ({documents.length})
                        </h4>
                        <label className="cursor-pointer">
                          <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--accent-blue)] text-white hover:opacity-90 transition">
                            {uploading ? <LoadingSpinner /> : <Upload className="w-4 h-4" />}
                            {uploading ? 'Uploading...' : 'Upload File'}
                          </span>
                        </label>
                      </div>
                      {documents.length === 0 ? (
                        <div className="text-center py-8">
                          <File className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                          <p className="text-[var(--text-muted)] text-sm">No documents uploaded yet</p>
                          <p className="text-xs text-[var(--text-muted)] mt-1">Upload photos, reports, or documents</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {documents.map((doc) => (
                            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.1] transition">
                              <div className="p-2 rounded-lg bg-blue-500/10">
                                {doc.file_type?.startsWith('image/') ? (
                                  <Image className="w-5 h-5 text-blue-400" />
                                ) : (
                                  <FileText className="w-5 h-5 text-blue-400" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[var(--text-primary)] truncate">{doc.name}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {doc.uploader?.full_name ?? 'Unknown'} · {doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : ''} · {doc.created_at ? format(new Date(doc.created_at), 'dd MMM yyyy HH:mm') : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-white/[0.06] transition" title="Download">
                                  <Download className="w-4 h-4 text-[var(--text-muted)]" />
                                </a>
                                <button onClick={() => handleDeleteDoc(doc.id)} className="p-1.5 rounded hover:bg-red-500/10 transition" title="Delete">
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                    {documents.some((d) => d.file_type?.startsWith('image/')) && (
                      <Card className="p-6">
                        <h4 className="text-sm font-medium text-[var(--text-muted)] mb-3">Photo Gallery</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {documents.filter((d) => d.file_type?.startsWith('image/')).map((doc) => (
                            <a key={doc.id} href={doc.file_url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square rounded-lg overflow-hidden border border-white/[0.06] hover:border-blue-500/30 transition">
                              <img src={doc.file_url} alt={doc.name} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-end p-2">
                                <span className="text-xs text-white truncate">{doc.name}</span>
                              </div>
                            </a>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {/* ---- COMPLETION REPORT ---- */}
                {activeTab === 'report' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-[var(--text-muted)]">Completion Report</h4>
                      <Button onClick={generateReport} loading={generatingReport} size="sm">
                        <ClipboardList className="w-4 h-4 mr-1" /> {completionReport ? 'Refresh Report' : 'Generate Report'}
                      </Button>
                    </div>
                    {!completionReport ? (
                      <Card className="p-10 text-center">
                        <ClipboardList className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-2 opacity-40" />
                        <p className="text-[var(--text-muted)] text-sm">Click &quot;Generate Report&quot; to create a completion report</p>
                      </Card>
                    ) : (
                      <>
                        <Card className="p-6">
                          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-primary)]">
                            <div>
                              <h3 className="text-lg font-bold text-[var(--text-primary)]">Service Completion Report</h3>
                              <p className="text-xs text-[var(--text-muted)]">Generated {completionReport.generated_at ? format(new Date(completionReport.generated_at), 'dd MMM yyyy HH:mm') : ''}</p>
                            </div>
                            <Badge variant={completionReport.service_request.sla_status === 'MET' ? 'success' : completionReport.service_request.sla_status === 'BREACHED' ? 'danger' : 'default'}>
                              SLA: {completionReport.service_request.sla_status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                              <p className="text-xs text-[var(--text-muted)]">Request</p>
                              <p className="text-sm font-semibold text-[var(--text-primary)]">{completionReport.service_request.request_number}</p>
                              <p className="text-xs text-[var(--text-secondary)]">{completionReport.service_request.title}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                              <p className="text-xs text-[var(--text-muted)]">Machine</p>
                              <p className="text-sm font-semibold text-[var(--text-primary)]">{completionReport.machine?.name ?? 'N/A'}</p>
                              <p className="text-xs text-[var(--text-secondary)]">{completionReport.machine?.type} · {completionReport.machine?.code}</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.06]">
                              <p className="text-xs text-[var(--text-muted)]">Resolution Time</p>
                              <p className="text-sm font-semibold text-[var(--accent-blue)]">{completionReport.service_request.resolution_hours}h</p>
                              <p className="text-xs text-[var(--text-secondary)]">{completionReport.service_request.category} · {completionReport.service_request.priority}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                            <div>
                              <h5 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Requester</h5>
                              <p className="text-sm text-[var(--text-primary)]">{completionReport.requester?.name ?? 'N/A'}</p>
                              <p className="text-xs text-[var(--text-secondary)]">{completionReport.requester?.email}</p>
                            </div>
                            <div>
                              <h5 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Technician</h5>
                              <p className="text-sm text-[var(--text-primary)]">{completionReport.technician?.name ?? 'N/A'}</p>
                              <p className="text-xs text-[var(--text-secondary)]">{completionReport.technician?.employee_code}</p>
                            </div>
                          </div>
                        </Card>

                        <Card className="p-6">
                          <h5 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Work Summary</h5>
                          <div className="grid grid-cols-3 gap-4 mb-4">
                            <div className="text-center p-3 rounded-lg bg-blue-500/5">
                              <p className="text-2xl font-bold text-[var(--accent-blue)]">{completionReport.work_summary.total_work_orders}</p>
                              <p className="text-xs text-[var(--text-muted)]">Work Orders</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-emerald-500/5">
                              <p className="text-2xl font-bold text-[var(--accent-emerald)]">{completionReport.work_summary.completed_work_orders}</p>
                              <p className="text-xs text-[var(--text-muted)]">Completed</p>
                            </div>
                            <div className="text-center p-3 rounded-lg bg-amber-500/5">
                              <p className="text-2xl font-bold text-[var(--accent-amber)]">{completionReport.work_summary.total_hours}h</p>
                              <p className="text-xs text-[var(--text-muted)]">Total Hours</p>
                            </div>
                          </div>
                        </Card>

                        {completionReport.parts_used.total_items > 0 && (
                          <Card className="p-6">
                            <h5 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Parts Used</h5>
                            <div className="space-y-2">
                              {completionReport.parts_used.items.map((item: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-sm p-2 rounded bg-white/[0.02]">
                                  <div>
                                    <span className="text-[var(--text-primary)]">{item.part_name}</span>
                                    <span className="text-xs text-[var(--text-muted)] ml-2">{item.part_number}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-[var(--text-secondary)]">x{item.quantity}</span>
                                    <Badge variant={item.status === 'ISSUED' ? 'success' : 'default'}>{item.status}</Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}

                        {completionReport.timeline.length > 0 && (
                          <Card className="p-6">
                            <h5 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Resolution Timeline</h5>
                            <div className="relative pl-6">
                              <div className="absolute left-2 top-0 bottom-0 w-px bg-[var(--border-primary)]" />
                              {completionReport.timeline.map((step: any, i: number) => (
                                <div key={i} className="relative mb-3 last:mb-0">
                                  <div className="absolute -left-4 top-1.5 w-2 h-2 rounded-full bg-[var(--accent-blue)]" />
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <p className="text-xs font-medium text-[var(--text-primary)]">{(step.action ?? '').replace(/_/g, ' ')}</p>
                                      {step.from_status && (
                                        <p className="text-[10px] text-[var(--text-muted)]">{step.from_status} → {step.to_status}</p>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-[var(--text-muted)]">
                                      {step.at ? format(new Date(step.at), 'dd MMM HH:mm') : ''}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}

                        {completionReport.photos.length > 0 && (
                          <Card className="p-6">
                            <h5 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Machine Photos</h5>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {completionReport.photos.map((photo: any, i: number) => (
                                <a key={i} href={photo.url} target="_blank" rel="noopener noreferrer" className="group relative aspect-video rounded-lg overflow-hidden border border-white/[0.06]">
                                  <img src={photo.url} alt={photo.name} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-end p-2">
                                    <span className="text-xs text-white truncate">{photo.name}</span>
                                  </div>
                                </a>
                              ))}
                            </div>
                          </Card>
                        )}
                      </>
                    )}
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
                                      {(log.action ?? '').replace(/_/g, ' ')}
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
                                    {log.created_at ? format(new Date(log.created_at), 'dd MMM yyyy HH:mm') : '-'}
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
