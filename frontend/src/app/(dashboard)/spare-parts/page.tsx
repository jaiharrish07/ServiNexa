'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Plus, Search, AlertTriangle, ShoppingCart,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { SparePart } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function stockLevel(part: SparePart): { label: string; variant: 'success' | 'warning' | 'danger' } {
  const available = (part.quantity_available ?? 0) - (part.quantity_reserved ?? 0);
  if (available <= 0) return { label: 'Out of Stock', variant: 'danger' };
  if (available <= (part.reorder_level ?? 0)) return { label: 'Low Stock', variant: 'warning' };
  return { label: 'In Stock', variant: 'success' };
}

export default function SparePartsPage() {
  const { user } = useAuth();
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<SparePart | null>(null);
  const [reserveQty, setReserveQty] = useState('1');
  const [reserveWorkOrderId, setReserveWorkOrderId] = useState('');
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    part_number: '', name: '', category: '', site_id: '',
    quantity_available: '', unit_cost: '', reorder_level: '',
  });

  const canManage = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';

  useEffect(() => {
    loadParts();
  }, []);

  async function loadParts() {
    try {
      const res = await api.get<{ spare_parts: SparePart[] }>('/api/spare-parts');
      setParts(res?.spare_parts ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load spare parts');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return parts;
    const q = search.toLowerCase();
    return parts.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.part_number.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }, [parts, search]);

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPart) return;
    setSubmitting(true);
    try {
      await api.post(`/api/spare-parts/${selectedPart.id}/reserve`, {
        quantity: parseInt(reserveQty, 10),
        work_order_id: reserveWorkOrderId,
      });
      toast.success(`Reserved ${reserveQty} units of ${selectedPart.name}`);
      setShowReserveModal(false);
      loadParts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reserve parts');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/spare-parts', {
        part_number: form.part_number,
        name: form.name,
        category: form.category,
        site_id: form.site_id,
        quantity_available: parseInt(form.quantity_available, 10),
        unit_cost: parseFloat(form.unit_cost),
        reorder_level: parseInt(form.reorder_level, 10),
      });
      toast.success('Part added');
      setShowAddModal(false);
      loadParts();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to add part');
    } finally {
      setSubmitting(false);
    }
  }

  async function openReserve(part: SparePart) {
    setSelectedPart(part);
    setReserveQty('1');
    setReserveWorkOrderId('');
    setShowReserveModal(true);
    try {
      const res = await api.get<any>('/api/work-orders?status=PENDING&status=IN_PROGRESS');
      setWorkOrders(res?.work_orders ?? []);
    } catch {
      setWorkOrders([]);
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
          <h1 className="text-2xl font-bold text-gray-100">Spare Parts</h1>
          <p className="text-gray-400 text-sm mt-1">{parts.length} parts in inventory</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search parts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          {canManage && (
            <Button onClick={() => { setForm({ part_number: '', name: '', category: '', site_id: '', quantity_available: '', unit_cost: '', reorder_level: '' }); setShowAddModal(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Part
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Package size={24} />}
          title="No spare parts found"
          description={search ? 'Try a different search term' : 'No spare parts have been added yet'}
          action={canManage ? { label: 'Add Part', onClick: () => setShowAddModal(true) } : undefined}
        />
      ) : (
        <div className="bg-[#111827] border border-[#2a3050] rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="hidden lg:grid grid-cols-[120px_1fr_120px_80px_80px_80px_100px_80px_100px] gap-4 px-5 py-3 border-b border-[#2a3050] text-xs text-gray-400 font-medium uppercase tracking-wider">
            <span>Part #</span>
            <span>Name</span>
            <span>Category</span>
            <span>Available</span>
            <span>Reserved</span>
            <span>Net Qty</span>
            <span>Unit Cost</span>
            <span>Status</span>
            <span>Action</span>
          </div>

          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {filtered.map(part => {
              const available = part.quantity_available - part.quantity_reserved;
              const stock = stockLevel(part);
              const isLow = available <= part.reorder_level;
              return (
                <motion.div
                  key={part.id}
                  variants={rowVariants}
                  className={`grid grid-cols-1 lg:grid-cols-[120px_1fr_120px_80px_80px_80px_100px_80px_100px] gap-2 lg:gap-4 px-5 py-4 border-b border-[#2a3050] items-center transition-colors ${
                    isLow ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-[#1a1f2e]'
                  }`}
                >
                  <span className="text-sm font-mono text-blue-400">{part.part_number}</span>
                  <span className="text-sm text-gray-200 font-medium">{part.name}</span>
                  <span className="text-sm text-gray-400">{part.category}</span>
                  <span className="text-sm text-gray-300">{part.quantity_available}</span>
                  <span className="text-sm text-gray-400">{part.quantity_reserved}</span>
                  <span className={`text-sm font-semibold ${available <= 0 ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {available}
                  </span>
                  <span className="text-sm text-gray-300">
                    {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(part.unit_cost)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isLow && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                    <Badge variant={stock.variant}>{stock.label}</Badge>
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openReserve(part)}
                      disabled={available <= 0}
                    >
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                      Reserve
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}

      {/* Reserve Modal */}
      <Modal
        open={showReserveModal}
        onClose={() => setShowReserveModal(false)}
        title={`Reserve ${selectedPart?.name || 'Part'}`}
      >
        <form onSubmit={handleReserve} className="space-y-4">
          <div className="bg-[#0a0e1a] rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Available Qty</span>
              <span className="text-gray-200">{selectedPart ? selectedPart.quantity_available - selectedPart.quantity_reserved : 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Unit Cost</span>
              <span className="text-gray-200">
                {selectedPart ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(selectedPart.unit_cost) : '--'}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Work Order</label>
            <select
              required
              value={reserveWorkOrderId}
              onChange={e => setReserveWorkOrderId(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">Select a work order...</option>
              {workOrders.map((wo: any) => (
                <option key={wo.id} value={wo.id}>
                  {wo.order_number ?? wo.id.slice(0, 8)} — {wo.service_requests?.title ?? wo.description ?? 'Work Order'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Quantity to Reserve</label>
            <input
              type="number"
              min="1"
              max={selectedPart ? selectedPart.quantity_available - selectedPart.quantity_reserved : 1}
              required
              value={reserveQty}
              onChange={e => setReserveQty(e.target.value)}
              className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowReserveModal(false)} type="button">
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Reserve
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Part Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="Add Spare Part">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Part Number</label>
              <input
                required
                value={form.part_number}
                onChange={e => setForm(f => ({ ...f, part_number: e.target.value }))}
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
              <label className="block text-sm text-gray-400 mb-1">Category</label>
              <input
                required
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Site ID</label>
              <input
                required
                value={form.site_id}
                onChange={e => setForm(f => ({ ...f, site_id: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Quantity</label>
              <input
                type="number"
                min="0"
                required
                value={form.quantity_available}
                onChange={e => setForm(f => ({ ...f, quantity_available: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Unit Cost</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={form.unit_cost}
                onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Reorder Level</label>
              <input
                type="number"
                min="0"
                required
                value={form.reorder_level}
                onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))}
                className="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAddModal(false)} type="button">
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
