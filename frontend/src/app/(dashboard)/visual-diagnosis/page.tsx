'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye, Cpu, Search, AlertTriangle, CheckCircle2, Clock, Send,
  ChevronDown, ChevronUp, Zap, Activity, User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MachineComponent, SensorData } from '@/components/three/MachineModel';

const MachineModel = dynamic(
  () => import('@/components/three/MachineModel'),
  { ssr: false, loading: () => <div className="h-[500px] flex items-center justify-center"><LoadingSpinner /></div> }
);

interface ServiceRequest {
  id: string;
  request_number: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  machine_id?: string;
  machines?: { code: string; name: string; type?: string };
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
  visual_diagnosis: VisualDiagnosis;
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

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LOW: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING_REVIEW: 'bg-amber-500/20 text-amber-400',
  REVIEWING: 'bg-blue-500/20 text-blue-400',
  DIAGNOSIS_COMPLETE: 'bg-emerald-500/20 text-emerald-400',
  CLOSED: 'bg-slate-500/20 text-slate-400',
};

export default function VisualDiagnosisPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedSR, setSelectedSR] = useState<ServiceRequest | null>(null);
  const [diagnosis, setDiagnosis] = useState<VisualDiagnosis | null>(null);
  const [threeData, setThreeData] = useState<ThreeDData | null>(null);
  const [techDiagnoses, setTechDiagnoses] = useState<TechDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosing, setDiagnosing] = useState(false);
  const [sensorData, setSensorData] = useState<SensorData | undefined>();
  const [selectedComponent, setSelectedComponent] = useState<MachineComponent | null>(null);
  const [showDiagForm, setShowDiagForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expandedAnalysis, setExpandedAnalysis] = useState(true);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';
  const isTechnician = user?.role === 'TECHNICIAN';

  const [diagForm, setDiagForm] = useState({
    diagnosis_text: '',
    proposed_solution: '',
    estimated_hours: '',
    estimated_cost: '',
    confidence_level: 'MEDIUM',
  });

  useEffect(() => { loadRequests(); }, []);

  async function loadRequests() {
    try {
      const res = await api.get<any>('/api/service-requests');
      const srs = res?.service_requests ?? res?.data ?? [];
      const withMachine = srs.filter((sr: any) => sr.machine_id);
      setRequests(withMachine);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load service requests');
    } finally {
      setLoading(false);
    }
  }

  async function selectRequest(sr: ServiceRequest) {
    setSelectedSR(sr);
    setDiagnosis(null);
    setThreeData(null);
    setTechDiagnoses([]);
    setSelectedComponent(null);
    setSensorData(undefined);

    if (sr.machine_id) {
      api.get<any>(`/api/machines/${sr.machine_id}`).then((m: any) => {
        const machine = m?.machine ?? m;
        if (machine) {
          setSensorData({
            air_temp: machine.air_temp,
            process_temp: machine.process_temp,
            rotational_speed: machine.rotational_speed,
            torque: machine.torque,
            tool_wear: machine.tool_wear,
          });
        }
      }).catch(() => {});
    }

    try {
      const res = await api.get<any>(`/api/visual-diagnoses/${sr.id}`);
      const vd: VisualDiagnosis | null = res?.visual_diagnosis ?? null;
      setDiagnosis(vd);

      if (vd) {
        await load3dData(vd.id);
        if (isAdmin) await loadTechDiagnoses(vd.id);
      }
    } catch {
      // No diagnosis yet — that's fine
    }
  }

  async function load3dData(diagnosisId: string) {
    try {
      const res = await api.get<any>(`/api/visual-diagnoses/${diagnosisId}/3d-data`);
      setThreeData(res);
    } catch { /* components might not be seeded */ }
  }

  async function loadTechDiagnoses(diagnosisId: string) {
    try {
      const res = await api.get<any>(`/api/technician-diagnoses/${diagnosisId}`);
      setTechDiagnoses(res?.technician_diagnoses ?? []);
    } catch { /* none yet */ }
  }

  async function runDiagnosis() {
    if (!selectedSR) return;
    setDiagnosing(true);
    try {
      const res = await api.post<any>('/api/visual-diagnoses', {
        service_request_id: selectedSR.id,
      });
      const vd = res?.visual_diagnosis;
      toast.success('AI diagnosis complete');
      setDiagnosis(vd);
      if (vd?.id) await load3dData(vd.id);
    } catch (err: any) {
      toast.error(err.message || 'Diagnosis failed');
    } finally {
      setDiagnosing(false);
    }
  }

  async function submitTechDiagnosis() {
    if (!diagnosis) return;
    setSubmitting(true);
    try {
      await api.post('/api/technician-diagnoses', {
        visual_diagnosis_id: diagnosis.id,
        diagnosis_text: diagForm.diagnosis_text,
        proposed_solution: diagForm.proposed_solution,
        estimated_hours: diagForm.estimated_hours ? Number(diagForm.estimated_hours) : undefined,
        estimated_cost: diagForm.estimated_cost ? Number(diagForm.estimated_cost) : undefined,
        confidence_level: diagForm.confidence_level,
      });
      toast.success('Diagnosis submitted');
      setShowDiagForm(false);
      setDiagForm({ diagnosis_text: '', proposed_solution: '', estimated_hours: '', estimated_cost: '', confidence_level: 'MEDIUM' });
      if (isAdmin) await loadTechDiagnoses(diagnosis.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  async function selectWinningDiagnosis(diagId: string) {
    try {
      await api.put(`/api/technician-diagnoses/${diagId}/select`);
      toast.success('Diagnosis selected');
      if (diagnosis) await loadTechDiagnoses(diagnosis.id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to select');
    }
  }

  const analysis = diagnosis?.ai_analysis;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20">
            <Eye className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">
              3D Visual Diagnosis
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              AI-powered component analysis & remote expert review
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left sidebar — Request selector */}
        <div className="xl:col-span-3 space-y-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-3">
              <Search className="w-4 h-4 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text-secondary)]">
                Service Requests ({requests.length})
              </span>
            </div>
            <div className="space-y-1.5 max-h-[calc(100vh-260px)] overflow-y-auto">
              {requests.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] py-4 text-center">
                  No requests with machines found
                </p>
              ) : (
                requests.map((sr) => (
                  <button
                    key={sr.id}
                    onClick={() => selectRequest(sr)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all text-sm ${
                      selectedSR?.id === sr.id
                        ? 'bg-purple-500/10 border border-purple-500/30 ring-1 ring-purple-500/20'
                        : 'bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-xs text-[var(--text-muted)]">
                        {sr.request_number}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${PRIORITY_COLORS[sr.priority] ?? ''}`}>
                        {sr.priority}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-primary)] truncate">{sr.title}</p>
                    {sr.machines && (
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5 flex items-center gap-1">
                        <Cpu className="w-3 h-3" />
                        {sr.machines.name}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Center — 3D Viewer */}
        <div className="xl:col-span-5">
          <Card className="overflow-hidden">
            {!selectedSR ? (
              <EmptyState
                icon={<Eye className="w-12 h-12 text-purple-500/40" />}
                title="Select a Service Request"
                description="Choose a request with a linked machine to view the 3D diagnosis"
              />
            ) : (
              <>
                <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      {selectedSR.machines?.name ?? 'Machine'}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)]">
                      {selectedSR.machines?.code} · {selectedSR.request_number}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {diagnosis && (
                      <Badge className={STATUS_COLORS[diagnosis.status] ?? ''}>
                        {(diagnosis.status ?? '').replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {isAdmin && !diagnosis && (
                      <Button
                        onClick={runDiagnosis}
                        disabled={diagnosing}
                        className="text-xs"
                      >
                        {diagnosing ? (
                          <><LoadingSpinner /> Analyzing...</>
                        ) : (
                          <><Zap className="w-3.5 h-3.5" /> Run AI Diagnosis</>
                        )}
                      </Button>
                    )}
                    {isAdmin && diagnosis && (
                      <Button
                        onClick={runDiagnosis}
                        disabled={diagnosing}
                        variant="secondary"
                        className="text-xs"
                      >
                        {diagnosing ? 'Analyzing...' : 'Re-analyze'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="relative bg-gradient-to-b from-[#0a0e1a] to-[#0d1117]">
                  <MachineModel
                    health={diagnosis ? (analysis?.severity_assessment === 'CRITICAL' ? 20 : analysis?.severity_assessment === 'HIGH' ? 40 : 70) : 85}
                    machineType={selectedSR.machines?.type}
                    sensorData={sensorData}
                    components={threeData?.components ?? []}
                    highlightId={threeData?.highlight?.component_id}
                    onComponentClick={(c) => setSelectedComponent(c)}
                    className="h-[500px] w-full"
                  />
                  {/* Legend overlay */}
                  <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm rounded-lg px-3 py-2 text-[10px] space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]" />
                      <span className="text-red-400">Faulty Component</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-blue-400">Selected</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-500" />
                      <span className="text-slate-400">Normal</span>
                    </div>
                  </div>
                </div>

                {selectedComponent && (
                  <div className="p-3 border-t border-white/[0.06] bg-blue-500/5">
                    <p className="text-xs font-semibold text-blue-400 flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      {selectedComponent.component_name}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      ID: {selectedComponent.component_id} · Position: ({selectedComponent.coord_x.toFixed(1)}, {selectedComponent.coord_y.toFixed(1)}, {selectedComponent.coord_z.toFixed(1)})
                    </p>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        {/* Right panel — AI Analysis + Expert Review */}
        <div className="xl:col-span-4 space-y-4">
          {/* AI Analysis */}
          {diagnosis && analysis && (
            <Card className="overflow-hidden">
              <button
                onClick={() => setExpandedAnalysis(!expandedAnalysis)}
                className="w-full p-4 flex items-center justify-between border-b border-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-[var(--text-primary)]">AI Analysis</span>
                  <Badge className="bg-purple-500/20 text-purple-400 text-[10px]">
                    {analysis.source ?? 'ai'}
                  </Badge>
                </div>
                {expandedAnalysis ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
              </button>

              <AnimatePresence>
                {expandedAnalysis && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 space-y-3">
                      {/* Affected component */}
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10">
                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-red-400">Affected Component</p>
                          <p className="text-sm text-[var(--text-primary)]">{diagnosis.component_name}</p>
                          <p className="text-xs text-[var(--text-muted)] font-mono">{diagnosis.affected_component_id}</p>
                        </div>
                      </div>

                      {/* Severity */}
                      {analysis.severity_assessment && (
                        <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
                          <span className="text-xs text-[var(--text-muted)]">Severity</span>
                          <Badge className={PRIORITY_COLORS[analysis.severity_assessment] ?? 'bg-slate-500/20 text-slate-400'}>
                            {analysis.severity_assessment}
                          </Badge>
                        </div>
                      )}

                      {/* Failure analysis */}
                      {analysis.failure_analysis && (
                        <div>
                          <p className="text-xs font-medium text-[var(--text-muted)] mb-1">Failure Analysis</p>
                          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                            {analysis.failure_analysis}
                          </p>
                        </div>
                      )}

                      {/* Diagnostic questions */}
                      {analysis.diagnostic_questions?.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-[var(--text-muted)] mb-1.5">Diagnostic Questions</p>
                          <ul className="space-y-1">
                            {analysis.diagnostic_questions.map((q: string, i: number) => (
                              <li key={i} className="text-xs text-[var(--text-secondary)] flex items-start gap-1.5">
                                <span className="text-purple-400 font-mono mt-0.5">{i + 1}.</span>
                                {q}
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

          {/* Technician Diagnosis Form */}
          {isTechnician && diagnosis && (
            <Card className="p-4">
              {!showDiagForm ? (
                <Button onClick={() => setShowDiagForm(true)} className="w-full text-sm">
                  <Send className="w-4 h-4" /> Submit Your Diagnosis
                </Button>
              ) : (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-400" /> Remote Diagnosis
                  </h4>
                  <textarea
                    placeholder="Your diagnosis of the issue..."
                    value={diagForm.diagnosis_text}
                    onChange={(e) => setDiagForm({ ...diagForm, diagnosis_text: e.target.value })}
                    className="w-full p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none h-20 focus:outline-none focus:border-blue-500/40"
                  />
                  <textarea
                    placeholder="Proposed solution..."
                    value={diagForm.proposed_solution}
                    onChange={(e) => setDiagForm({ ...diagForm, proposed_solution: e.target.value })}
                    className="w-full p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] resize-none h-20 focus:outline-none focus:border-blue-500/40"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Est. hours"
                      value={diagForm.estimated_hours}
                      onChange={(e) => setDiagForm({ ...diagForm, estimated_hours: e.target.value })}
                      className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/40"
                    />
                    <input
                      type="number"
                      placeholder="Est. cost (₹)"
                      value={diagForm.estimated_cost}
                      onChange={(e) => setDiagForm({ ...diagForm, estimated_cost: e.target.value })}
                      className="p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-blue-500/40"
                    />
                  </div>
                  <select
                    value={diagForm.confidence_level}
                    onChange={(e) => setDiagForm({ ...diagForm, confidence_level: e.target.value })}
                    className="w-full p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-[var(--text-primary)] focus:outline-none focus:border-blue-500/40"
                  >
                    <option value="HIGH">High Confidence</option>
                    <option value="MEDIUM">Medium Confidence</option>
                    <option value="LOW">Low Confidence</option>
                  </select>
                  <div className="flex gap-2">
                    <Button onClick={submitTechDiagnosis} disabled={submitting || !diagForm.diagnosis_text || !diagForm.proposed_solution} className="flex-1 text-xs">
                      {submitting ? 'Submitting...' : 'Submit'}
                    </Button>
                    <Button variant="secondary" onClick={() => setShowDiagForm(false)} className="text-xs">Cancel</Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Expert review panel (Admin/Ops) */}
          {isAdmin && techDiagnoses.length > 0 && (
            <Card className="overflow-hidden">
              <div className="p-4 border-b border-white/[0.06]">
                <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <User className="w-4 h-4 text-emerald-400" />
                  Expert Diagnoses ({techDiagnoses.length})
                </h4>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
                {techDiagnoses.map((td) => (
                  <div key={td.id} className={`p-4 ${td.is_selected ? 'bg-emerald-500/5 border-l-2 border-emerald-500' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          {td.technicians?.users?.full_name ?? td.technicians?.employee_code ?? 'Technician'}
                        </span>
                        <Badge className={
                          td.confidence_level === 'HIGH' ? 'bg-emerald-500/20 text-emerald-400' :
                          td.confidence_level === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-500/20 text-slate-400'
                        }>
                          {td.confidence_level}
                        </Badge>
                      </div>
                      {td.is_selected ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Selected
                        </Badge>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => selectWinningDiagnosis(td.id)}
                          className="text-[11px] py-1 px-2"
                        >
                          Select
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] mb-1">{td.diagnosis_text}</p>
                    <p className="text-xs text-blue-400 mb-2">Solution: {td.proposed_solution}</p>
                    <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                      {td.estimated_hours && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {td.estimated_hours}h
                        </span>
                      )}
                      {td.estimated_cost && (
                        <span>₹{Number(td.estimated_cost).toLocaleString()}</span>
                      )}
                      <span>{new Date(td.submitted_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Empty state for right panel */}
          {!diagnosis && selectedSR && (
            <Card className="p-6">
              <EmptyState
                icon={<Cpu className="w-10 h-10 text-purple-500/40" />}
                title="No Diagnosis Yet"
                description={isAdmin ? 'Click "Run AI Diagnosis" to analyze this machine' : 'Waiting for ops to initiate AI diagnosis'}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
