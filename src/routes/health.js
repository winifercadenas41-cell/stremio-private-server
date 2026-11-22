import { Router } from 'express';
import { concurrencyService } from '../services/concurrency.js';
import { db } from '../db/database.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  const stats = db.getStats();
  const activeStreams = concurrencyService.getTotalActiveStreams();

  return res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    stats: {
      ...stats,
      activeLiveStreams: activeStreams
    }
  });
});
