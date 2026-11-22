import { Router } from 'express';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { concurrencyService } from '../services/concurrency.js';
import { getStreamsForMedia } from '../services/scrapers.js';

export const stremioRouter = Router();

/**
 * Manifest del Addon para un usuario específico.
 */
stremioRouter.get('/:uuid/manifest.json', (req, res) => {
  const { uuid } = req.params;
  const user = db.getUserByUuid(uuid);

  if (!user || !user.isActive) {
    return res.status(403).json({
      id: `com.torbox.private.${uuid}`,
      version: '1.0.0',
      name: `${config.serviceName} (Suspendido)`,
      description: 'Tu cuenta se encuentra pausada. Contacta al administrador.',
      resources: [],
      types: [],
      catalogs: []
    });
  }

  const qualityBadge = user.maxRes === '4k' ? '4K Ultra HD' : '1080p Full HD';

  return res.json({
    id: `com.torbox.private.${uuid}`,
    version: '1.0.0',
    name: `${config.serviceName} [${user.maxScreens}P - ${qualityBadge}]`,
    description: `Servicio exclusivo para ${user.name}. Límite: ${user.maxScreens} pantallas en ${qualityBadge}.`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
  });
});

/**
 * Endpoint de resolución de streams en Stremio.
 */
stremioRouter.get('/:uuid/stream/:type/:id.json', async (req, res) => {
  const { uuid, type, id } = req.params;
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  const user = db.getUserByUuid(uuid);

  // 1. Validar existencia y estado de la cuenta
  if (!user || !user.isActive) {
    return res.json({
      streams: [{
        name: '⚠️ CUENTA SUSPENDIDA',
        title: 'Tu cuenta ha sido pausada o cancelada.\nContacta al administrador para renovar tu acceso.',
        url: config.warningVideoUrl
      }]
    });
  }

  // 2. Validar límite de pantallas simultáneas
  const concurrencyResult = concurrencyService.checkAndRegister(
    uuid,
    clientIp,
    id,
    user.maxScreens
  );

  if (!concurrencyResult.allowed) {
    console.warn(`[Concurrencia] UUID ${uuid} superó su límite de ${user.maxScreens} pantallas. Intento bloqueado.`);
    return res.json({
      streams: [{
        name: '⚠️ LÍMITE DE PANTALLAS',
        title: `Has alcanzado el límite de ${user.maxScreens} pantalla(s) simultáneas de tu plan.\nCierra la reproducción en otro dispositivo para ver aquí.`,
        url: config.warningVideoUrl
      }]
    });
  }

  // 3. Consultar y filtrar streams según la resolución permitida
  try {
    const streams = await getStreamsForMedia(type, id, user.maxRes);
    return res.json({ streams });
  } catch (err) {
    console.error(`[StremioRouter] Error resolviendo streams para ${id}:`, err);
    return res.json({ streams: [] });
  }
});
