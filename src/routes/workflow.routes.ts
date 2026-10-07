import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { transitionStatus, raiseException, TransitionResult } from '../services/workflow';

const router = Router();

// Map workflow error codes to HTTP status codes.
function statusForResult(result: TransitionResult): number {
  switch (result.code) {
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'INVALID_TRANSITION':
      return 409; // conflict with current state
    case 'DB_ERROR':
      return 400;
    default:
      return 400;
  }
}

// POST /api/service-requests/:id/transition
router.post('/:id/transition', authenticate, async (req: AuthRequest, res: Response) => {
  const { status, ...metadata } = req.body || {};

  if (!status) {
    return res.status(400).json({ error: 'status is required' });
  }

  const result = await transitionStatus(
    req.params.id,
    status,
    req.user!.id,
    req.user!.role,
    metadata
  );

  if (!result.success) {
    return res.status(statusForResult(result)).json({ error: result.error, code: result.code });
  }

  res.json({ service_request: result.service_request });
});

// POST /api/service-requests/:id/exception
router.post('/:id/exception', authenticate, async (req: AuthRequest, res: Response) => {
  const { type, description, severity } = req.body || {};

  if (!type || !description) {
    return res.status(400).json({ error: 'type and description are required' });
  }

  const result = await raiseException(
    req.params.id,
    type,
    description,
    req.user!.id,
    req.user!.role,
    severity
  );

  if (!result.success) {
    return res.status(statusForResult(result)).json({
      error: result.error,
      code: result.code,
      service_request: result.service_request,
    });
  }

  res.json({ service_request: result.service_request });
});

export default router;
