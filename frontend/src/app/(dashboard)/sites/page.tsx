'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Plus, Search, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { Site } from '@/lib/types';
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

export default function SitesPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: '', code: '', address: '', city: '', state: '', country: '',
  });

  const canManage = user?.role === 'ADMIN';

  useEffect(() => {
    loadSites();
  }, []);

  async function loadSites() {
    try {
      const res = await api.get<{ sites: Site[] }>('/api/sites');
      setSites(res?.sites ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load sites');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return sites;
    const q = search.toLowerCase();
    return sites.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q) ||
      (s.city || '').toLowerCase().includes(q) ||
      (s.state || '').toLowerCase().includes(q)
    );
  }, [sites, search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/sites', {
        name: form.name,
        code: form.code,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        country: form.country || undefined,
      });
      toast.success('Site created');
      setShowModal(false);
      loadSites();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create site');
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
          <h1 className="text-2xl font-bold text-gray-100">Sites</h1>
          <p className="text-gray-400 text-sm mt-1">{sites.length} sites registered</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search sites..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {canManage && (
            <Button onClick={() => { setForm({ name: '', code: '', address: '', city: '', state: '', country: '' }); setShowModal(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Site
            </Button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Building2 size={24} />}
          title="No sites found"
          description={search ? 'Try a different search term' : 'No sites have been added yet'}
          action={canManage ? { label: 'Add Site', onClick: () => setShowModal(true) } : undefined}
        />
      ) : (
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {filtered.map(site => (
            <motion.div key={site.id} variants={cardVariants}>
              <Card className="bg-[#111827] border border-[#2a3050] hover:border-[#3a4570] transition-colors">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                        <span className="text-xs font-mono text-gray-400">{site.code}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-100 truncate">{site.name}</h3>
                    </div>
                    <Badge variant={site.is_active ? 'success' : 'danger'}>
                      {site.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  {(site.city || site.state) && (
                    <div className="flex items-center gap-2 text-sm text-gray-400 mb-2">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>
                        {[site.city, site.state].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}

                  {site.address && (
                    <p className="text-xs text-gray-500 mb-2">{site.address}</p>
                  )}

                  {site.country && (
                    <span className="text-xs text-gray-500">{site.country}</span>
                  )}

                  <div className="mt-3 pt-3 border-t border-[#2a3050] text-xs text-gray-500">
                    Created {new Date(site.created_at).toLocaleDateString()}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Add Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Add Site">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Site Name</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Code</label>
              <input
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="SITE-001"
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Address</label>
            <input
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">City</label>
              <input
                value={form.city}
                onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">State</label>
              <input
                value={form.state}
                onChange={e => setForm(f => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Country</label>
              <input
                value={form.country}
                onChange={e => setForm(f => ({ ...f, country: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
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
