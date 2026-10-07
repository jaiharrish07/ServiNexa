'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  BarChart3,
  Clock,
  ShieldCheck,
  Users,
  PackageSearch,
  Loader2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Timer,
  ArrowRightLeft,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DashboardReport {
  total_requests: number;
  open_requests: number;
  in_progress: number;
  completed: number;
  avg_resolution_hours: number;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_category?: Record<string, number>;
}

interface SLAReport {
  compliance_percentage: number;
  total: number;
  met: number;
  breached: number;
  at_risk: number;
  on_track: number;
}

interface MTTRReport {
  overall_mttr_hours: number;
  by_category: Record<string, number>;
  by_priority: Record<string, number>;
}

interface TechUtil {
  technician_id: string;
  name: string;
  employee_code: string;
  utilization_pct: number;
  current_jobs: number;
  max_jobs: number;
  avg_resolution_hours: number;
  rating: number;
}

interface PartsRebalance {
  part_name: string;
  part_number: string;
  from_site: string;
  to_site: string;
  quantity: number;
  reason: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const CHART_COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#22c55e', '#ec4899', '#8b5cf6', '#14b8a6'];
const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MEDIUM: '#f59e0b',
  HIGH: '#f97316',
  CRITICAL: '#ef4444',
};

const glassCard =
  'rounded-2xl border border-[#2a3050] bg-gradient-to-br from-[#111827]/80 to-[#1a1f2e]/60 backdrop-blur-xl p-6';

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.12, duration: 0.5, ease: 'easeOut' as const },
  }),
};

/* ------------------------------------------------------------------ */
/*  Custom Tooltip                                                     */
/* ------------------------------------------------------------------ */

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#2a3050] bg-[#111827] px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-gray-100">{label}</p>
      <p className="text-indigo-400">{payload[0].value}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SLA Gauge                                                          */
/* ------------------------------------------------------------------ */

function SLAGauge({ value }: { value: number }) {
  const color = value >= 90 ? '#22c55e' : value >= 70 ? '#f59e0b' : '#ef4444';
  const data = [{ name: 'SLA', value, fill: color }];
  return (
    <div className="flex flex-col items-center">
      <RadialBarChart
        width={180}
        height={180}
        innerRadius="70%"
        outerRadius="100%"
        data={data}
        startAngle={180}
        endAngle={0}
        barSize={14}
      >
        <RadialBar dataKey="value" cornerRadius={8} background={{ fill: '#1e293b' }} />
      </RadialBarChart>
      <p className="text-3xl font-bold -mt-16" style={{ color }}>
        {value.toFixed(1)}%
      </p>
      <p className="text-sm text-gray-400 mt-1">SLA Compliance</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [sla, setSla] = useState<SLAReport | null>(null);
  const [mttr, setMttr] = useState<MTTRReport | null>(null);
  const [utilization, setUtilization] = useState<TechUtil[]>([]);
  const [rebalance, setRebalance] = useState<PartsRebalance[]>([]);

  const isAllowed = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';

  useEffect(() => {
    if (!isAllowed) return;
    const load = async () => {
      setLoading(true);
      try {
        const [dash, slaData, mttrData, utilData, rebalData] = await Promise.allSettled([
          api.get<any>('/api/reports/dashboard'),
          api.get<any>('/api/reports/sla'),
          api.get<any>('/api/reports/mttr'),
          api.get<any>('/api/reports/utilization'),
          api.get<any>('/api/reports/parts-rebalance'),
        ]);

        // Dashboard: unwrap { dashboard: { service_requests, machines, ... } }
        if (dash.status === 'fulfilled') {
          const inner = dash.value?.dashboard ?? dash.value ?? {};
          const sr = inner?.service_requests ?? {};
          const byStatus = sr?.by_status ?? {};
          setDashboard({
            total_requests: sr?.total ?? 0,
            open_requests: sr?.active ?? 0,
            in_progress: byStatus['IN_PROGRESS'] ?? 0,
            completed:
              (byStatus['COMPLETED'] ?? 0) +
              (byStatus['CLOSED'] ?? 0) +
              (byStatus['VERIFIED'] ?? 0),
            avg_resolution_hours: 0,
            by_status: byStatus,
            by_priority: {},
          });
        }

        // SLA: unwrap { sla_report: { total, met, breached, at_risk, compliance_rate, ... } }
        if (slaData.status === 'fulfilled') {
          const rawSla = slaData.value?.sla_report ?? slaData.value ?? {};
          setSla({
            compliance_percentage: rawSla?.compliance_rate ?? 0,
            total: rawSla?.total ?? 0,
            met: rawSla?.met ?? 0,
            breached: rawSla?.breached ?? 0,
            at_risk: rawSla?.at_risk ?? 0,
            on_track: 0,
          });
        }

        // MTTR: unwrap { mttr_report: { mttr_hours, by_priority: { K: {count, mttr_hours} }, ... } }
        if (mttrData.status === 'fulfilled') {
          const rawMttr = mttrData.value?.mttr_report ?? mttrData.value ?? {};
          const byPriority: Record<string, number> = {};
          for (const [key, val] of Object.entries(rawMttr?.by_priority ?? {})) {
            byPriority[key] = (val as any)?.mttr_hours ?? (typeof val === 'number' ? val : 0);
          }
          const byCategory: Record<string, number> = {};
          for (const [key, val] of Object.entries(rawMttr?.by_category ?? {})) {
            byCategory[key] = (val as any)?.mttr_hours ?? (typeof val === 'number' ? val : 0);
          }
          setMttr({
            overall_mttr_hours: rawMttr?.mttr_hours ?? 0,
            by_category: byCategory,
            by_priority: byPriority,
          });
        }

        // Utilization: unwrap { utilization_report: { technicians: [...], summary } }
        if (utilData.status === 'fulfilled') {
          const rawUtil = utilData.value?.utilization_report ?? utilData.value ?? {};
          const techs = rawUtil?.technicians ?? rawUtil?.data ?? [];
          setUtilization(
            (Array.isArray(techs) ? techs : []).map((t: any) => ({
              technician_id: t?.technician_id ?? '',
              name: t?.name ?? 'Unknown',
              employee_code: t?.employee_code ?? '',
              utilization_pct: t?.utilization_pct ?? 0,
              current_jobs: t?.current_job_count ?? t?.current_jobs ?? 0,
              max_jobs: t?.max_concurrent_jobs ?? t?.max_jobs ?? 0,
              avg_resolution_hours: t?.avg_resolution_hours ?? 0,
              rating: t?.rating ?? 0,
            })),
          );
        }

        // Parts rebalance: unwrap { suggestions: [...] }
        if (rebalData.status === 'fulfilled') {
          const rawRebal = rebalData.value?.suggestions ?? rebalData.value?.data ?? [];
          setRebalance(Array.isArray(rawRebal) ? rawRebal : []);
        }
      } catch {
        toast.error('Failed to load reports');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isAllowed]);

  if (!isAllowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]">
        <EmptyState
          icon={<AlertCircle size={20} />}
          title="Access Denied"
          description="Reports are available to Admin and Operations Manager roles only."
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a]">
        <LoadingSpinner />
      </div>
    );
  }

  /* -- data transforms -- */
  const statusData = dashboard
    ? Object.entries(dashboard.by_status || {}).map(([name, value]) => ({ name, value }))
    : [];

  const priorityData = dashboard
    ? Object.entries(dashboard.by_priority || {}).map(([name, value]) => ({ name, value }))
    : [];

  const mttrCategoryData = mttr
    ? Object.entries(mttr.by_category || {}).map(([name, value]) => ({ name, hours: Number((value ?? 0).toFixed(1)) }))
    : [];

  const mttrPriorityData = mttr
    ? Object.entries(mttr.by_priority || {}).map(([name, value]) => ({ name, hours: Number((value ?? 0).toFixed(1)) }))
    : [];

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3">
          <BarChart3 className="text-indigo-400" size={28} />
          Reports &amp; Analytics
        </h1>
        <p className="mt-2 text-gray-400">
          Comprehensive operational metrics, SLA tracking, and resource utilization insights.
        </p>
      </motion.div>

      <div className="space-y-6">
        {/* -------- Dashboard Overview -------- */}
        {dashboard && (
          <motion.section
            custom={0}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className={glassCard}
          >
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-indigo-400" /> Dashboard Overview
            </h2>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 mb-6">
              <StatCard title="Total Requests" value={dashboard.total_requests} icon={<BarChart3 size={20} />} color="purple" />
              <StatCard title="Open" value={dashboard.open_requests} icon={<AlertCircle size={20} />} color="amber" />
              <StatCard title="In Progress" value={dashboard.in_progress} icon={<Clock size={20} />} color="cyan" />
              <StatCard title="Completed" value={dashboard.completed} icon={<CheckCircle2 size={20} />} color="emerald" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Status bar chart */}
              <div>
                <p className="text-sm font-medium text-gray-400 mb-3">By Status</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#9ca3af', fontSize: 11 }} width={100} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {statusData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Priority donut */}
              <div>
                <p className="text-sm font-medium text-gray-400 mb-3">By Priority</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={priorityData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      strokeWidth={0}
                    >
                      {priorityData.map((entry) => (
                        <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6366f1'} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value: string) => <span className="text-xs text-gray-300">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.section>
        )}

        {/* -------- SLA Report -------- */}
        {sla && (
          <motion.section
            custom={1}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className={glassCard}
          >
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <ShieldCheck size={20} className="text-emerald-400" /> SLA Compliance
            </h2>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="flex justify-center">
                <SLAGauge value={sla.compliance_percentage ?? 0} />
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Met', value: sla.met ?? 0, variant: 'success' as const },
                  { label: 'On Track', value: sla.on_track ?? 0, variant: 'info' as const },
                  { label: 'At Risk', value: sla.at_risk ?? 0, variant: 'warning' as const },
                  { label: 'Breached', value: sla.breached ?? 0, variant: 'danger' as const },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-lg border border-[#2a3050] bg-[#0a0e1a]/40 px-4 py-3"
                  >
                    <span className="text-sm text-gray-300">{item.label}</span>
                    <Badge variant={item.variant}>{item.value}</Badge>
                  </div>
                ))}
                <p className="text-xs text-gray-500 text-right">Total: {sla.total ?? 0} requests</p>
              </div>
            </div>
          </motion.section>
        )}

        {/* -------- MTTR Report -------- */}
        {mttr && (
          <motion.section
            custom={2}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className={glassCard}
          >
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <Timer size={20} className="text-cyan-400" /> Mean Time to Resolve
            </h2>

            <div className="mb-6 flex items-baseline gap-2">
              <span className="text-4xl font-bold text-cyan-400">
                {(mttr.overall_mttr_hours ?? 0).toFixed(1)}
              </span>
              <span className="text-sm text-gray-400">hours avg</span>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-gray-400 mb-3">By Category</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={mttrCategoryData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                      {mttrCategoryData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-400 mb-3">By Priority</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={mttrPriorityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                      {mttrPriorityData.map((entry) => (
                        <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name] || '#6366f1'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.section>
        )}

        {/* -------- Technician Utilization -------- */}
        {utilization.length > 0 && (
          <motion.section
            custom={3}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className={glassCard}
          >
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <Users size={20} className="text-violet-400" /> Technician Utilization
            </h2>

            <div className="space-y-3">
              {utilization.map((tech) => {
                const pct = tech.utilization_pct ?? 0;
                const barColor =
                  pct > 90
                    ? '#ef4444'
                    : pct > 70
                    ? '#f59e0b'
                    : '#22c55e';
                return (
                  <div
                    key={tech.technician_id}
                    className="rounded-lg border border-[#2a3050] bg-[#0a0e1a]/40 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-medium text-gray-100">{tech.name}</p>
                        <p className="text-xs text-gray-500">{tech.employee_code}</p>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <p className="text-xs text-gray-500">Jobs</p>
                          <p className="text-sm text-gray-300">
                            {tech.current_jobs ?? 0}/{tech.max_jobs ?? 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Avg hrs</p>
                          <p className="text-sm text-gray-300">
                            {(tech.avg_resolution_hours ?? 0).toFixed(1)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Rating</p>
                          <p className="text-sm text-amber-400">
                            {(tech.rating ?? 0).toFixed(1)} &#9733;
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#1e293b]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: barColor }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(tech.utilization_pct ?? 0, 100)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' as const }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-right" style={{ color: barColor }}>
                      {(tech.utilization_pct ?? 0).toFixed(0)}% utilization
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}

        {/* -------- Parts Rebalance -------- */}
        {rebalance.length > 0 && (
          <motion.section
            custom={4}
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
            className={glassCard}
          >
            <h2 className="text-xl font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <PackageSearch size={20} className="text-teal-400" /> Parts Rebalance Suggestions
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3050] text-left text-gray-400">
                    <th className="pb-3 pr-4 font-medium">Part</th>
                    <th className="pb-3 pr-4 font-medium">From</th>
                    <th className="pb-3 pr-4 font-medium">To</th>
                    <th className="pb-3 pr-4 font-medium text-right">Qty</th>
                    <th className="pb-3 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3050]/50">
                  {rebalance.map((r, i) => (
                    <tr key={i} className="text-gray-300">
                      <td className="py-3 pr-4 font-medium text-gray-100">
                        {r.part_name}
                        <span className="ml-2 text-xs text-gray-500">{r.part_number}</span>
                      </td>
                      <td className="py-3 pr-4">{r.from_site}</td>
                      <td className="py-3 pr-4">
                        <span className="flex items-center gap-1">
                          <ArrowRightLeft size={12} className="text-teal-400" />
                          {r.to_site}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <Badge variant="info">{r.quantity}</Badge>
                      </td>
                      <td className="py-3 text-xs text-gray-400">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}
      </div>
    </div>
  );
}
