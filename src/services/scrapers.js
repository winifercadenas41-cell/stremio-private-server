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
  const audioLang = filters.audioLang || 'all';

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

    // Prioridad por Idioma
    if (audioLang === 'latino') {
      if (pA.hasLatino) scoreA += 1000;
      if (pB.hasLatino) scoreB += 1000;

      if (pA.hasMulti && (pA.hasLatino || pA.hasCastellano)) scoreA += 400;
      if (pB.hasMulti && (pB.hasLatino || pB.hasCastellano)) scoreB += 400;

      if (pA.hasCastellano) scoreA += 200;
      if (pB.hasCastellano) scoreB += 200;

      if (pA.hasEnglish) scoreA += 50;
      if (pB.hasEnglish) scoreB += 50;
    } else if (audioLang === 'castellano') {
      if (pA.hasCastellano) scoreA += 1000;
      if (pB.hasCastellano) scoreB += 1000;

      if (pA.hasMulti && (pA.hasCastellano || pA.hasLatino)) scoreA += 400;
      if (pB.hasMulti && (pB.hasCastellano || pB.hasLatino)) scoreB += 400;

      if (pA.hasLatino) scoreA += 200;
      if (pB.hasLatino) scoreB += 200;

      if (pA.hasEnglish) scoreA += 50;
      if (pB.hasEnglish) scoreB += 50;
    } else {
      // Idioma "todos": premiar enlaces en español (latino o castellano)
      if (pA.hasLatino || pA.hasCastellano) scoreA += 300;
      if (pB.hasLatino || pB.hasCastellano) scoreB += 300;
      if (pA.hasMulti) scoreA += 150;
      if (pB.hasMulti) scoreB += 150;
    }

    // Calidad de Resolución
    if (pA.resolution === '4k') scoreA += 80;
    if (pB.resolution === '4k') scoreB += 80;
    if (pA.resolution === '1080p') scoreA += 60;
    if (pB.resolution === '1080p') scoreB += 60;
    if (pA.resolution === '720p') scoreA += 20;
    if (pB.resolution === '720p') scoreB += 20;

    // Calidad de Fuente
    if (pA.source === 'BluRay Remux') scoreA += 35;
    if (pB.source === 'BluRay Remux') scoreB += 35;
    if (pA.source === 'BluRay') scoreA += 30;
    if (pB.source === 'BluRay') scoreB += 30;
    if (pA.source === 'WEB-DL') scoreA += 25;
    if (pB.source === 'WEB-DL') scoreB += 25;

    // Calidad de Audio
    if (pA.audioCodec?.includes('Atmos') || pA.audioCodec?.includes('TrueHD') || pA.audioCodec?.includes('DTS-HD')) scoreA += 15;
    if (pB.audioCodec?.includes('Atmos') || pB.audioCodec?.includes('TrueHD') || pB.audioCodec?.includes('DTS-HD')) scoreB += 15;
    if (pA.channels === '7.1' || pA.channels === '5.1') scoreA += 10;
    if (pB.channels === '7.1' || pB.channels === '5.1') scoreB += 10;

    // Semillas (hasta 10 puntos)
    scoreA += Math.min(pA.seeds || 0, 50) / 5;
    scoreB += Math.min(pB.seeds || 0, 50) / 5;

    return scoreB - scoreA;
  });

  // 3. Formateo visual elegante
  return parsedStreams.map(item => {
    return formatStreamDisplay(item.stream, item.parsed, maxRes);
  });
}
