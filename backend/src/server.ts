import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './config/database';
import apiRoutes from './routes/api.routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { SchedulerService } from './services/scheduler.service';

dotenv.config();

const app = express();
const schedulerService = new SchedulerService();

const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || origin.startsWith('chrome-extension://') || origin === 'http://localhost:3000') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRoutes);

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  schedulerService.stop();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  schedulerService.stop();
  await prisma.$disconnect();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);
});