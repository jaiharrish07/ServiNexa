'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  BookOpen,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Star,
  Clock,
  Tag,
  Wrench,
  Filter,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { KnowledgeEntry } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KnowledgeStats {
  total_entries?: number;
  total?: number;
  by_category?: Record<string, number>;
  success_rate?: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const glassCard =
  'rounded-2xl border border-[#2a3050] bg-gradient-to-br from-[#111827]/80 to-[#1a1f2e]/60 backdrop-blur-xl p-6';

const CATEGORIES = [
  'MECHANICAL',
  'ELECTRICAL',
  'HYDRAULIC',
  'PNEUMATIC',
  'SOFTWARE',
  'CALIBRATION',
  'PREVENTIVE',
  'OTHER',
];

const MACHINE_TYPES = [
  'CNC',
  'LATHE',
  'PRESS',
  'CONVEYOR',
  'PUMP',
  'COMPRESSOR',
  'GENERATOR',
  'OTHER',
];

/* ------------------------------------------------------------------ */
/*  Entry Card                                                         */
/* ------------------------------------------------------------------ */

function EntryCard({ entry }: { entry: KnowledgeEntry }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      className="rounded-xl border border-[#2a3050] bg-[#111827]/60 overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 text-left flex items-start gap-3 hover:bg-[#1a1f2e]/40 transition-colors"
      >
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="mt-0.5 shrink-0 text-gray-500"
        >
          <ChevronRight size={16} />
        </motion.div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-100 line-clamp-2">
            {entry.problem_description ?? 'No description'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="info">{entry.category ?? 'GENERAL'}</Badge>
            <Badge variant="default">{entry.machine_type ?? 'OTHER'}</Badge>
            {entry.success_flag ? (
              <Badge variant="success">
                <CheckCircle2 size={12} className="mr-1" />
                Success
              </Badge>
            ) : (
              <Badge variant="danger">
                <XCircle size={12} className="mr-1" />
                Failed
              </Badge>
            )}
            {entry.effectiveness_rating != null && (
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <Star size={12} />
                {entry.effectiveness_rating}/5
              </span>
            )}
          </div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#2a3050] px-5 py-4 space-y-4">
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase mb-1">Solution Applied</p>
                <p className="text-sm text-gray-300">{entry.solution_applied ?? 'N/A'}</p>
              </div>

              {(entry?.parts_used ?? []).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase mb-1">Parts Used</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(entry.parts_used ?? []).map((part, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-[#1a1f2e] px-2 py-1 text-xs text-gray-300 border border-[#2a3050]"
                      >
                        <Wrench size={10} className="inline mr-1 text-gray-500" />
                        {part}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                {entry.resolution_hours != null && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {entry.resolution_hours}h resolution
                  </span>
                )}
                {entry.cost != null && (
                  <span>Cost: &#8377;{entry.cost.toLocaleString()}</span>
                )}
              </div>

              {(entry?.tags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(entry.tags ?? []).map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs text-indigo-300"
                    >
                      <Tag size={10} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Add Entry Modal                                                    */
/* ------------------------------------------------------------------ */

interface NewEntry {
  machine_type: string;
  category: string;
  problem_description: string;
  solution_applied: string;
  parts_used: string;
  resolution_hours: string;
  cost: string;
  effectiveness_rating: string;
  success_flag: boolean;
  tags: string;
}

const emptyEntry: NewEntry = {
  machine_type: '',
  category: '',
  problem_description: '',
  solution_applied: '',
  parts_used: '',
  resolution_hours: '',
  cost: '',
  effectiveness_rating: '',
  success_flag: true,
  tags: '',
};

function AddEntryModal({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NewEntry>(emptyEntry);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof NewEntry, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const inputClasses =
    'w-full rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50';

  const submit = async () => {
    if (!form.machine_type || !form.category || !form.problem_description || !form.solution_applied) {
      toast.error('Fill all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/knowledge', {
        machine_type: form.machine_type,
        category: form.category,
        problem_description: form.problem_description,
        solution_applied: form.solution_applied,
        parts_used: form.parts_used
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        resolution_hours: form.resolution_hours ? parseFloat(form.resolution_hours) : undefined,
        cost: form.cost ? parseFloat(form.cost) : undefined,
        effectiveness_rating: form.effectiveness_rating
          ? parseInt(form.effectiveness_rating)
          : undefined,
        success_flag: form.success_flag,
        tags: form.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      });
      toast.success('Knowledge entry created');
      setForm(emptyEntry);
      onClose();
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create entry');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Add Knowledge Entry">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Machine Type *</label>
            <select
              value={form.machine_type}
              onChange={(e) => update('machine_type', e.target.value)}
              className={inputClasses}
            >
              <option value="">Select...</option>
              {MACHINE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Category *</label>
            <select
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              className={inputClasses}
            >
              <option value="">Select...</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Problem Description *</label>
          <textarea
            value={form.problem_description}
            onChange={(e) => update('problem_description', e.target.value)}
            rows={3}
            className={inputClasses + ' resize-none'}
            placeholder="Describe the problem encountered..."
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Solution Applied *</label>
          <textarea
            value={form.solution_applied}
            onChange={(e) => update('solution_applied', e.target.value)}
            rows={3}
            className={inputClasses + ' resize-none'}
            placeholder="Describe the solution that was applied..."
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Parts Used (comma-separated)</label>
          <input
            value={form.parts_used}
            onChange={(e) => update('parts_used', e.target.value)}
            className={inputClasses}
            placeholder="Bearing-XYZ, Seal-123, ..."
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Resolution Hours</label>
            <input
              type="number"
              value={form.resolution_hours}
              onChange={(e) => update('resolution_hours', e.target.value)}
              className={inputClasses}
              placeholder="e.g. 4.5"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Cost (INR)</label>
            <input
              type="number"
              value={form.cost}
              onChange={(e) => update('cost', e.target.value)}
              className={inputClasses}
              placeholder="e.g. 5000"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Rating (1-5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={form.effectiveness_rating}
              onChange={(e) => update('effectiveness_rating', e.target.value)}
              className={inputClasses}
              placeholder="1-5"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">Tags (comma-separated)</label>
          <input
            value={form.tags}
            onChange={(e) => update('tags', e.target.value)}
            className={inputClasses}
            placeholder="vibration, overheating, ..."
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="success_flag"
            checked={form.success_flag}
            onChange={(e) => update('success_flag', e.target.checked)}
            className="h-4 w-4 rounded border-gray-600 bg-[#0a0e1a] text-indigo-500 focus:ring-indigo-500/30"
          />
          <label htmlFor="success_flag" className="text-sm text-gray-300">
            Solution was successful
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            Create Entry
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function KnowledgePage() {
  const { user } = useAuth();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [machineType, setMachineType] = useState('');
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  /* Load stats */
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await api.get<{ stats?: KnowledgeStats }>('/api/knowledge/stats');
      setStats(data?.stats ?? null);
    } catch {
      /* stats are non-critical */
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  /* Search */
  const search = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (category) params.set('category', category);
      if (machineType) params.set('machine_type', machineType);
      const qs = params.toString();
      const data = await api.get<Record<string, unknown>>(
        `/api/knowledge/search${qs ? `?${qs}` : ''}`
      );
      const raw = data?.results;
      let list: KnowledgeEntry[] = [];
      if (Array.isArray(raw)) {
        list = raw;
      } else if (raw && typeof raw === 'object' && 'similar_cases' in (raw as Record<string, unknown>)) {
        const cases = (raw as Record<string, unknown>).similar_cases;
        list = Array.isArray(cases)
          ? cases.map((c: Record<string, unknown>) => ({
              id: (c.entry_id as string) ?? '',
              problem_description: (c.solution_summary as string) ?? '',
              solution_applied: (c.solution_summary as string) ?? '',
              category: 'GENERAL',
              machine_type: 'OTHER',
              success_flag: Boolean(c.success),
              resolution_hours: Number(c.resolution_hours ?? 0),
              effectiveness_rating: c.relevance != null ? Math.round(Number(c.relevance) * 5) : null,
            } as unknown as KnowledgeEntry))
          : [];
      }
      setEntries(list);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, category, machineType]);

  /* Initial search */
  useEffect(() => {
    search();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') search();
  };

  const selectClasses =
    'appearance-none rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-3 py-2.5 pr-8 text-sm text-gray-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50';

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3">
              <BookOpen className="text-indigo-400" size={28} />
              Knowledge Base
            </h1>
            <p className="mt-2 text-gray-400">
              Search proven solutions, track effectiveness, and share repair knowledge.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setShowModal(true)}>
              <Plus size={16} className="mr-2" />
              Add Entry
            </Button>
          )}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div>
          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={glassCard + ' mb-6'}
          >
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search knowledge base..."
                  className="w-full rounded-lg border border-[#2a3050] bg-[#0a0e1a] pl-10 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                />
              </div>
              <div className="flex gap-2">
                <div className="relative">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClasses}>
                    <option value="">All Categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                </div>
                <div className="relative">
                  <select
                    value={machineType}
                    onChange={(e) => setMachineType(e.target.value)}
                    className={selectClasses}
                  >
                    <option value="">All Machines</option>
                    {MACHINE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                  />
                </div>
                <Button onClick={search} loading={loading}>
                  <Filter size={16} className="mr-1" />
                  Search
                </Button>
              </div>
            </div>
          </motion.div>

          {/* Results */}
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              icon={<BookOpen size={24} />}
              title="No entries found"
              description="Try adjusting your search filters or add a new knowledge entry."
            />
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <p className="text-sm text-gray-400 mb-2">{entries.length} result(s)</p>
              {entries.map((entry, i) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i }}
                >
                  <EntryCard entry={entry} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Stats sidebar */}
        <motion.aside
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className={glassCard + ' sticky top-6'}>
            <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-indigo-400" />
              Statistics
            </h3>

            {statsLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : stats ? (
              <div className="space-y-5">
                <div className="text-center rounded-xl border border-[#2a3050] bg-[#0a0e1a]/40 p-4">
                  <p className="text-3xl font-bold text-indigo-400">{stats?.total_entries ?? stats?.total ?? 0}</p>
                  <p className="text-xs text-gray-400 mt-1">Total Entries</p>
                </div>

                <div className="rounded-xl border border-[#2a3050] bg-[#0a0e1a]/40 p-4">
                  <p className="text-sm font-medium text-gray-300 mb-1">Success Rate</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-emerald-400">
                      {(stats?.success_rate ?? 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-[#1e293b]">
                    <motion.div
                      className="h-full rounded-full bg-emerald-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${stats?.success_rate ?? 0}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' as const }}
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-300 mb-3">By Category</p>
                  <div className="space-y-2">
                    {Object.entries(stats?.by_category ?? {}).map(([cat, count]) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between rounded-lg bg-[#0a0e1a]/30 px-3 py-2"
                      >
                        <span className="text-xs text-gray-400">{cat}</span>
                        <Badge variant="default">{count}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Stats unavailable</p>
            )}
          </div>
        </motion.aside>
      </div>

      {/* Add entry modal */}
      <AddEntryModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => {
          search();
          loadStats();
        }}
      />
    </div>
  );
}
