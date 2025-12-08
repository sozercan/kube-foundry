import express from 'express';
import cors from 'cors';
import healthRouter from './routes/health';
import modelsRouter from './routes/models';
import deploymentsRouter from './routes/deployments';
import settingsRouter from './routes/settings';
import installationRouter from './routes/installation';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Middleware
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Routes
app.use('/api/health', healthRouter);
app.use('/api/models', modelsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/installation', installationRouter);

app.use((req, res, next) => {
  console.log(`[Middleware] Checking /api/deployments for ${req.url}`);
  next();
});

app.use('/api/deployments', deploymentsRouter);
app.use('/api/cluster', healthRouter);

// 404 handler for unmatched routes
app.use((req, res) => {
  console.log(`[404] No route matched: ${req.method} ${req.url}`);
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.url}`, statusCode: 404 } });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`🚀 KubeFoundry backend running on http://localhost:${PORT}`);
});

export default app;
