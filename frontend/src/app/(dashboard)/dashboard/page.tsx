'use client';

import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Clock,
  Shield,
  Filter,
  X,
  Activity,
  Zap,
  ArrowRight,
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
} from 'recharts';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { DashboardStats, HeatmapCard, StatusColor } from '@/lib/types';
import { StatCard } from '@/components/ui/StatCard';
import { Badge } from '@/components/ui/Badge';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const SLA_COLORS: Record<StatusColor, string> = {
  GREEN: '#34d399',
  YELLOW: '#fbbf24',
  ORANGE: '#fb923c',
  RED: '#f87171',
  BLACK: '#991b1b',
};

const STATUS_PIE_COLORS: Record<string, string> = {
  DRAFT: '#64748b',
  SUBMITTED: '#4f8ff7',
  VALIDATING: '#eab308',
  PENDING_APPROVAL: '#fbbf24',
  APPROVED: '#2563eb',
  ASSIGNED: '#6366f1',
  BIDDING: '#a78bfa',
  BID_REVIEW: '#a855f7',
  BID_ACCEPTED: '#7c3aed',
  IN_PROGRESS: '#22d3ee',
  COMPLETED: '#34d399',
  VERIFIED: '#059669',
  CLOSED: '#475569',
  EXCEPTION: '#f87171',
};

const PRIORITY_BADGE_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  CRITICAL: 'danger',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'success',
};

const ALLOWED_ROLES = ['ADMIN', 'OPS_MANAGER'];

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] backdrop-blur-xl rounded-lg px-3 py-2 shadow-2xl">
      <p className="text-[10px] text-[var(--text-muted)] mb-0.5 uppercase tracking-wider">{label}</p>
      <p className="text-sm font-bold text-[var(--text-primary)] tabular-nums">{payload[0].value}</p>
    </div>
  );
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { fill: string } }> }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] backdrop-blur-xl rounded-lg px-3 py-2 shadow-2xl">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: payload[0].payload.fill }} />
        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{payload[0].name.replace(/_/g, ' ')}</p>
      </div>
      <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">{payload[0].value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [slaFilter, setSlaFilter] = useState<string>('ALL');

  const hasAccess = user && ALLOWED_ROLES.includes(user.role);

  useEffect(() => {
    if (!hasAccess) { setLoading(false); return; }
    async function load() {
      try {
        const [dashRaw, heatRaw] = await Promise.all([
          api.get<any>('/api/reports/dashboard'),
          api.get<any>('/api/dashboard/sla-heatmap'),
        ]);
        const inner = dashRaw?.dashboard ?? dashRaw ?? {};
        const sr = inner?.service_requests ?? {};
        const byStatus = sr?.by_status ?? {};
        setStats({
          total_requests: sr?.total ?? 0,
          open_requests: sr?.active ?? 0,
          in_progress: byStatus['IN_PROGRESS'] ?? 0,
          completed: (byStatus['COMPLETED'] ?? 0) + (byStatus['CLOSED'] ?? 0) + (byStatus['VERIFIED'] ?? 0),
          avg_resolution_hours: 0,
          by_priority: sr?.by_priority ?? {},
          by_category: sr?.by_category ?? {},
          by_status: byStatus,
        });
        setHeatmap(heatRaw?.heatmap ?? (Array.isArray(heatRaw) ? heatRaw : []));
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [hasAccess]);

  const priorityData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_priority || {}).map(([name, value]) => ({ name, value }));
  }, [stats]);

  const statusData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.by_status || {})
      .map(([name, value]) => ({ name, value }))
      .filter(d => d.value > 0);
  }, [stats]);

  const filteredHeatmap = useMemo(() => {
    return heatmap.filter(c => {
      if (priorityFilter !== 'ALL' && c.priority !== priorityFilter) return false;
      if (slaFilter !== 'ALL' && c.sla_status !== slaFilter) return false;
      return true;
    });
  }, [heatmap, priorityFilter, slaFilter]);

  const slaSummary = useMemo(() => {
    const counts: Record<string, number> = { GREEN: 0, YELLOW: 0, ORANGE: 0, RED: 0, BLACK: 0 };
    heatmap.forEach(c => { if (counts[c.sla_status] !== undefined) counts[c.sla_status]++; });
    return counts;
  }, [heatmap]);

  const slaComplianceColor = useMemo(() => {
    if (!stats) return 'emerald';
    const pct = ((stats.completed ?? 0) / (stats.total_requests || 1)) * 100;
    if (pct > 90) return 'emerald';
    if (pct > 75) return 'amber';
    return 'red';
  }, [stats]);

  if (!hasAccess && !loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2 }}
          className="glass-card p-10 text-center max-w-md">
          <Shield className="w-16 h-16 text-[var(--accent-amber)] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Access Restricted</h2>
          <p className="text-[var(--text-secondary)]">Only Admin and Ops Manager roles can view the management dashboard.</p>
        </motion.div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><LoadingSpinner /></div>;
  }

  if (!stats) return null;

  const slaCompliancePct = stats.total_requests
    ? Math.round(((stats.completed ?? 0) / stats.total_requests) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      {/* ---- Hero Welcome ---- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)] p-5 sm:p-6">
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-0.5">Welcome back,</p>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)] tracking-tight">
            {user?.full_name?.split(' ')[0] ?? 'Operator'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1.5">
            {stats.open_requests > 0
              ? `${stats.open_requests} active request${stats.open_requests > 1 ? 's' : ''} need attention.`
              : 'All systems operating normally.'}
          </p>
        </div>
        <Link
          href="/service-requests"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-blue)] to-[var(--accent-purple)] text-white text-sm font-semibold shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-shadow self-start sm:self-center"
        >
          <Zap className="w-4 h-4" />
          View Requests
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* ---- 6 Stat Cards ---- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard title="Total Requests" value={stats.total_requests} icon={<ClipboardList size={20} />} color="blue" />
        <StatCard title="Active" value={stats.open_requests} icon={<AlertCircle size={20} />} color="amber" />
        <StatCard title="In Progress" value={stats.in_progress} icon={<Activity size={20} />} color="purple" />
        <StatCard title="Completed" value={stats.completed} icon={<CheckCircle2 size={20} />} color="emerald" />
        <StatCard title="Avg Resolution" value={`${(stats.avg_resolution_hours ?? 0).toFixed(1)}h`} icon={<Clock size={20} />} color="cyan" />
        <StatCard title="SLA Compliance" value={`${slaCompliancePct}%`} icon={<Shield size={20} />} color={slaComplianceColor} />
      </div>

      {/* ---- Charts Row ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Bar Chart - 3/5 */}
        <div className="lg:col-span-3 glass-card p-5 sm:p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Requests by Priority</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Distribution across severity levels</p>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} barSize={36} barGap={8}>
                <defs>
                  <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f8ff7" stopOpacity={0.9} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.7} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(56,80,130,0.15)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#4e6080', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#4e6080', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(79,143,247,0.04)' }} />
                <Bar dataKey="value" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - 2/5 */}
        <div className="lg:col-span-2 glass-card p-5 sm:p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Status Distribution</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Current request pipeline</p>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData} cx="50%" cy="50%"
                  innerRadius={50} outerRadius={90}
                  dataKey="value" nameKey="name"
                  paddingAngle={3} stroke="none"
                >
                  {statusData.map(entry => (
                    <Cell key={entry.name} fill={STATUS_PIE_COLORS[entry.name] || '#4e6080'} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
            {statusData.map(entry => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_PIE_COLORS[entry.name] || '#4e6080' }} />
                <span className="text-[10px] text-[var(--text-muted)]">{entry.name.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ---- SLA Heatmap ---- */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-bold text-[var(--text-primary)]">SLA Heatmap</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Real-time service level compliance</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); }}
                className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)] input-focus">
                <option value="ALL">All Priorities</option>
                {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <select value={slaFilter} onChange={e => { setSlaFilter(e.target.value); }}
              className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg px-3 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-glow)] input-focus">
              <option value="ALL">All SLA Status</option>
              {['GREEN', 'YELLOW', 'ORANGE', 'RED', 'BLACK'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(priorityFilter !== 'ALL' || slaFilter !== 'ALL') && (
              <button onClick={() => { setPriorityFilter('ALL'); setSlaFilter('ALL'); }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition p-1 rounded-md hover:bg-white/[0.04]">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* SLA Summary Pills */}
        <div className="flex flex-wrap gap-2 mb-5">
          {(Object.entries(slaSummary) as [StatusColor, number][]).map(([status, count]) => (
            <button
              key={status}
              onClick={() => setSlaFilter(slaFilter === status ? 'ALL' : status)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
                slaFilter === status
                  ? 'border-white/20 bg-white/[0.06] shadow-lg'
                  : 'border-[var(--border-primary)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)]'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: SLA_COLORS[status] }} />
              <span className="text-[var(--text-secondary)]">{status}</span>
              <span className="font-bold text-[var(--text-primary)] tabular-nums">{count}</span>
            </button>
          ))}
        </div>

        {filteredHeatmap.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-[var(--text-muted)]">No service requests match the current filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredHeatmap.map(card => {
              const slaColor = SLA_COLORS[card.sla_status as StatusColor] || '#4e6080';
              const pctClamped = Math.min(100, Math.max(0, card.pct_elapsed));

              return (
                <div
                  key={card.service_request_id}
                  className="glass-card p-3.5 relative overflow-hidden group"
                  style={card.elevated_alert ? {
                    boxShadow: `0 0 24px -4px rgba(248,113,113,0.3)`,
                    borderColor: 'rgba(248,113,113,0.4)',
                    animation: 'pulse-red-border 2s ease-in-out infinite',
                  } : undefined}
                >
                  <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(to right, ${slaColor}, transparent)` }} />

                  <div className="flex items-start justify-between mt-0.5">
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-semibold text-[var(--text-primary)]">{card.request_number}</p>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5 truncate">{card.machine_name || 'No machine'}</p>
                    </div>
                    <Badge variant={PRIORITY_BADGE_VARIANT[card.priority] || 'default'}>{card.priority}</Badge>
                  </div>

                  <div className="mt-2 text-xs text-[var(--text-muted)]">{card.assigned_technician || 'Unassigned'}</div>

                  <div className="mt-2.5">
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
                      <span>SLA Progress</span>
                      <span className="font-mono font-semibold tabular-nums" style={{ color: slaColor }}>{Math.round(pctClamped)}%</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-white/[0.04] overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{ width: `${pctClamped}%`, background: `linear-gradient(to right, ${slaColor}cc, ${slaColor})` }} />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: slaColor }} />
                    <span className="text-[10px] font-semibold" style={{ color: slaColor }}>{card.sla_status}</span>
                    {card.time_remaining_mins > 0 && (
                      <span className="text-[10px] text-[var(--text-muted)] ml-auto font-mono tabular-nums">
                        {Math.round(card.time_remaining_mins / 60)}h left
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse-red-border {
          0%, 100% { border-color: rgba(248,113,113,0.25); box-shadow: 0 0 20px -4px rgba(248,113,113,0.15); }
          50% { border-color: rgba(248,113,113,0.5); box-shadow: 0 0 40px -4px rgba(248,113,113,0.3); }
        }
      `}</style>
    </motion.div>
  );
}
