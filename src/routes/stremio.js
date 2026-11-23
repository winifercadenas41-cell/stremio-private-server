import { Router } from 'express';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { concurrencyService } from '../services/concurrency.js';
import { getStreamsForMedia } from '../services/scrapers.js';
import { getMediaMetadata } from '../services/cinemeta.js';
import { parseDevice } from '../services/streamParser.js';

export const stremioRouter = Router();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

/**
 * Manifest del Addon para un usuario específico.
 */
stremioRouter.get('/:uuid/manifest.json', (req, res) => {
  const { uuid } = req.params;
  const user = db.getUserByUuid(uuid);

  if (!user || user.isActive === false) {
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
    description: `Servicio VIP para ${user.name}. Límite: ${user.maxScreens} pantallas en ${qualityBadge}.`,
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: []
  });
});

/**
 * Lista de Streams: Genera los enlaces formateados con filtros avanzados
 */
stremioRouter.get('/:uuid/stream/:type/:id.json', async (req, res) => {
  const { uuid, type, id } = req.params;
  const user = db.getUserByUuid(uuid);

  if (!user || user.isActive === false) {
    return res.json({
      streams: [{
        name: '⚠️ CUENTA SUSPENDIDA',
        title: 'Tu cuenta ha sido pausada o cancelada.\nContacta al administrador para renovar tu acceso.',
        url: config.warningVideoUrl
      }]
    });
  }

  try {
    const filters = {
      maxRes: user.maxRes,
      maxFileSizeGb: user.maxFileSizeGb,
      excludeCam: user.excludeCam,
      blockDolbyVision: user.blockDolbyVision,
      audioLang: user.audioLang
    };

    const rawStreams = await getStreamsForMedia(type, id, filters);

    // Envolvemos cada stream con el interceptor de Playback 302 y metadatos de auditoría
    const wrappedStreams = rawStreams.map(stream => {
      if (!stream.url) return stream;

      const encodedTarget = Buffer.from(stream.url).toString('base64url');
      const qualityParam = encodeURIComponent(stream._qualitySummary || '');
      const playbackUrl = `${config.baseUrl}/stremio/${uuid}/playback/${encodedTarget}?id=${encodeURIComponent(id)}&type=${encodeURIComponent(type)}&q=${qualityParam}`;

      // Remover metadatos internos antes de enviar a la app de Stremio
      const { _parsed, _qualitySummary, ...cleanStream } = stream;

      return {
        ...cleanStream,
        url: playbackUrl
      };
    });

    return res.json({ streams: wrappedStreams });
  } catch (err) {
    console.error(`[StremioRouter] Error resolviendo streams para ${id}:`, err);
    return res.json({ streams: [] });
  }
});

/**
 * Interceptor de Playback 302 (Auditoría e Inspector en tiempo real)
 */
stremioRouter.get('/:uuid/playback/:token', async (req, res) => {
  const { uuid, token } = req.params;
  const mediaId = req.query.id || 'media';
  const mediaType = req.query.type || 'movie';
  const streamQuality = req.query.q || 'Enlace VIP Torbox';
  const clientIp = getClientIp(req);
  const userAgent = req.headers['user-agent'] || '';
  const device = parseDevice(userAgent);

  const user = db.getUserByUuid(uuid);

  if (!user || user.isActive === false) {
    console.warn(`[Playback] Acceso denegado: Usuario ${uuid} no existe o está pausado.`);
    return res.redirect(302, config.warningVideoUrl);
  }

  // Resolver título y póster mediante Cinemeta
  let mediaMeta = { title: mediaId, poster: '' };
  try {
    mediaMeta = await getMediaMetadata(mediaType, mediaId);
  } catch (e) {}

  const concurrencyResult = concurrencyService.checkAndRegister(
    uuid,
    clientIp,
    mediaId,
    user.maxScreens,
    {
      mediaTitle: mediaMeta.title,
      mediaPoster: mediaMeta.poster,
      streamQuality,
      device
    }
  );

  if (!concurrencyResult.allowed) {
    console.warn(`[Playback] ⚠️ Límite de ${user.maxScreens} pantallas alcanzado para ${user.name}. Bloqueando.`);
    return res.redirect(302, config.warningVideoUrl);
  }

  console.log(`[Playback] ▶️ ¡PLAY! Cliente: ${user.name} | Viendo: ${mediaMeta.title} | Calidad: ${streamQuality} | Dispositivo: ${device} | Pantallas activas: ${concurrencyResult.currentScreens}/${user.maxScreens}`);

  try {
    const targetUrl = Buffer.from(token, 'base64url').toString('utf-8');
    return res.redirect(302, targetUrl);
  } catch (e) {
    console.error('[Playback] Error decodificando URL del stream:', e);
    return res.redirect(302, config.warningVideoUrl);
  }
});
