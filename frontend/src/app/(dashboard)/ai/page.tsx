'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Brain,
  HeartPulse,
  Users,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  Loader2,
  ShieldCheck,
  Zap,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Machine, ServiceRequest, Site } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ClassifyResult {
  category: string;
  priority: string;
  confidence: number;
  source: string;
}

interface PredictResult {
  machine_id?: string;
  machine_code?: string;
  health_score: number;
  risk_level: string;
  recommendations?: string[];
  source: string;
}

interface RankedTechnician {
  technician_id: string;
  name: string;
  score: number;
  specializations?: string[];
}

interface MatchResult {
  ranked_technicians: RankedTechnician[];
  source: string;
}

interface Anomaly {
  id: string;
  machine_id?: string;
  machine_name?: string;
  description: string;
  severity: string;
  detected_at?: string;
}

interface AnomalyResult {
  anomalies: Anomaly[];
  source: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const glassCard =
  'relative rounded-2xl border border-[#2a3050] bg-gradient-to-br from-[#111827]/80 to-[#1a1f2e]/60 backdrop-blur-xl p-6 overflow-hidden';

function SourceBadge({ source }: { source: string }) {
  return (
    <Badge variant={source === 'ai' ? 'success' : 'info'}>
      {source === 'ai' ? 'AI' : 'Stub'}
    </Badge>
  );
}

function AnimatedBorder() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 rounded-2xl"
      style={{
        background:
          'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(236,72,153,0.18), rgba(34,211,238,0.2))',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMask:
          'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        maskComposite: 'exclude',
        WebkitMaskComposite: 'xor',
        padding: '1.5px',
      }}
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' as const }}
    />
  );
}

function CircularProgress({
  value,
  size = 120,
  strokeWidth = 10,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value > 80 ? '#22c55e' : value > 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: 'easeOut' as const }}
        />
      </svg>
      <span
        className="absolute text-2xl font-bold"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

const resultVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease: 'easeOut' as const } },
  exit: { opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.2 } },
};

/* ------------------------------------------------------------------ */
/*  Request Classifier                                                 */
/* ------------------------------------------------------------------ */

function RequestClassifier() {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClassifyResult | null>(null);

  const classify = async () => {
    if (!description.trim()) {
      toast.error('Enter a service request description');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.post<ClassifyResult>('/api/ai/classify', { description });
      setResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Classification failed');
    } finally {
      setLoading(false);
    }
  };

  const priorityVariant = (p: string) => {
    const map: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
      CRITICAL: 'danger',
      HIGH: 'danger',
      MEDIUM: 'warning',
      LOW: 'info',
    };
    return map[p] || 'default';
  };

  return (
    <div className={glassCard}>
      <AnimatedBorder />
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
          <Brain size={22} />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">Request Classifier</h3>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the service request..."
        rows={3}
        className="w-full rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none"
      />

      <Button onClick={classify} loading={loading} className="mt-3 w-full">
        <Sparkles size={16} className="mr-2" />
        Classify
      </Button>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="classify-result"
            variants={resultVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mt-4 rounded-xl border border-[#2a3050] bg-[#0a0e1a]/60 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Source</span>
              <SourceBadge source={result?.source ?? 'stub'} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Category</span>
              <Badge variant="info">{result?.category ?? 'N/A'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Priority</span>
              <Badge variant={priorityVariant(result?.priority ?? '')}>{result?.priority ?? 'N/A'}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Confidence</span>
              <span className="text-sm font-semibold text-gray-100">
                {((result?.confidence ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Machine Health Predictor                                           */
/* ------------------------------------------------------------------ */

function MachineHealthPredictor() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PredictResult | null>(null);

  useEffect(() => {
    api.get<{ machines?: Machine[] }>('/api/machines').then((r) => setMachines(r?.machines ?? [])).catch(() => {});
  }, []);

  const predict = async () => {
    if (!selectedId) {
      toast.error('Select a machine first');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.post<PredictResult>('/api/ai/predict', { machine_id: selectedId });
      setResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const riskVariant = (r: string) => {
    const map: Record<string, 'success' | 'warning' | 'danger'> = {
      LOW: 'success',
      MEDIUM: 'warning',
      HIGH: 'danger',
      CRITICAL: 'danger',
    };
    return map[r] || 'default' as const;
  };

  return (
    <div className={glassCard}>
      <AnimatedBorder />
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
          <HeartPulse size={22} />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">Machine Health Predictor</h3>
      </div>

      <div className="relative">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-4 py-3 pr-10 text-sm text-gray-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
        >
          <option value="">Select a machine...</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} &mdash; {m.name}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
      </div>

      <Button onClick={predict} loading={loading} className="mt-3 w-full">
        <Zap size={16} className="mr-2" />
        Predict Health
      </Button>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="predict-result"
            variants={resultVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mt-4 rounded-xl border border-[#2a3050] bg-[#0a0e1a]/60 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">Source</span>
              <SourceBadge source={result.source} />
            </div>
            <div className="flex items-center gap-6">
              <CircularProgress value={result?.health_score ?? 0} />
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">Risk Level</span>
                  <Badge variant={riskVariant(result?.risk_level ?? 'UNKNOWN')}>{result?.risk_level ?? 'UNKNOWN'}</Badge>
                </div>
                <p className="text-xs text-gray-500">Health Score</p>
              </div>
            </div>
            {(result?.recommendations ?? []).length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium text-gray-300">Recommendations</p>
                {(result.recommendations ?? []).map((rec, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="flex items-start gap-2 text-sm text-gray-400"
                  >
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                    <span>{rec}</span>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Technician Matcher                                                 */
/* ------------------------------------------------------------------ */

function TechnicianMatcher() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);

  useEffect(() => {
    api.get<{ service_requests?: ServiceRequest[] }>('/api/service-requests').then((r) => setRequests(r?.service_requests ?? [])).catch(() => {});
  }, []);

  const match = async () => {
    if (!selectedId) {
      toast.error('Select a service request first');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const data = await api.post<MatchResult>('/api/ai/match', { service_request_id: selectedId });
      setResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Matching failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={glassCard}>
      <AnimatedBorder />
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 text-violet-400">
          <Users size={22} />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">Technician Matcher</h3>
      </div>

      <div className="relative">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-4 py-3 pr-10 text-sm text-gray-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
        >
          <option value="">Select a service request...</option>
          {requests.map((r) => (
            <option key={r.id} value={r.id}>
              {r.request_number} &mdash; {r.title}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
      </div>

      <Button onClick={match} loading={loading} className="mt-3 w-full">
        <Target size={16} className="mr-2" />
        Find Best Match
      </Button>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="match-result"
            variants={resultVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mt-4 space-y-2"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-300">Ranked Technicians</p>
              <SourceBadge source={result?.source ?? 'stub'} />
            </div>
            {(result?.ranked_technicians ?? []).map((m, i) => (
              <motion.div
                key={m?.technician_id ?? i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * i }}
                className="flex items-center gap-3 rounded-lg border border-[#2a3050] bg-[#0a0e1a]/60 p-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-300">
                  #{i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 truncate">{m?.name ?? 'Unknown'}</p>
                  {(m?.specializations ?? []).length > 0 && (
                    <p className="text-xs text-gray-500 truncate">{m.specializations!.join(', ')}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-violet-400">{m?.score ?? 0}</p>
                  <p className="text-xs text-gray-500">score</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Anomaly Detector                                                   */
/* ------------------------------------------------------------------ */

function AnomalyDetector() {
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnomalyResult | null>(null);

  useEffect(() => {
    api.get<{ sites?: Site[] }>('/api/sites').then((r) => setSites(r?.sites ?? [])).catch(() => {});
  }, []);

  const detect = async () => {
    setLoading(true);
    setResult(null);
    try {
      const body: Record<string, string> = {};
      if (siteId) body.site_id = siteId;
      const data = await api.post<AnomalyResult>('/api/ai/anomalies', body);
      setResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Detection failed');
    } finally {
      setLoading(false);
    }
  };

  const severityVariant = (s: string) => {
    const map: Record<string, 'danger' | 'warning' | 'info' | 'default'> = {
      CRITICAL: 'danger',
      HIGH: 'danger',
      MEDIUM: 'warning',
      LOW: 'info',
    };
    return map[s] || 'default';
  };

  return (
    <div className={glassCard}>
      <AnimatedBorder />
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
          <AlertTriangle size={22} />
        </div>
        <h3 className="text-lg font-semibold text-gray-100">Anomaly Detector</h3>
      </div>

      <div className="relative">
        <select
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          className="w-full appearance-none rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-4 py-3 pr-10 text-sm text-gray-100 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
        >
          <option value="">All sites (optional filter)</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} &mdash; {s.name}
            </option>
          ))}
        </select>
        <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
      </div>

      <Button onClick={detect} loading={loading} className="mt-3 w-full">
        <AlertTriangle size={16} className="mr-2" />
        Detect Anomalies
      </Button>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key="anomaly-result"
            variants={resultVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="mt-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-300">Results</p>
              <SourceBadge source={result?.source ?? 'stub'} />
            </div>
            {(result?.anomalies ?? []).length === 0 ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                <ShieldCheck size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-300">No anomalies detected</p>
                <p className="text-xs text-gray-500 mt-1">All systems operating normally</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(result?.anomalies ?? []).map((a, i) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * i }}
                    className="rounded-lg border border-[#2a3050] bg-[#0a0e1a]/60 p-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-100">
                        {a?.machine_name || (a?.machine_id ? `Machine ${a.machine_id}` : 'Unknown Machine')}
                      </span>
                      <Badge variant={severityVariant(a?.severity ?? '')}>{a?.severity ?? 'UNKNOWN'}</Badge>
                    </div>
                    <p className="text-xs text-gray-400">{a?.description ?? ''}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AIInsightsPage() {
  return (
    <div className="min-h-screen bg-[#0a0e1a] p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3">
          <Sparkles className="text-indigo-400" size={28} />
          AI Insights Hub
        </h1>
        <p className="mt-2 text-gray-400">
          Leverage machine learning to classify requests, predict equipment health, match
          technicians, and detect anomalies.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <RequestClassifier />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <MachineHealthPredictor />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <TechnicianMatcher />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <AnomalyDetector />
        </motion.div>
      </div>
    </div>
  );
}
