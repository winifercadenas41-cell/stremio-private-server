import { config } from '../config.js';

/**
 * Consulta las fuentes de torrents y resuelve los enlaces cacheados en Torbox.
 * Aplica filtros avanzados: resolución, tamaño máximo en GB, exclusión de CAM, bloqueo de Dolby Vision y prioridad de idioma.
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
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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

  // 1. Filtrado avanzado
  let filteredStreams = streams.filter(stream => {
    const textToCheck = `${stream.name || ''} ${stream.title || ''} ${stream.behaviorHints?.filename || ''}`.toLowerCase();

    // Filtro 1: Excluir grabaciones de cine basura (CAM, TS, Telesync, HDCAM, Screener)
    if (excludeCam) {
      const isCam = /\b(cam|camrip|ts|telesync|hdcam|hd-ts|screener|dvdscr)\b/i.test(textToCheck);
      if (isCam) return false;
    }

    // Filtro 2: Bloquear Dolby Vision (para televisores que se ven morados o verdes)
    if (blockDolbyVision) {
      const isDV = /\b(dv|dovi|dolby[\s.-]?vision)\b/i.test(textToCheck);
      // Si solo es Dolby Vision sin compatibilidad HDR10 básica, se descarta
      if (isDV && !textToCheck.includes('hdr')) return false;
    }

    // Filtro 3: Resolución máxima (1080p vs 4K)
    if (maxRes === '1080p') {
      const is4K = /\b(4k|2160p|uhd)\b/i.test(textToCheck);
      if (is4K) return false;
    }

    // Filtro 4: Tamaño máximo de archivo en Gigabytes
    if (maxFileSizeGb > 0) {
      const sizeMatch = textToCheck.match(/(\d+(?:\.\d+)?)\s*(?:gb|gigabytes)/i);
      if (sizeMatch) {
        const sizeGb = parseFloat(sizeMatch[1]);
        if (sizeGb > (maxFileSizeGb + 0.5)) return false;
      }
    }

    return true;
  });

  // 2. Ordenamiento inteligente según prioridad de idioma
  if (audioLang === 'latino' || audioLang === 'castellano' || audioLang === 'es') {
    filteredStreams.sort((a, b) => {
      const textA = `${a.name || ''} ${a.title || ''}`.toLowerCase();
      const textB = `${b.name || ''} ${b.title || ''}`.toLowerCase();

      let weightA = 0;
      let weightB = 0;

      if (audioLang === 'latino') {
        if (textA.includes('latino') || textA.includes('latin')) weightA += 3;
        if (textB.includes('latino') || textB.includes('latin')) weightB += 3;
      } else if (audioLang === 'castellano') {
        if (textA.includes('castellano') || textA.includes('spanish')) weightA += 3;
        if (textB.includes('castellano') || textB.includes('spanish')) weightB += 3;
      }

      if (textA.includes('dual') || textA.includes('multi')) weightA += 1;
      if (textB.includes('dual') || textB.includes('multi')) weightB += 1;

      return weightB - weightA;
    });
  }

  // 3. Etiquetado visual
  return filteredStreams.map(stream => {
    const badge = maxRes === '4k' ? '⚡ [VIP 4K]' : '⚡ [VIP 1080p]';
    return {
      ...stream,
      name: `${badge}\n${config.serviceName}`,
      title: stream.title || 'Torbox Direct Stream'
    };
  });
}
