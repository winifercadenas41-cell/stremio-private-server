const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

/**
 * Resuelve metadatos rápidos (nombre, año, póster) desde Cinemeta.
 * Si id es serie (ej: tt0903747:1:2), extrae el nombre de la serie y el episodio.
 */
export async function getMediaMetadata(type, id) {
  if (!id) return { title: 'Contenido Multimedia', year: '', poster: '' };

  const cacheKey = `${type}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    return cached.data;
  }

  // Desglosar si es serie (imdbId:season:episode)
  const parts = id.split(':');
  const imdbId = parts[0];
  const season = parts[1] ? parseInt(parts[1], 10) : null;
  const episode = parts[2] ? parseInt(parts[2], 10) : null;

  const actualType = type === 'series' || season !== null ? 'series' : 'movie';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1800);

    const res = await fetch(`https://v3-cinemeta.strem.io/meta/${actualType}/${imdbId}.json`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const meta = data.meta;

      if (meta) {
        let title = meta.name || imdbId;
        const year = meta.year || '';
        let poster = meta.poster || `https://images.metahub.space/poster/small/${imdbId}/img`;

        if (actualType === 'series' && season && episode) {
          const ep = meta.videos?.find(v => v.season === season && v.episode === episode);
          const epName = ep?.name ? ` - "${ep.name}"` : '';
          title = `${meta.name} (T${season}:E${episode}${epName})`;
          if (ep?.thumbnail) {
            poster = ep.thumbnail;
          }
        } else if (year) {
          title = `${meta.name} (${year})`;
        }

        const result = { title, year, poster };
        cache.set(cacheKey, { timestamp: Date.now(), data: result });
        return result;
      }
    }
  } catch (err) {
    // Timeout o error de red: fallback silencioso
  }

  const fallback = {
    title: id,
    year: '',
    poster: `https://images.metahub.space/poster/small/${imdbId}/img`
  };
  return fallback;
}
