import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env, corsOrigins } from './config/env';
import { supabase } from './config/supabase';
import { requestContext } from './middleware/request-context';
import { globalLimiter } from './middleware/rate-limit';
import { errorHandler, notFoundHandler, asyncHandler } from './middleware/error-handler';

// ─── Dev B route modules (wired below) ──────────────────────────────────────
import authRoutes from './routes/auth.routes';
import siteRoutes from './routes/sites.routes';
import machineRoutes from './routes/machines.routes';
import technicianRoutes from './routes/technicians.routes';
import serviceRequestRoutes from './routes/service-requests.routes';
import workOrderRoutes from './routes/work-orders.routes';
import sparePartRoutes from './routes/spare-parts.routes';
import notificationRoutes from './routes/notifications.routes';
import reportRoutes from './routes/reports.routes';
// ─── Dev A route modules (workflow / AI / audit) ────────────────────────────
import workflowRoutes from './routes/workflow.routes';
import aiRoutes from './routes/ai.routes';
import auditRoutes from './routes/audit.routes';
// ─── Dev A feature modules (Phase B — 7 novelty features) ───
import impactRoutes from './routes/impact.routes';
import partsRoutes from './routes/parts.routes';
import visualDiagnosesRoutes from './routes/visual-diagnoses.routes';
import bidsRoutes from './routes/bids.routes';
import stagingRoutes from './routes/staging.routes';
import knowledgeRoutes from './routes/knowledge.routes';
import dashboardRoutes from './routes/dashboard.routes';
import documentRoutes from './routes/documents.routes';
import { mountDocs } from './schemas/openapi';

export function buildApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  // ── Security + platform middleware ──
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => {
        // allow same-origin / server-to-server (no origin) and any allowlisted origin
        if (!origin || corsOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Origin ${origin} not allowed by CORS`));
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(requestContext);
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(globalLimiter);

  // ── Health ──
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'dqbh-api', timestamp: new Date().toISOString() });
  });
  app.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      // Lightweight DB ping; reports db connectivity without failing the probe hard.
      const { error } = await supabase.from('sites').select('id', { count: 'exact', head: true });
      res.status(error ? 503 : 200).json({
        status: error ? 'degraded' : 'ok',
        db: error ? 'down' : 'up',
        timestamp: new Date().toISOString(),
      });
    }),
  );

  // ── API docs (OpenAPI / Swagger) ──
  mountDocs(app);

  // ───────────────────────── DEV B ROUTES ─────────────────────────
  app.use('/api/auth', authRoutes);
  app.use('/api/sites', siteRoutes);
  app.use('/api/machines', machineRoutes);
  app.use('/api/technicians', technicianRoutes);
  app.use('/api/service-requests', serviceRequestRoutes);
  app.use('/api/work-orders', workOrderRoutes);
  app.use('/api/spare-parts', sparePartRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportRoutes);

  // ══════════════════ DEV A ROUTES (merged) ══════════════════
  app.use('/api/service-requests', workflowRoutes); // adds /:id/transition, /:id/exception
  app.use('/api/ai', aiRoutes); // classify, predict, match, anomalies, analyze-diagnosis
  app.use('/api/audit', auditRoutes); // audit log + chain verify

  // Phase B feature routers (full sub-paths declared inside each, mounted at /api).
  app.use('/api', impactRoutes); // impact-analysis, dependencies
  app.use('/api', partsRoutes); // parts-sourcing, inventory, substitutes
  app.use('/api', visualDiagnosesRoutes); // visual-diagnoses, technician-diagnoses
  app.use('/api', bidsRoutes); // bid-rounds, bids
  app.use('/api', stagingRoutes); // staging
  app.use('/api', knowledgeRoutes); // knowledge
  app.use('/api', dashboardRoutes); // dashboard/sla-heatmap
  app.use('/api', documentRoutes); // document upload/list/delete
  // ════════════════════════════════════════════════════════

  // ── 404 + global error handler (must be last) ──
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const appEnv = env;
