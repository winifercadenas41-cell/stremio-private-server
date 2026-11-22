import { Router } from 'express';
import { concurrencyService } from '../services/concurrency.js';
import { db } from '../db/database.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  const stats = db.getStats();
  const activeStreams = concurrencyService.getTotalActiveStreams();
  const usersSummary = db.getUsers().map(u => ({
    uuid: u.uuid,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    maxScreens: u.maxScreens,
    activeSessions: concurrencyService.getActiveSessionsCount(u.uuid)
  }));

  return res.json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    stats: {
      ...stats,
      activeLiveStreams: activeStreams
    },
    users: usersSummary
  });
});
