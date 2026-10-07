'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, Search, ChevronDown, ChevronUp, CheckCircle2,
  XCircle, Hash, Filter, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import type { AuditLog } from '@/lib/types';
import { useAuth } from '@/store/auth';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.03 } },
};

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

const actionVariant: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'danger',
  APPROVE: 'info',
  ASSIGN: 'info',
  RESERVE: 'info',
};

export default function AuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message?: string; details?: string } | null>(null);

  const canAccess = user?.role === 'ADMIN' || user?.role === 'OPS_MANAGER';

  useEffect(() => {
    if (canAccess) loadLogs();
    else setLoading(false);
  }, [canAccess]);

  async function loadLogs() {
    try {
      const res = await api.get<{ audit_logs: AuditLog[] }>('/api/audit');
      setLogs(res?.audit_logs ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  const entityTypes = useMemo(
    () => Array.from(new Set(logs.map(l => l.entity_type))).sort(),
    [logs]
  );

  const filtered = useMemo(() => {
    let result = logs;
    if (entityTypeFilter) result = result.filter(l => l.entity_type === entityTypeFilter);
    if (entityIdFilter.trim()) {
      const q = entityIdFilter.toLowerCase();
      result = result.filter(l => (l.entity_id ?? '').toLowerCase().includes(q));
    }
    return result;
  }, [logs, entityTypeFilter, entityIdFilter]);

  async function verifyChain() {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const result = await api.get<{ valid: boolean; message?: string; details?: string }>('/api/audit/verify');
      setVerifyResult(result);
      if (result.valid) toast.success('Hash chain is valid');
      else toast.error('Hash chain integrity check failed');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="flex items-center justify-center h-96">
        <EmptyState
          icon={<ShieldCheck size={24} />}
          title="Access Denied"
          description="Only Admins and Operations Managers can view audit logs"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Audit Log</h1>
          <p className="text-gray-400 text-sm mt-1">{logs.length} entries</p>
        </div>
        <Button onClick={verifyChain} loading={verifying}>
          <ShieldCheck className="w-4 h-4 mr-2" />
          Verify Hash Chain
        </Button>
      </div>

      {/* Verify result */}
      <AnimatePresence>
        {verifyResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex items-start gap-3 p-4 rounded-xl border ${
              verifyResult.valid
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}
          >
            {verifyResult.valid ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className={`text-sm font-medium ${verifyResult.valid ? 'text-emerald-300' : 'text-red-300'}`}>
                {verifyResult.valid ? 'Hash chain is valid' : 'Hash chain integrity check failed'}
              </p>
              {verifyResult.message && (
                <p className="text-sm text-gray-400 mt-1">{verifyResult.message}</p>
              )}
              {verifyResult.details && (
                <p className="text-xs text-gray-500 mt-1 font-mono">{verifyResult.details}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={entityTypeFilter}
            onChange={e => setEntityTypeFilter(e.target.value)}
            className="px-3 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">All Entity Types</option>
            {entityTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Filter by Entity ID..."
            value={entityIdFilter}
            onChange={e => setEntityIdFilter(e.target.value)}
            className="w-full sm:w-64 pl-10 pr-4 py-2 bg-[#1a1f2e] border border-[#2a3050] rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No audit entries found"
          description="No entries match the current filters"
        />
      ) : (
        <div className="bg-[#111827] border border-[#2a3050] rounded-xl overflow-hidden">
          {/* Header */}
          <div className="hidden xl:grid grid-cols-[160px_110px_100px_80px_140px_120px_120px_40px] gap-4 px-5 py-3 border-b border-[#2a3050] text-xs text-gray-400 font-medium uppercase tracking-wider">
            <span>Timestamp</span>
            <span>Entity Type</span>
            <span>Entity ID</span>
            <span>Action</span>
            <span>Performed By</span>
            <span>Field Changed</span>
            <span>Old / New</span>
            <span />
          </div>

          <motion.div variants={containerVariants} initial="hidden" animate="visible">
            {filtered.map(log => {
              const isExpanded = expandedId === log.id;
              return (
                <motion.div key={log.id} variants={rowVariants} layout>
                  <div
                    className="grid grid-cols-1 xl:grid-cols-[160px_110px_100px_80px_140px_120px_120px_40px] gap-2 xl:gap-4 px-5 py-3 border-b border-[#2a3050] hover:bg-[#1a1f2e] cursor-pointer transition-colors items-center"
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  >
                    <span className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </span>
                    <Badge variant="default">{log.entity_type}</Badge>
                    <span className="text-xs font-mono text-gray-400 truncate" title={log.entity_id ?? ''}>
                      {log.entity_id ? log.entity_id.slice(0, 8) + '...' : '--'}
                    </span>
                    <Badge variant={actionVariant[log.action] || 'default'}>
                      {log.action}
                    </Badge>
                    <span className="text-xs text-gray-300 truncate">
                      {log.performer?.full_name || (log.performed_by ? log.performed_by.slice(0, 8) + '...' : '--')}
                    </span>
                    <span className="text-xs text-gray-400 truncate">{log.field_changed || '--'}</span>
                    <div className="text-xs truncate">
                      {log.old_value || log.new_value ? (
                        <span>
                          <span className="text-red-400">{log.old_value || '--'}</span>
                          {' -> '}
                          <span className="text-emerald-400">{log.new_value || '--'}</span>
                        </span>
                      ) : (
                        <span className="text-gray-500">--</span>
                      )}
                    </div>
                    <div className="hidden xl:block">
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden bg-[#0f1320]"
                      >
                        <div className="px-5 py-4 space-y-3 text-sm">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <span className="text-gray-400 text-xs">Full Entity ID</span>
                              <p className="text-gray-200 font-mono text-xs break-all">{log.entity_id}</p>
                            </div>
                            <div>
                              <span className="text-gray-400 text-xs">Performed By (ID)</span>
                              <p className="text-gray-200 font-mono text-xs break-all">{log.performed_by}</p>
                            </div>
                            {log.performer && (
                              <div>
                                <span className="text-gray-400 text-xs">Performer</span>
                                <p className="text-gray-200 text-xs">{log.performer.full_name} ({log.performer.email})</p>
                              </div>
                            )}
                          </div>

                          {/* Hash details */}
                          <div className="pt-2 border-t border-[#2a3050]">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Hash className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-xs text-gray-400 font-medium">Hash Chain</span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-500 w-16 shrink-0">Current:</span>
                                <span className="text-xs text-gray-300 font-mono break-all">{log.hash}</span>
                              </div>
                              {log.prev_hash && (
                                <div className="flex items-start gap-2">
                                  <span className="text-xs text-gray-500 w-16 shrink-0">Previous:</span>
                                  <span className="text-xs text-gray-300 font-mono break-all">{log.prev_hash}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Metadata */}
                          {log.metadata && Object.keys(log.metadata || {}).length > 0 && (
                            <div className="pt-2 border-t border-[#2a3050]">
                              <span className="text-xs text-gray-400 font-medium">Metadata</span>
                              <pre className="mt-1 text-xs text-gray-300 font-mono bg-[#0a0e1a] rounded-lg p-3 overflow-x-auto">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      )}
    </div>
  );
}
