'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  AlertCircle,
  Loader,
  CheckCircle2,
  Clock,
  Shield,
  Filter,
  X,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { DashboardStats, HeatmapCard, StatusColor } from '@/lib/types';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLA_COLORS: Record<StatusColor, string> = {
  GREEN: '#10b981',
  YELLOW: '#f59e0b',
  ORANGE: '#f97316',
  RED: '#ef4444',
  BLACK: '#991b1b',
};

const STATUS_PIE_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  SUBMITTED: '#3b82f6',
  VALIDATING: '#eab308',
  PENDING_APPROVAL: '#f59e0b',
  APPROVED: '#2563eb',
  ASSIGNED: '#6366f1',
  BIDDING: '#8b5cf6',
  BID_REVIEW: '#a855f7',
  BID_ACCEPTED: '#7c3aed',
  IN_PROGRESS: '#06b6d4',
  COMPLETED: '#10b981',
  VERIFIED: '#059669',
  CLOSED: '#475569',
  EXCEPTION: '#ef4444',
};

const PRIORITY_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'success',
};

const ALLOWED_ROLES = ['ADMIN', 'OPS_MANAGER'];

// ---------------------------------------------------------------------------
// Helper – gradient bar defs
// ---------------------------------------------------------------------------
const GradientDefs = () => (
  <defs>
    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.9} />
    </linearGradient>
  </defs>
);

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-sm">
      <p className="text-[var(--text-secondary)]">{label}</p>
      <p className="font-semibold text-[var(--text-primary)]">{payload[0].value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [slaFilter, setSlaFilter] = useState<string>('ALL');

  const hasAccess = user && ALLOWED_ROLES.includes(user.role);

  // ---- Fetch data ----
  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const [dashRaw, heatRaw] = await Promise.all([
          api.get<any>('/api/reports/dashboard'),
          api.get<any>('/api/dashboard/sla-heatmap'),
        ]);

        // Unwrap from { dashboard: { service_requests, machines, ... } }
        const inner = dashRaw?.dashboard ?? dashRaw ?? {};
        const sr = inner?.service_requests ?? {};
        const byStatus = sr?.by_status ?? {};

        const transformed: DashboardStats = {
          total_requests: sr?.total ?? 0,
          open_requests: sr?.active ?? 0,
          in_progress: byStatus['IN_PROGRESS'] ?? 0,
          completed:
            (byStatus['COMPLETED'] ?? 0) +
            (byStatus['CLOSED'] ?? 0) +
            (byStatus['VERIFIED'] ?? 0),
          avg_resolution_hours: 0,
          by_priority: {},
          by_category: {},
          by_status: byStatus,
        };
        setStats(transformed);

        // Unwrap from { heatmap: [...], summary: {...}, total: n }
        const heatmapCards: HeatmapCard[] =
          heatRaw?.heatmap ?? (Array.isArray(heatRaw) ? heatRaw : []);
        setHeatmap(heatmapCards);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load dashboard data';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [hasAccess]);

  // ---- Derived data ----
  const priorityData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_priority || {}).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const statusData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_status || {}).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const filteredHeatmap = useMemo(() => {
    return heatmap.filter((c) => {
      if (priorityFilter !== 'ALL' && c.priority !== priorityFilter) return false;
      if (slaFilter !== 'ALL' && c.sla_status !== slaFilter) return false;
      return true;
    });
  }, [heatmap, priorityFilter, slaFilter]);

  const slaSummary = useMemo(() => {
    const counts: Record<string, number> = { GREEN: 0, YELLOW: 0, ORANGE: 0, RED: 0, BLACK: 0 };
    heatmap.forEach((c) => {
      if (counts[c.sla_status] !== undefined) counts[c.sla_status]++;
    });
    return counts;
  }, [heatmap]);

  // ---- SLA compliance color ----
  const slaComplianceColor = useMemo(() => {
    if (!stats) return 'emerald';
    const total = stats.total_requests || 1;
    const pct = (((stats.completed ?? 0) / total) * 100);
    if (pct > 90) return 'emerald';
    if (pct > 75) return 'amber';
    return 'red';
  }, [stats]);

  // ---- Access denied ----
  if (!hasAccess && !loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-10 text-center max-w-md"
        >
          <Shield className="w-16 h-16 text-[var(--accent-amber)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Access Restricted</h2>
          <p className="text-[var(--text-secondary)]">
            Only Admin and Ops Manager roles can view the management dashboard.
          </p>
        </motion.div>
      </div>
    );
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!stats) return null;

  const slaCompliancePct = stats.total_requests
    ? Math.round(((stats.completed ?? 0) / stats.total_requests) * 100)
    : 0;

  // ---- Animation variants ----
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
  };

  return (
    <div className="space-y-8">
      {/* ---- Page Header ---- */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold gradient-text">Operations Dashboard</h1>
        <p className="text-[var(--text-secondary)] mt-1">Real-time overview of service operations</p>
      </motion.div>

      {/* ================================================================
          TOP ROW: 6 Stat Cards
      ================================================================ */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item}>
          <StatCard title="Total Requests" value={stats.total_requests} icon={<ClipboardList size={20} />} color="blue" />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Open Requests" value={stats.open_requests} icon={<AlertCircle size={20} />} color="amber" />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="In Progress" value={stats.in_progress} icon={<Loader size={20} />} color="purple" />
        </motion.div>
        <motion.div variants={item}>
          <StatCard title="Completed" value={stats.completed} icon={<CheckCircle2 size={20} />} color="emerald" />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="Avg Resolution"
            value={`${(stats.avg_resolution_hours ?? 0).toFixed(1)}h`}
            icon={<Clock size={20} />}
            color="cyan"
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            title="SLA Compliance"
            value={`${slaCompliancePct}%`}
            icon={<Shield size={20} />}
            color={slaComplianceColor}
          />
        </motion.div>
      </motion.div>

      {/* ================================================================
          MIDDLE: Charts
      ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---- Bar Chart: By Priority ---- */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Requests by Priority</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} barSize={40}>
                <GradientDefs />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(42,48,80,0.5)" />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(59,130,246,0.08)' }} />
                <Bar dataKey="value" fill="url(#barGradient)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* ---- Pie Chart: By Status ---- */}
        <motion.div
          className="glass-card p-6"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Requests by Status</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  dataKey="value"
                  nameKey="name"
                  paddingAngle={2}
                  stroke="none"
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_PIE_COLORS[entry.name] || '#64748b'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'rgba(26,31,46,0.95)',
                    border: '1px solid rgba(59,130,246,0.2)',
                    borderRadius: 10,
                    color: '#f1f5f9',
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
                  formatter={(value: string) => <span className="text-[var(--text-secondary)]">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* ================================================================
          BOTTOM: SLA Heatmap
      ================================================================ */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">SLA Heatmap</h2>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-[var(--text-muted)]" />
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)]"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </div>
            <select
              value={slaFilter}
              onChange={(e) => setSlaFilter(e.target.value)}
              className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)]"
            >
              <option value="ALL">All SLA Status</option>
              <option value="GREEN">Green</option>
              <option value="YELLOW">Yellow</option>
              <option value="ORANGE">Orange</option>
              <option value="RED">Red</option>
              <option value="BLACK">Black</option>
            </select>
            {(priorityFilter !== 'ALL' || slaFilter !== 'ALL') && (
              <button
                onClick={() => { setPriorityFilter('ALL'); setSlaFilter('ALL'); }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* SLA Summary Bar */}
        <div className="flex flex-wrap gap-3 mb-5">
          {(Object.entries(slaSummary) as [StatusColor, number][]).map(([status, count]) => (
            <div
              key={status}
              className="flex items-center gap-2 glass-card px-3 py-1.5 text-sm cursor-pointer transition hover:scale-105"
              onClick={() => setSlaFilter(slaFilter === status ? 'ALL' : status)}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: SLA_COLORS[status] }}
              />
              <span className="text-[var(--text-secondary)]">{status}</span>
              <span className="font-semibold text-[var(--text-primary)]">{count}</span>
            </div>
          ))}
        </div>

        {/* Heatmap Grid */}
        {filteredHeatmap.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-[var(--text-muted)]">No service requests match the current filters.</p>
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {filteredHeatmap.map((card) => {
              const slaColor = SLA_COLORS[card.sla_status as StatusColor] || '#64748b';
              const pctClamped = Math.min(100, Math.max(0, card.pct_elapsed));

              return (
                <motion.div
                  key={card.service_request_id}
                  variants={item}
                  className={`glass-card p-4 relative overflow-hidden ${
                    card.elevated_alert ? 'animate-pulse-border' : ''
                  }`}
                  style={
                    card.elevated_alert
                      ? {
                          boxShadow: `0 0 20px rgba(239,68,68,0.3)`,
                          borderColor: 'rgba(239,68,68,0.6)',
                          animation: 'pulse-red-border 2s ease-in-out infinite',
                        }
                      : undefined
                  }
                >
                  {/* SLA status indicator strip */}
                  <div
                    className="absolute top-0 left-0 w-full h-1 rounded-t-2xl"
                    style={{ backgroundColor: slaColor }}
                  />

                  <div className="flex items-start justify-between mt-1">
                    <div>
                      <p className="text-sm font-mono font-semibold text-[var(--text-primary)]">
                        {card.request_number}
                      </p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate max-w-[160px]">
                        {card.machine_name || 'No machine'}
                      </p>
                    </div>
                    <Badge variant={PRIORITY_BADGE_VARIANT[card.priority] || 'default'}>
                      {card.priority}
                    </Badge>
                  </div>

                  <div className="mt-3 text-xs text-[var(--text-muted)]">
                    {card.assigned_technician || 'Unassigned'}
                  </div>

                  {/* SLA Progress Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
                      <span>SLA Progress</span>
                      <span>{Math.round(pctClamped)}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-secondary)]">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pctClamped}%`,
                          backgroundColor: slaColor,
                        }}
                      />
                    </div>
                  </div>

                  {/* SLA status dot */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: slaColor }}
                    />
                    <span className="text-[10px] font-medium" style={{ color: slaColor }}>
                      {card.sla_status}
                    </span>
                    {card.time_remaining_mins > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)] ml-auto">
                        {Math.round(card.time_remaining_mins / 60)}h left
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </motion.div>

      {/* Inject keyframe for pulsing red border */}
      <style>{`
        @keyframes pulse-red-border {
          0%, 100% { border-color: rgba(239,68,68,0.3); box-shadow: 0 0 15px rgba(239,68,68,0.15); }
          50% { border-color: rgba(239,68,68,0.7); box-shadow: 0 0 30px rgba(239,68,68,0.35); }
        }
      `}</style>
    </div>
  );
}
