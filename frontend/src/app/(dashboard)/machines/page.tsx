'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cog, Plus, Edit2, ChevronDown, ChevronUp, Thermometer,
  Gauge, RotateCcw, Wrench, Activity, Factory, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Machine, Site } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

const MACHINE_TYPES = ['CNC', 'LATHE', 'DRILL', 'PRESS', 'ROBOT', 'CONVEYOR'] as const;

const statusVariant: Record<string, 'success' | 'warning' | 'danger'> = {
  OPERATIONAL: 'success',
  UNDER_MAINTENANCE: 'warning',
  DEGRADED: 'warning',
  DECOMMISSIONED: 'danger',
};

const statusLabel: Record<string, string> = {
  OPERATIONAL: 'Operational',
  UNDER_MAINTENANCE: 'Maintenance',
  DEGRADED: 'Degraded',
  DECOMMISSIONED: 'Decommissioned',
};

function deriveHealthScore(m: Machine): number {
  let score = 100;
  if (m.air_temp != null && m.air_temp > 310) score -= Math.min(30, (m.air_temp - 310) * 2);
  if (m.process_temp != null && m.process_temp > 315) score -= Math.min(25, (m.process_temp - 315) * 1.5);
  if (m.tool_wear != null) score -= Math.min(30, (m.tool_wear / 250) * 30);
  if (m.torque != null && m.torque > 60) score -= Math.min(15, (m.torque - 60) * 0.5);
  return Math.max(0, Math.round(score));
}

function healthColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function MiniBar({ label, value, max, unit, icon: Icon }: {
  label: string; value?: number; max: number; unit: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
}) {
  const pct = value != null ? Math.min(100, (value / max) * 100) : 0;
  const barColor = pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      <span className="text-gray-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-[#2a3050] rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${barColor}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
        />
      </div>
      <span className="text-gray-300 w-16 text-right">
        {value != null ? `${value.toFixed(1)} ${unit}` : '--'}
      </span>
    </div>
  );
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function MachinesPage() {
  const { user } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    code: '', name: '', type: 'CNC', site_id: '',
    air_temp: '', process_temp: '', rotational_speed: '', torque: '', tool_wear: '',
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';
  const isCustomer = user?.role === 'CUSTOMER';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [machinesRes, sitesRes] = await Promise.all([
        api.get<{ machines: Machine[] }>('/api/machines'),
        api.get<{ sites: Site[] }>('/api/sites'),
      ]);
      setMachines(machinesRes?.machines ?? []);
      setSites(sitesRes?.sites ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load machines');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return machines;
    const q = search.toLowerCase();
    return machines.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.code.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q)
    );
  }, [machines, search]);

  function openCreate() {
    setEditingMachine(null);
    setForm({ code: '', name: '', type: 'CNC', site_id: sites[0]?.id || '', air_temp: '', process_temp: '', rotational_speed: '', torque: '', tool_wear: '' });
    setShowModal(true);
  }

  function openEdit(m: Machine) {
    setEditingMachine(m);
    setForm({
      code: m.code, name: m.name, type: m.type, site_id: m.site_id,
      air_temp: m.air_temp?.toString() || '', process_temp: m.process_temp?.toString() || '',
      rotational_speed: m.rotational_speed?.toString() || '', torque: m.torque?.toString() || '',
      tool_wear: m.tool_wear?.toString() || '',
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body = {
        code: form.code, name: form.name, type: form.type, site_id: form.site_id,
        air_temp: form.air_temp ? parseFloat(form.air_temp) : undefined,
        process_temp: form.process_temp ? parseFloat(form.process_temp) : undefined,
        rotational_speed: form.rotational_speed ? parseFloat(form.rotational_speed) : undefined,
        torque: form.torque ? parseFloat(form.torque) : undefined,
        tool_wear: form.tool_wear ? parseFloat(form.tool_wear) : undefined,
      };
      if (editingMachine) {
        await api.patch(`/api/machines/${editingMachine.id}`, body);
        toast.success('Machine updated');
      } else {
        await api.post('/api/machines', body);
        toast.success('Machine created');
      }
      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save machine');
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
          <h1 className="text-2xl font-bold text-gray-100">Machines</h1>
          <p className="text-gray-400 text-sm mt-1">
            {isCustomer
              ? `${machines.length} machines at your site — check health before raising a request`
              : `${machines.length} machines registered`}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search machines..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {canManage && (
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="w-4 h-4 mr-2" />
              Add Machine
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Factory size={24} />}
          title="No machines found"
          description={search ? 'Try a different search term' : 'No machines have been added yet'}
          action={canManage ? { label: 'Add Machine', onClick: openCreate } : undefined}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filtered.map(machine => {
            const health = deriveHealthScore(machine);
            const isExpanded = expandedId === machine.id;
            return (
              <motion.div key={machine.id} variants={cardVariants} layout>
                <Card
                  className="bg-[#111827] border border-[#2a3050] hover:border-[#3a4570] transition-colors cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : machine.id)}
                >
                  <div className="p-5">
                    {/* Top row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Cog className="w-4 h-4 text-blue-400 shrink-0" />
                          <span className="text-xs font-mono text-gray-400">{machine.code}</span>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-100 truncate">{machine.name}</h3>
                        <span className="text-xs text-gray-400">{machine.type}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={statusVariant[machine.status] || 'default'}>
                          {statusLabel[machine.status] || machine.status}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Health score */}
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-4 h-4 text-gray-400" />
                      <span className="text-xs text-gray-400">Health</span>
                      <div className="flex-1 h-2 bg-[#2a3050] rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${health >= 75 ? 'bg-emerald-500' : health >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${health}%` }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>
                      <span className={`text-sm font-semibold ${healthColor(health)}`}>{health}%</span>
                    </div>

                    {/* Sensor readings */}
                    <div className="space-y-2">
                      <MiniBar label="Air Temp" value={machine.air_temp} max={350} unit="K" icon={Thermometer} />
                      <MiniBar label="Proc Temp" value={machine.process_temp} max={350} unit="K" icon={Thermometer} />
                      <MiniBar label="Speed" value={machine.rotational_speed} max={3000} unit="rpm" icon={Gauge} />
                      <MiniBar label="Torque" value={machine.torque} max={80} unit="Nm" icon={RotateCcw} />
                      <MiniBar label="Tool Wear" value={machine.tool_wear} max={250} unit="min" icon={Wrench} />
                    </div>

                    {/* Expanded details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-[#2a3050] space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Site</span>
                              <span className="text-gray-200">{machine.site?.name || machine.site_id}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Created</span>
                              <span className="text-gray-200">
                                {new Date(machine.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            {canManage && (
                              <div className="pt-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={e => { e.stopPropagation(); openEdit(machine); }}
                                >
                                  <Edit2 className="w-3.5 h-3.5 mr-1.5" />
                                  Edit Machine
                                </Button>
                              </div>
                            )}
                            {isCustomer && health < 75 && (
                              <div className="pt-2">
                                <a
                                  href="/service-requests"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition"
                                >
                                  <Wrench className="w-3.5 h-3.5" />
                                  Raise Service Request
                                </a>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      {/* Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingMachine ? 'Edit Machine' : 'Add Machine'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Machine Code</label>
              <input
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Name</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              >
                {MACHINE_TYPES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Site</label>
              <select
                required
                value={form.site_id}
                onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select site</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-[#2a3050] pt-4">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Sensor Values</h4>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: 'air_temp', label: 'Air Temp (K)' },
                { key: 'process_temp', label: 'Process Temp (K)' },
                { key: 'rotational_speed', label: 'Speed (rpm)' },
                { key: 'torque', label: 'Torque (Nm)' },
                { key: 'tool_wear', label: 'Tool Wear (min)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-sm text-gray-400 mb-1">{label}</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form[key as keyof typeof form]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {editingMachine ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
