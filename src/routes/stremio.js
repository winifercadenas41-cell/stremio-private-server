import { Router } from 'express';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { concurrencyService } from '../services/concurrency.js';
import { getStreamsForMedia } from '../services/scrapers.js';

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
 * Lista de Streams: Genera los enlaces apuntando a la ruta de Playback de tu servidor
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
    const rawStreams = await getStreamsForMedia(type, id, user.maxRes);

    // Envolvemos cada stream para que apunte al interceptor de Playback de tu servidor
    const wrappedStreams = rawStreams.map(stream => {
      if (!stream.url) return stream;

      const encodedTarget = Buffer.from(stream.url).toString('base64url');
      const playbackUrl = `${config.baseUrl}/stremio/${uuid}/playback/${encodedTarget}?id=${encodeURIComponent(id)}`;

      return {
        ...stream,
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
 * INTERCEPTOR DE PLAYBACK (El momento exacto del Play)
 * 1. Suma la sesión activa en el contador.
 * 2. Valida que no exceda las pantallas permitidas.
 * 3. Redirige (302) al enlace real de Torbox para reproducir a máxima velocidad.
 */
stremioRouter.get('/:uuid/playback/:token', (req, res) => {
  const { uuid, token } = req.params;
  const mediaId = req.query.id || 'media';
  const clientIp = getClientIp(req);

  const user = db.getUserByUuid(uuid);

  // 1. Validar que la cuenta exista y no esté pausada
  if (!user || user.isActive === false) {
    console.warn(`[Playback] Acceso denegado: Usuario ${uuid} no existe o está pausado.`);
    return res.redirect(302, config.warningVideoUrl);
  }

  // 2. Validar límite de pantallas simultáneas en tiempo real
  const concurrencyResult = concurrencyService.checkAndRegister(
    uuid,
    clientIp,
    mediaId,
    user.maxScreens
  );

  if (!concurrencyResult.allowed) {
    console.warn(`[Playback] ⚠️ Límite de ${user.maxScreens} pantallas alcanzado para ${user.name}. Bloqueando intento.`);
    return res.redirect(302, config.warningVideoUrl);
  }

  console.log(`[Playback] ▶️ ¡PLAY INICIADO! Cliente: ${user.name} | Pantallas activas: ${concurrencyResult.currentScreens}/${user.maxScreens}`);

  // 3. Decodificar la URL real de Torbox y redirigir al reproductor
  try {
    const targetUrl = Buffer.from(token, 'base64url').toString('utf-8');
    return res.redirect(302, targetUrl);
  } catch (e) {
    console.error('[Playback] Error al decodificar la URL del stream:', e);
    return res.redirect(302, config.warningVideoUrl);
  }
});
