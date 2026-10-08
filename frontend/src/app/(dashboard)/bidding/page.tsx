'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Gavel,
  DollarSign,
  Clock,
  Trophy,
  Eye,
  ChevronDown,
  Send,
  CheckCircle2,
  Star,
  Wrench,
  ListOrdered,
  FileText,
  ShieldCheck,
  Loader2,
  Users,
  Plus,
  AlertCircle,
  Package,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import type { ServiceRequest, Bid } from '@/lib/types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const glassCard =
  'rounded-2xl border border-[#2a3050] bg-gradient-to-br from-[#111827]/80 to-[#1a1f2e]/60 backdrop-blur-xl p-6';

const inputClasses =
  'w-full rounded-lg border border-[#2a3050] bg-[#0a0e1a] px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50';

/* ------------------------------------------------------------------ */
/*  Bid Card (Admin/Ops view)                                          */
/* ------------------------------------------------------------------ */

function BidCard({
  bid,
  onAccept,
  accepting,
}: {
  bid: Bid;
  onAccept: (id: string) => void;
  accepting: boolean;
}) {
  const statusVariant = (s: string) => {
    const map: Record<string, 'success' | 'warning' | 'info' | 'default' | 'danger'> = {
      ACCEPTED: 'success',
      SUBMITTED: 'info',
      SCORED: 'warning',
      REJECTED: 'danger',
    };
    return map[s] || 'default';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[#2a3050] bg-[#111827]/60 p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-100">
            {bid?.technicians?.users?.full_name || bid?.technicians?.employee_code || 'Technician'}
          </p>
          {bid?.technicians?.employee_code && (
            <p className="text-xs text-gray-500">{bid.technicians.employee_code}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {bid?.score != null && (
            <span className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-sm font-bold text-amber-400">
              <Star size={14} />
              {bid.score}
            </span>
          )}
          <Badge variant={statusVariant(bid?.status ?? '')}>{bid?.status ?? 'UNKNOWN'}</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase mb-1">Proposed Solution</p>
          <p className="text-sm text-gray-300">{bid?.proposed_solution ?? 'N/A'}</p>
        </div>

        {bid?.approach_description && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Approach</p>
            <p className="text-sm text-gray-300">{bid.approach_description}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-1.5 text-sm text-gray-300">
            <Clock size={14} className="text-cyan-400" />
            <span>{bid?.labor_hours ?? 0}h labor</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-300">
            <DollarSign size={14} className="text-emerald-400" />
            <span>&#8377;{(bid?.total_cost ?? 0).toLocaleString()}</span>
          </div>
        </div>

        {(bid?.parts_list ?? []).length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase mb-1">Parts</p>
            <div className="flex flex-wrap gap-1.5">
              {(bid.parts_list ?? []).map((p, i) => (
                <span
                  key={i}
                  className="rounded-md bg-[#1a1f2e] px-2 py-1 text-xs text-gray-300 border border-[#2a3050]"
                >
                  <Package size={10} className="inline mr-1 text-gray-500" />
                  {p?.part_number ?? 'Unknown'} x{p?.quantity ?? 0}
                </span>
              ))}
            </div>
          </div>
        )}

        {bid?.status !== 'ACCEPTED' && bid?.status !== 'REJECTED' && (
          <div className="pt-2 flex justify-end">
            <Button
              size="sm"
              onClick={() => onAccept(bid.id)}
              loading={accepting}
              disabled={accepting}
            >
              <Trophy size={14} className="mr-1" />
              Accept Bid
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Submit Bid Modal (Technician view)                                 */
/* ------------------------------------------------------------------ */

interface BidForm {
  proposed_solution: string;
  labor_hours: string;
  total_cost: string;
  approach_description: string;
  parts_list: string; // JSON-friendly input
}

const emptyBid: BidForm = {
  proposed_solution: '',
  labor_hours: '',
  total_cost: '',
  approach_description: '',
  parts_list: '',
};

function SubmitBidModal({
  isOpen,
  onClose,
  requestId,
  onSubmitted,
}: {
  isOpen: boolean;
  onClose: () => void;
  requestId: string;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState<BidForm>(emptyBid);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof BidForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const submit = async () => {
    if (!form.proposed_solution || !form.labor_hours || !form.total_cost) {
      toast.error('Fill all required fields');
      return;
    }

    let partsList: Array<{ part_number: string; quantity: number }> = [];
    if (form.parts_list.trim()) {
      try {
        partsList = form.parts_list
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            const [pn, qty] = s.split(':');
            return { part_number: pn.trim(), quantity: parseInt(qty) || 1 };
          });
      } catch {
        toast.error('Invalid parts format. Use: PART-001:2, PART-002:1');
        return;
      }
    }

    setSubmitting(true);
    try {
      await api.post('/api/bids/submit', {
        service_request_id: requestId,
        proposed_solution: form.proposed_solution,
        labor_hours: parseFloat(form.labor_hours),
        total_cost: parseFloat(form.total_cost),
        approach_description: form.approach_description || undefined,
        parts_list: partsList,
      });
      toast.success('Bid submitted successfully');
      setForm(emptyBid);
      onClose();
      onSubmitted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={isOpen} onClose={onClose} title="Submit Your Bid">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Proposed Solution *
          </label>
          <textarea
            value={form.proposed_solution}
            onChange={(e) => update('proposed_solution', e.target.value)}
            rows={3}
            className={inputClasses + ' resize-none'}
            placeholder="Describe your proposed solution..."
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Approach Description
          </label>
          <textarea
            value={form.approach_description}
            onChange={(e) => update('approach_description', e.target.value)}
            rows={2}
            className={inputClasses + ' resize-none'}
            placeholder="How will you approach this repair?"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">Labor Hours *</label>
            <input
              type="number"
              value={form.labor_hours}
              onChange={(e) => update('labor_hours', e.target.value)}
              className={inputClasses}
              placeholder="e.g. 8"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-400">
              Total Cost (INR) *
            </label>
            <input
              type="number"
              value={form.total_cost}
              onChange={(e) => update('total_cost', e.target.value)}
              className={inputClasses}
              placeholder="e.g. 15000"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-400">
            Parts List (PART:QTY, comma-separated)
          </label>
          <input
            value={form.parts_list}
            onChange={(e) => update('parts_list', e.target.value)}
            className={inputClasses}
            placeholder="BEARING-001:2, SEAL-042:1"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={submitting}>
            <Send size={14} className="mr-1" />
            Submit Bid
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Admin / Ops Manager View                                           */
/* ------------------------------------------------------------------ */

function AdminView() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ service_requests?: ServiceRequest[] }>('/api/service-requests');
      const eligible = (data?.service_requests ?? []).filter(
        (r) => r?.status === 'BIDDING' || r?.status === 'BID_REVIEW'
      );
      setRequests(eligible);
    } catch {
      toast.error('Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openBidding = async (requestId: string) => {
    setActionLoading(`open-${requestId}`);
    try {
      await api.post(`/api/bid-rounds/${requestId}/open`, { top_n: 3 });
      toast.success('Bidding round opened');
      loadRequests();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to open bidding');
    } finally {
      setActionLoading(null);
    }
  };

  const viewBids = async (requestId: string) => {
    setSelectedRequest(requestId);
    setBidsLoading(true);
    try {
      const data = await api.get<{ bids?: Bid[] }>(`/api/bids/${requestId}`);
      setBids(data?.bids ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load bids');
    } finally {
      setBidsLoading(false);
    }
  };

  const scoreBids = async (requestId: string) => {
    setActionLoading(`score-${requestId}`);
    try {
      await api.post(`/api/bids/${requestId}/score`);
      toast.success('Bids scored');
      viewBids(requestId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Scoring failed');
    } finally {
      setActionLoading(null);
    }
  };

  const acceptBid = async (bidId: string) => {
    setActionLoading(`accept-${bidId}`);
    try {
      await api.put(`/api/bids/${bidId}/accept`);
      toast.success('Bid accepted');
      if (selectedRequest) viewBids(selectedRequest);
      loadRequests();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Accept failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {requests.length === 0 ? (
        <EmptyState
          icon={<Gavel size={24} />}
          title="No bid-eligible requests"
          description="No service requests are currently in BIDDING or BID_REVIEW status."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {requests.map((req, i) => (
            <motion.div
              key={req.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="rounded-xl border border-[#2a3050] bg-[#111827]/60 p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-100">{req.request_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{req.title}</p>
                </div>
                <Badge variant={req.status === 'BIDDING' ? 'warning' : 'info'}>
                  {req.status}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                <Badge variant="default">{req.category}</Badge>
                <Badge
                  variant={
                    req.priority === 'CRITICAL' || req.priority === 'HIGH'
                      ? 'danger'
                      : req.priority === 'MEDIUM'
                      ? 'warning'
                      : 'info'
                  }
                >
                  {req.priority}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-2">
                {req.status !== 'BID_REVIEW' && (
                  <Button
                    size="sm"
                    onClick={() => openBidding(req.id)}
                    loading={actionLoading === `open-${req.id}`}
                    disabled={!!actionLoading}
                  >
                    <Plus size={14} className="mr-1" />
                    Open Bidding
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => viewBids(req.id)}
                >
                  <Eye size={14} className="mr-1" />
                  View Bids
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => scoreBids(req.id)}
                  loading={actionLoading === `score-${req.id}`}
                  disabled={!!actionLoading}
                >
                  <ListOrdered size={14} className="mr-1" />
                  Score Bids
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Bids panel */}
      <AnimatePresence>
        {selectedRequest && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={glassCard}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
                <FileText size={18} className="text-indigo-400" />
                Bids for {requests.find((r) => r.id === selectedRequest)?.request_number}
              </h3>
              <button
                onClick={() => setSelectedRequest(null)}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                Close
              </button>
            </div>

            {bidsLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : bids.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No bids have been submitted yet.
              </p>
            ) : (
              <div className="space-y-4">
                {bids.map((bid) => (
                  <BidCard
                    key={bid.id}
                    bid={bid}
                    onAccept={acceptBid}
                    accepting={actionLoading === `accept-${bid.id}`}
                  />
                ))}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Technician View                                                    */
/* ------------------------------------------------------------------ */

function TechnicianView() {
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [showBidModal, setShowBidModal] = useState(false);
  const [myBids, setMyBids] = useState<Bid[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ service_requests?: ServiceRequest[] }>('/api/service-requests');
      const bidable = (data?.service_requests ?? []).filter((r) => r?.status === 'BIDDING');
      setRequests(bidable);
    } catch {
      toast.error('Failed to load bid rounds');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyBids = useCallback(async () => {
    setBidsLoading(true);
    try {
      const data = await api.get<{ bids?: Bid[] }>('/api/bids/my');
      setMyBids(data?.bids ?? []);
    } catch {
      /* non-critical */
    } finally {
      setBidsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadMyBids();
  }, [loadRequests, loadMyBids]);

  const openBidModal = (requestId: string) => {
    setSelectedRequestId(requestId);
    setShowBidModal(true);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Available rounds */}
      <div className={glassCard}>
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <Gavel size={18} className="text-amber-400" />
          Available Bid Rounds
        </h3>

        {requests.length === 0 ? (
          <EmptyState
            icon={<Gavel size={24} />}
            title="No open bid rounds"
            description="There are no service requests currently accepting bids."
          />
        ) : (
          <div className="space-y-3">
            {requests.map((req, i) => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="flex items-center justify-between rounded-lg border border-[#2a3050] bg-[#0a0e1a]/40 p-4"
              >
                <div>
                  <p className="text-sm font-medium text-gray-100">{req.request_number}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{req.title}</p>
                  <div className="mt-1.5 flex gap-2">
                    <Badge variant="default">{req.category}</Badge>
                    <Badge
                      variant={
                        req.priority === 'CRITICAL' || req.priority === 'HIGH'
                          ? 'danger'
                          : 'warning'
                      }
                    >
                      {req.priority}
                    </Badge>
                  </div>
                </div>
                <Button size="sm" onClick={() => openBidModal(req.id)}>
                  <Send size={14} className="mr-1" />
                  Place Bid
                </Button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* My bids */}
      <div className={glassCard}>
        <h3 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-400" />
          My Bids
        </h3>

        {bidsLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : myBids.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            You have not submitted any bids yet.
          </p>
        ) : (
          <div className="space-y-3">
            {myBids.map((bid) => {
              const statusVariant = (s: string) => {
                const map: Record<string, 'success' | 'warning' | 'info' | 'default' | 'danger'> = {
                  ACCEPTED: 'success',
                  SUBMITTED: 'info',
                  SCORED: 'warning',
                  REJECTED: 'danger',
                };
                return map[s] || 'default';
              };

              return (
                <div
                  key={bid.id}
                  className="rounded-lg border border-[#2a3050] bg-[#0a0e1a]/40 p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-gray-100 line-clamp-1">
                      {bid?.proposed_solution ?? 'N/A'}
                    </p>
                    <Badge variant={statusVariant(bid?.status ?? '')}>{bid?.status ?? 'UNKNOWN'}</Badge>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {bid?.labor_hours ?? 0}h
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign size={12} /> &#8377;{(bid?.total_cost ?? 0).toLocaleString()}
                    </span>
                    {bid?.score != null && (
                      <span className="flex items-center gap-1 text-amber-400">
                        <Star size={12} /> Score: {bid.score}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bid modal */}
      {selectedRequestId && (
        <SubmitBidModal
          isOpen={showBidModal}
          onClose={() => {
            setShowBidModal(false);
            setSelectedRequestId(null);
          }}
          requestId={selectedRequestId}
          onSubmitted={() => {
            loadMyBids();
            loadRequests();
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function BiddingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';
  const isTechnician = user?.role === 'TECHNICIAN';

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-3">
          <Gavel className="text-amber-400" size={28} />
          Collaborative Bidding
        </h1>
        <p className="mt-2 text-gray-400">
          {isAdmin
            ? 'Open bid rounds, review submissions, score and accept the best bids.'
            : 'Browse open bid rounds and submit your proposals.'}
        </p>
      </motion.div>

      {isAdmin && <AdminView />}
      {isTechnician && <TechnicianView />}
      {!isAdmin && !isTechnician && (
        <EmptyState
          icon={<AlertCircle size={24} />}
          title="Access Limited"
          description="Bidding is available to Operations Managers, Admins, and Technicians."
        />
      )}
    </div>
  );
}
