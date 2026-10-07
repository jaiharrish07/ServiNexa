import { Router, Response } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/error-handler';
import { wrap } from '../utils/api-response';
import { reportQuerySchema } from '../schemas/reports';
import {
  getDashboardStats,
  getSLAReport,
  getMTTRReport,
  getUtilizationReport,
  getPartsRebalance,
} from '../services/reports';

const router = Router();

/** Parse + validate the optional ?site_id (req.query is not writable by validate middleware). */
const siteId = (req: AuthRequest): string | undefined => reportQuerySchema.parse(req.query).site_id;

// GET /api/reports/dashboard
router.get(
  '/dashboard',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(wrap('dashboard', await getDashboardStats(siteId(req))));
  }),
);

// GET /api/reports/sla
router.get(
  '/sla',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(wrap('sla_report', await getSLAReport(siteId(req))));
  }),
);

// GET /api/reports/mttr
router.get(
  '/mttr',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(wrap('mttr_report', await getMTTRReport(siteId(req))));
  }),
);

// GET /api/reports/utilization
router.get(
  '/utilization',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    res.json(wrap('utilization_report', await getUtilizationReport(siteId(req))));
  }),
);

// GET /api/reports/parts-rebalance
router.get(
  '/parts-rebalance',
  authenticate,
  authorize('ADMIN', 'OPS_MANAGER'),
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    res.json({ suggestions: await getPartsRebalance() });
  }),
);

export default router;
