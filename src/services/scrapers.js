import { config } from '../config.js';
import { parseTorrentMetadata, formatStreamDisplay } from './streamParser.js';

/**
 * Consulta las fuentes de torrents y resuelve los enlaces cacheados en Torbox.
 * Aplica filtros avanzados: resolución, tamaño máximo en GB, exclusión de CAM, bloqueo de Dolby Vision y prioridad de idioma.
 * Analiza metadatos y devuelve enlaces formateados visualmente para Stremio.
 */
export async function getStreamsForMedia(type, id, filters = {}) {
  if (!config.torboxApiKey) {
    console.warn('[Scrapers] Advertencia: No se ha configurado TORBOX_API_KEY');
    return [];
  }

  const maxRes = filters.maxRes || '1080p';
  const maxFileSizeGb = parseFloat(filters.maxFileSizeGb !== undefined ? filters.maxFileSizeGb : (maxRes === '4k' ? 0 : 8));
  const excludeCam = filters.excludeCam !== false; // default true
  const blockDolbyVision = Boolean(filters.blockDolbyVision);
  const audioLang = filters.audioLang || 'latino';
  const onlyCached = Boolean(filters.onlyCached);

  const streams = [];

  try {
    const torrentioUrl = `https://torrentio.strem.fun/torbox=${config.torboxApiKey}/stream/${type}/${encodeURIComponent(id)}.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);

    const response = await fetch(torrentioUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Stremio/4.4.168'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.streams)) {
        streams.push(...data.streams);
      }
    }
  } catch (err) {
    console.error('[Scrapers] Error consultando Torbox/Torrentio:', err.message);
  }

  // 1. Parseo inicial y Filtrado avanzado
  const parsedStreams = [];

  for (const stream of streams) {
    const parsed = parseTorrentMetadata(stream, maxRes);
    const fullText = `${stream.name || ''} ${stream.title || ''} ${stream.behaviorHints?.filename || ''}`.toLowerCase();

    // Filtro 0: Excluir enlaces sin caché si el filtro onlyCached está activo
    if (onlyCached && !parsed.isCached) {
      continue;
    }

    // Filtro 1: Excluir grabaciones de cine (CAM, TS, Telesync, HDCAM, Screener)
    if (excludeCam) {
      if (parsed.source === 'CAM-Rip' || /\b(cam|camrip|telesync|hdcam|hd-ts|screener|dvdscr)\b|\b(?<!d)ts\b/i.test(fullText)) {
        continue;
      }
    }

    // Filtro 2: Bloquear Dolby Vision (para TVs con incompatibilidad de perfiles que se ven moradas)
    if (blockDolbyVision) {
      if (parsed.hdr === 'Dolby Vision' && !fullText.includes('hdr10') && !fullText.includes('hdr')) {
        continue;
      }
    }

    // Filtro 3: Resolución máxima (1080p vs 4K)
    if (maxRes === '1080p') {
      if (parsed.resolution === '4k' || parsed.resolution === '8k' || /\b(4k|2160p|4320p|8k|uhd)\b/i.test(fullText)) {
        continue;
      }
    }

    // Filtro 4: Tamaño máximo de archivo en Gigabytes
    if (maxFileSizeGb > 0 && parsed.sizeGb > 0) {
      if (parsed.sizeGb > (maxFileSizeGb + 0.4)) {
        continue;
      }
    }

    parsedStreams.push({ stream, parsed });
  }

  // 2. Sistema de Puntuación y Ordenamiento Inteligente
  parsedStreams.sort((a, b) => {
    const pA = a.parsed;
    const pB = b.parsed;

    let scoreA = 0;
    let scoreB = 0;

    // NIVEL 1: PRIORIDAD ABSOLUTA AL CACHÉ INSTANTÁNEO (+10000)
    // Ningún enlace sin caché puede superar a uno en caché
    if (pA.isCached) scoreA += 10000;
    if (pB.isCached) scoreB += 10000;

    // NIVEL 2: PRIORIDAD MÁXIMA AL ESPAÑOL LATINO
    if (audioLang === 'castellano') {
      if (pA.hasCastellano) scoreA += 3000;
      if (pB.hasCastellano) scoreB += 3000;

      if (pA.hasMulti && (pA.hasCastellano || pA.hasLatino)) scoreA += 1500;
      if (pB.hasMulti && (pB.hasCastellano || pB.hasLatino)) scoreB += 1500;

      if (pA.hasLatino) scoreA += 800;
      if (pB.hasLatino) scoreB += 800;

      if (pA.hasEnglish) scoreA += 200;
      if (pB.hasEnglish) scoreB += 200;
    } else {
      // Prioridad Español Latino (por defecto para todos los clientes)
      if (pA.hasLatino) scoreA += 3000;
      if (pB.hasLatino) scoreB += 3000;

      if (pA.hasMulti && (pA.hasLatino || pA.hasCastellano)) scoreA += 1500;
      if (pB.hasMulti && (pB.hasLatino || pB.hasCastellano)) scoreB += 1500;

      if (pA.hasCastellano) scoreA += 800;
      if (pB.hasCastellano) scoreB += 800;

      if (pA.hasEnglish) scoreA += 200;
      if (pB.hasEnglish) scoreB += 200;
    }

    // NIVEL 3: Calidad de Resolución
    if (pA.resolution === '4k') scoreA += 120;
    if (pB.resolution === '4k') scoreB += 120;
    if (pA.resolution === '1080p') scoreA += 90;
    if (pB.resolution === '1080p') scoreB += 90;
    if (pA.resolution === '720p') scoreA += 30;
    if (pB.resolution === '720p') scoreB += 30;

    // NIVEL 4: Calidad de Fuente
    if (pA.source === 'BluRay Remux') scoreA += 45;
    if (pB.source === 'BluRay Remux') scoreB += 45;
    if (pA.source === 'BluRay') scoreA += 35;
    if (pB.source === 'BluRay') scoreB += 35;
    if (pA.source === 'WEB-DL') scoreA += 25;
    if (pB.source === 'WEB-DL') scoreB += 25;

    // NIVEL 5: Calidad de Audio
    if (pA.audioCodec?.includes('Atmos') || pA.audioCodec?.includes('TrueHD') || pA.audioCodec?.includes('DTS-HD')) scoreA += 15;
    if (pB.audioCodec?.includes('Atmos') || pB.audioCodec?.includes('TrueHD') || pB.audioCodec?.includes('DTS-HD')) scoreB += 15;
    if (pA.channels === '7.1' || pA.channels === '5.1') scoreA += 10;
    if (pB.channels === '7.1' || pB.channels === '5.1') scoreB += 10;

    // Semillas
    scoreA += Math.min(pA.seeds || 0, 50) / 5;
    scoreB += Math.min(pB.seeds || 0, 50) / 5;

    return scoreB - scoreA;
  });

  // 3. Formateo visual elegante
  return parsedStreams.map(item => {
    return formatStreamDisplay(item.stream, item.parsed, maxRes);
  });
}
