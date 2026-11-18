import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './lib/config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { categoriesRouter } from './routes/categories.js';
import { offersRouter } from './routes/offers.js';
import { bookingsRouter } from './routes/bookings.js';
import { walletRouter } from './routes/wallet.js';
import { notificationsRouter } from './routes/notifications.js';
import { profilesRouter } from './routes/profiles.js';
import { disputesRouter } from './routes/disputes.js';
import { adminRouter } from './routes/admin.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  if (config.env !== 'test') app.use(morgan(config.isProd ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/offers', offersRouter);
  app.use('/api/bookings', bookingsRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/profiles', profilesRouter);
  app.use('/api/disputes', disputesRouter);
  app.use('/api/admin', adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
