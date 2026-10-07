'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users, Plus, Star, Briefcase, Award, Search,
  ToggleLeft, ToggleRight, BadgeCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Technician, Site } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

function RatingStars({ rating }: { rating?: number }) {
  const r = rating ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= Math.round(r) ? 'text-amber-400 fill-amber-400' : 'text-gray-600'}`}
        />
      ))}
      {rating != null && (
        <span className="text-xs text-gray-400 ml-1">{rating.toFixed(1)}</span>
      )}
    </div>
  );
}

export default function TechniciansPage() {
  const { user } = useAuth();
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    user_id: '',
    employee_code: '',
    site_id: '',
    specializations: '',
    certifications: '',
    max_concurrent_jobs: '3',
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [techRes, sitesRes] = await Promise.all([
        api.get<{ technicians: Technician[] }>('/api/technicians'),
        api.get<{ sites: Site[] }>('/api/sites'),
      ]);
      setTechnicians(techRes?.technicians ?? []);
      setSites(sitesRes?.sites ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load technicians');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return technicians;
    const q = search.toLowerCase();
    return technicians.filter(t =>
      (t.users?.full_name || '').toLowerCase().includes(q) ||
      (t.employee_code ?? '').toLowerCase().includes(q) ||
      (t.specializations ?? []).some(s => s.toLowerCase().includes(q))
    );
  }, [technicians, search]);

  async function toggleAvailability(tech: Technician) {
    try {
      await api.patch(`/api/technicians/${tech.id}`, { is_available: !tech.is_available });
      toast.success(`${tech.users?.full_name || 'Technician'} marked as ${tech.is_available ? 'unavailable' : 'available'}`);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update availability');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/technicians', {
        user_id: form.user_id,
        employee_code: form.employee_code,
        site_id: form.site_id,
        specializations: form.specializations.split(',').map(s => s.trim()).filter(Boolean),
        certifications: form.certifications.split(',').map(s => s.trim()).filter(Boolean),
        max_concurrent_jobs: parseInt(form.max_concurrent_jobs, 10),
      });
      toast.success('Technician added');
      setShowModal(false);
      loadData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add technician');
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
          <h1 className="text-2xl font-bold text-gray-100">Technicians</h1>
          <p className="text-gray-400 text-sm mt-1">{technicians.length} technicians registered</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search technicians..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {canManage && (
            <Button onClick={() => { setForm({ user_id: '', employee_code: '', site_id: sites[0]?.id || '', specializations: '', certifications: '', max_concurrent_jobs: '3' }); setShowModal(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Technician
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={24} />}
          title="No technicians found"
          description={search ? 'Try a different search term' : 'No technicians have been registered yet'}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filtered.map(tech => (
            <motion.div key={tech.id} variants={cardVariants}>
              <Card className="bg-[#111827] border border-[#2a3050] hover:border-[#3a4570] transition-colors">
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold text-gray-100 truncate">
                        {tech.users?.full_name || 'Unknown'}
                      </h3>
                      <span className="text-xs font-mono text-gray-400">{tech.employee_code}</span>
                    </div>
                    <div className="shrink-0">
                      <Badge variant={tech.is_available ? 'success' : 'danger'}>
                        {tech.is_available ? 'Available' : 'Unavailable'}
                      </Badge>
                    </div>
                  </div>

                  {/* Rating */}
                  <div className="mb-3">
                    <RatingStars rating={tech.rating} />
                  </div>

                  {/* Job count */}
                  <div className="flex items-center gap-2 mb-3 text-sm">
                    <Briefcase className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-400">Jobs:</span>
                    <span className="text-gray-200">
                      {tech.current_job_count} / {tech.max_concurrent_jobs}
                    </span>
                    <div className="flex-1 h-1.5 bg-[#2a3050] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          tech.current_job_count >= tech.max_concurrent_jobs
                            ? 'bg-red-500'
                            : tech.current_job_count >= tech.max_concurrent_jobs * 0.7
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (tech.current_job_count / tech.max_concurrent_jobs) * 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Specializations */}
                  {(tech.specializations ?? []).length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400">
                        <Award className="w-3.5 h-3.5" />
                        Specializations
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(tech.specializations ?? []).map(spec => (
                          <span
                            key={spec}
                            className="px-2 py-0.5 text-xs bg-blue-500/15 text-blue-300 rounded-full"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {(tech.certifications ?? []).length > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center gap-1.5 mb-1.5 text-xs text-gray-400">
                        <BadgeCheck className="w-3.5 h-3.5" />
                        Certifications
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(tech.certifications ?? []).map(cert => (
                          <span
                            key={cert}
                            className="px-2 py-0.5 text-xs bg-purple-500/15 text-purple-300 rounded-full"
                          >
                            {cert}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Availability toggle */}
                  {canManage && (
                    <div className="pt-3 border-t border-[#2a3050]">
                      <button
                        onClick={() => toggleAvailability(tech)}
                        className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        {tech.is_available ? (
                          <ToggleRight className="w-5 h-5 text-emerald-400" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-gray-500" />
                        )}
                        Toggle availability
                      </button>
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Add Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Technician">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">User ID</label>
            <input
              required
              value={form.user_id}
              onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
              placeholder="UUID of the user account"
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Employee Code</label>
              <input
                required
                value={form.employee_code}
                onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
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
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Specializations (comma-separated)</label>
            <input
              value={form.specializations}
              onChange={e => setForm(f => ({ ...f, specializations: e.target.value }))}
              placeholder="CNC, Welding, Electrical"
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Certifications (comma-separated)</label>
            <input
              value={form.certifications}
              onChange={e => setForm(f => ({ ...f, certifications: e.target.value }))}
              placeholder="ISO 9001, Safety Level 3"
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Concurrent Jobs</label>
            <input
              type="number"
              min="1"
              required
              value={form.max_concurrent_jobs}
              onChange={e => setForm(f => ({ ...f, max_concurrent_jobs: e.target.value }))}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
