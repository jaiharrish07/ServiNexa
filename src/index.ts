import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import { errorHandler } from './middleware/error-handler';

// --- Jai (Dev A) route modules ---
import aiRoutes from './routes/ai.routes';
import auditRoutes from './routes/audit.routes';
import workflowRoutes from './routes/workflow.routes';

// --- Dev B route modules (uncomment as they land on main) ---
// import authRoutes from './routes/auth.routes';
// import siteRoutes from './routes/sites.routes';
// import machineRoutes from './routes/machines.routes';
// import technicianRoutes from './routes/technicians.routes';
// import serviceRequestRoutes from './routes/service-requests.routes';
// import workOrderRoutes from './routes/work-orders.routes';
// import sparePartRoutes from './routes/spare-parts.routes';
// import notificationRoutes from './routes/notifications.routes';
// import reportRoutes from './routes/reports.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(compression());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Dev B routes (uncomment on merge) ---
// app.use('/api/auth', authRoutes);
// app.use('/api/sites', siteRoutes);
// app.use('/api/machines', machineRoutes);
// app.use('/api/technicians', technicianRoutes);
// app.use('/api/service-requests', serviceRequestRoutes);
// app.use('/api/work-orders', workOrderRoutes);
// app.use('/api/spare-parts', sparePartRoutes);
// app.use('/api/notifications', notificationRoutes);
// app.use('/api/reports', reportRoutes);

// --- Jai (Dev A) routes ---
// Workflow routes share the /api/service-requests base with Dev B's CRUD router;
// Express composes multiple routers on the same mount path cleanly.
app.use('/api/service-requests', workflowRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/audit', auditRoutes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 ServiNexa / DQBH API running on port ${PORT}`);
  console.log(`   Health:     http://localhost:${PORT}/health`);
  console.log(`   AI Service: ${process.env.AI_SERVICE_URL || 'http://localhost:8000'}\n`);
});

export default app;
