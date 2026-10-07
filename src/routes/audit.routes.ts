import { Router, Response } from 'express';
import { supabase } from '../config/supabase';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { verifyAuditChain } from '../services/audit';

const router = Router();

/**
 * GET /
 * List the most recent audit logs (newest first, capped at 100).
 * Optionally filter by entity_type and/or entity_id.
 */
router.get(
  '/',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  async (req: AuthRequest, res: Response) => {
    let query = supabase
      .from('audit_logs')
      .select('*, performer:users!performed_by(full_name, email)')
      .order('created_at', { ascending: false })
      .limit(100);

    const entityType = req.query.entity_type as string | undefined;
    const entityId = req.query.entity_id as string | undefined;

    if (entityType) {
      query = query.eq('entity_type', entityType);
    }
    if (entityId) {
      query = query.eq('entity_id', entityId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({ error });
    }

    return res.json({ audit_logs: data });
  }
);

/**
 * GET /verify
 * Recompute and verify the tamper-evident audit hash chain.
 */
router.get(
  '/verify',
  authenticate,
  authorize('ADMIN'),
  async (req: AuthRequest, res: Response) => {
    const result = await verifyAuditChain(
      req.query.entity_type as string | undefined,
      req.query.entity_id as string | undefined
    );

    return res.json({
      chain_verification: result,
      message: result.valid
        ? `Chain intact. ${result.total_checked} entries verified.`
        : `Chain broken at entry ${result.broken_at ?? 'unknown'} (${
            result.reason ?? 'integrity failure'
          }). Possible tampering detected.`,
    });
  }
);

export default router;
