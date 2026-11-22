import { config } from '../config.js';

/**
 * Consulta las fuentes de torrents y resuelve los enlaces cacheados en Torbox.
 * Aplica los filtros de resolución (1080p vs 4K) y tamaño máximo de archivo.
 */
export async function getStreamsForMedia(type, id, maxRes = '1080p') {
  if (!config.torboxApiKey) {
    console.warn('[Scrapers] Advertencia: No se ha configurado TORBOX_API_KEY en .env');
    return [];
  }

  const streams = [];

  try {
    // 1. Consultar a Torrentio configurado con la clave privada de Torbox
    const torrentioUrl = `https://torrentio.strem.fun/torbox=${config.torboxApiKey}/stream/${type}/${encodeURIComponent(id)}.json`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

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
    console.error('[Scrapers] Error consultando Torrentio/Torbox:', err.message);
  }

  // 2. Aplicar filtros según el plan del usuario
  const filteredStreams = streams.filter(stream => {
    const textToCheck = `${stream.name || ''} ${stream.title || ''}`.toLowerCase();

    // Si el usuario tiene plan 1080p, eliminamos 4K y Remux pesados
    if (maxRes === '1080p') {
      const is4K = textToCheck.includes('4k') ||
                   textToCheck.includes('2160p') ||
                   textToCheck.includes('uhd');
      if (is4K) return false;

      // Filtrar archivos mayores a 8GB buscando patrones tipo '12.5 gb', '25gb', etc.
      const sizeMatch = textToCheck.match(/(\d+(?:\.\d+)?)\s*(?:gb|gigabytes)/i);
      if (sizeMatch) {
        const sizeGb = parseFloat(sizeMatch[1]);
        if (sizeGb > 8.5) return false;
      }
    }

    return true;
  });

  // 3. Personalizar la apariencia de los streams para el usuario
  return filteredStreams.map(stream => {
    const isCached = (stream.name || '').includes('[TB+]') || (stream.name || '').includes('[RD+]') || true;
    const badge = maxRes === '4k' ? '⚡ [VIP 4K]' : '⚡ [VIP 1080p]';

    return {
      ...stream,
      name: `${badge}\n${config.serviceName}`,
      title: stream.title || 'Torbox Direct Stream'
    };
  });
}
