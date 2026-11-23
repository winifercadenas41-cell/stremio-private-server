/**
 * Motor inteligente de análisis y formateo visual de streams para Stremio.
 * Analiza nombres de torrents y metadatos para generar títulos limpios, profesionales
 * y visualmente claros con banderas, resolución y códecs.
 */

export function parseDevice(ua = '') {
  const lower = ua.toLowerCase();
  if (lower.includes('android-tv') || lower.includes('googletv') || lower.includes('aft') || lower.includes('smarttv') || lower.includes('smart-tv')) {
    return '📺 Smart TV (Android)';
  }
  if (lower.includes('webos')) {
    return '📺 LG Smart TV (webOS)';
  }
  if (lower.includes('tizen')) {
    return '📺 Samsung TV (Tizen)';
  }
  if (lower.includes('exoplayer')) {
    return '📺 TV / Dispositivo Android';
  }
  if (lower.includes('windows') || lower.includes('win32') || lower.includes('win64')) {
    return '🖥️ PC (Windows)';
  }
  if (lower.includes('macintosh') || lower.includes('mac os')) {
    return '🖥️ Mac (Apple)';
  }
  if (lower.includes('linux')) {
    return '🖥️ Linux';
  }
  if (lower.includes('iphone') || lower.includes('ipad')) {
    return '📱 iPhone / iPad';
  }
  if (lower.includes('android')) {
    return '📱 Teléfono Android';
  }
  if (lower.includes('stremio')) {
    return '📱 App Stremio';
  }
  return '🌐 Stremio Player';
}

/**
 * Analiza el stream devuelto por Torrentio y extrae todos los metadatos.
 */
export function parseTorrentMetadata(stream, userMaxRes = '1080p') {
  const rawTitle = stream.title || '';
  const rawName = stream.name || '';
  const rawFilename = stream.behaviorHints?.filename || '';
  const fullText = `${rawName} ${rawTitle} ${rawFilename}`;
  const lower = fullText.toLowerCase();

  // 1. Resolución
  let resolution = '1080p';
  let resBadge = '1080p FHD';
  if (/4320p|8k/i.test(lower)) {
    resolution = '8k';
    resBadge = '4320p 8K';
  } else if (/2160p|4k|uhd/i.test(lower)) {
    resolution = '4k';
    resBadge = '4K UHD';
  } else if (/1080p|1080i|fhd/i.test(lower)) {
    resolution = '1080p';
    resBadge = '1080p FHD';
  } else if (/720p|hd\b/i.test(lower)) {
    resolution = '720p';
    resBadge = '720p HD';
  } else if (/480p|576p|dvd|sd\b/i.test(lower)) {
    resolution = 'sd';
    resBadge = 'SD';
  }

  // 2. Fuente / Rip
  let source = 'WEB-DL';
  if (/remux|bdremux/i.test(lower)) {
    source = 'BluRay Remux';
  } else if (/bluray|blu-ray|bdrip|brrip/i.test(lower)) {
    source = 'BluRay';
  } else if (/web-?dl|webrip|web-rip|amzn|nf|hmax|dsnp|apple|\bweb\b/i.test(lower)) {
    source = 'WEB-DL';
  } else if (/\b(hdtv|pdtv|dsr)\b/i.test(lower)) {
    source = 'HDTV';
  } else if (/\b(hdrip|dvdrip)\b/i.test(lower)) {
    source = 'HDRip';
  } else if (/\b(cam|camrip|telesync|hdcam|hd-ts|screener|dvdscr)\b|\b(?<!d)ts\b/i.test(lower)) {
    source = 'CAM-Rip';
  }

  // 3. Códec de Video y Rango Dinámico
  let videoCodec = '';
  if (/x265|h265|hevc/i.test(lower)) videoCodec = 'HEVC';
  else if (/av1/i.test(lower)) videoCodec = 'AV1';
  else if (/x264|h264|avc/i.test(lower)) videoCodec = 'H.264';
  else if (/xvid|divx/i.test(lower)) videoCodec = 'XviD';

  if (/10-?bit|hi10p/i.test(lower)) {
    videoCodec = videoCodec ? `${videoCodec} 10bit` : '10bit';
  }

  let hdr = '';
  if (/dv|dovi|dolby[\s.-]?vision/i.test(lower)) hdr = 'Dolby Vision';
  else if (/hdr10\+/i.test(lower)) hdr = 'HDR10+';
  else if (/hdr10|hdr\b/i.test(lower)) hdr = 'HDR';

  // 4. Códec de Audio y Canales
  let audioCodec = '';
  if (/atmos/i.test(lower)) audioCodec = 'Dolby Atmos';
  else if (/truehd/i.test(lower)) audioCodec = 'TrueHD';
  else if (/dts-?hd\s*ma/i.test(lower)) audioCodec = 'DTS-HD MA';
  else if (/dts-?hd/i.test(lower)) audioCodec = 'DTS-HD';
  else if (/dts/i.test(lower)) audioCodec = 'DTS';
  else if (/ddp|dd\+|eac3/i.test(lower)) audioCodec = 'DDP';
  else if (/ac3|dd5|dolby\s*digital/i.test(lower)) audioCodec = 'AC3';
  else if (/flac/i.test(lower)) audioCodec = 'FLAC';
  else if (/aac/i.test(lower)) audioCodec = 'AAC';

  let channels = '';
  if (/7\.1/i.test(lower)) channels = '7.1';
  else if (/5\.1/i.test(lower)) channels = '5.1';
  else if (/2\.0|stereo/i.test(lower)) channels = '2.0';

  // 5. Tamaño del archivo y Semillas
  let sizeText = '';
  let sizeGb = 0;
  const sizeMatch = rawTitle.match(/💾\s*(\d+(?:\.\d+)?)\s*(gb|mb)/i) || fullText.match(/(\d+(?:\.\d+)?)\s*(gb|mb)/i);
  if (sizeMatch) {
    const val = parseFloat(sizeMatch[1]);
    const unit = sizeMatch[2].toUpperCase();
    if (unit === 'GB') {
      sizeGb = val;
      sizeText = `${val.toFixed(1)} GB`;
    } else {
      sizeGb = val / 1024;
      sizeText = `${Math.round(val)} MB`;
    }
  }

  let seeds = 0;
  const seedsMatch = rawTitle.match(/👤\s*(\d+)/);
  if (seedsMatch) {
    seeds = parseInt(seedsMatch[1], 10);
  }

  // 6. Idiomas y Doblajes
  const hasLatino = /latino|latin\b|es-la|lam\b|audio latino/i.test(lower) || rawTitle.includes('🇲🇽');
  const hasCastellano = (/castellano|spanish|español|es-es/i.test(lower) && !/latino/i.test(lower)) || rawTitle.includes('🇪🇸');
  const hasEnglish = /english|eng\b|\bvo\b|vose/i.test(lower) || rawTitle.includes('🇬🇧') || rawTitle.includes('🇺🇸');
  const hasMulti = /dual|multi|tri|dual-audio|multi-audio/i.test(lower) || rawTitle.includes(' / ');

  const detectedLanguages = [];
  if (hasLatino) detectedLanguages.push('Español Latino');
  if (hasCastellano) detectedLanguages.push('Castellano');
  if (hasEnglish) detectedLanguages.push('Inglés');
  if (rawTitle.includes('🇫🇷') || /french|vff|vfi/i.test(lower)) detectedLanguages.push('Francés');
  if (rawTitle.includes('🇮🇹') || /ita|italian/i.test(lower)) detectedLanguages.push('Italiano');
  if (rawTitle.includes('🇩🇪') || /german|deutsch/i.test(lower)) detectedLanguages.push('Alemán');
  if (rawTitle.includes('🇧🇷') || /brazilian|pt-br/i.test(lower)) detectedLanguages.push('Portugués');
  if (rawTitle.includes('🇯🇵') || /japanese|jap/i.test(lower)) detectedLanguages.push('Japonés');
  if (rawTitle.includes('🇷🇺') || /russian|rus/i.test(lower)) detectedLanguages.push('Ruso');

  // Determinar idioma y bandera principal para el botón
  let mainFlag = '🇺🇸';
  let mainLang = 'Original (Eng)';

  if (hasLatino) {
    mainFlag = '🇲🇽';
    mainLang = 'Latino';
  } else if (hasCastellano) {
    mainFlag = '🇪🇸';
    mainLang = 'Castellano';
  } else if (hasMulti) {
    mainFlag = '🌐';
    mainLang = 'Multi Audio';
  } else if (detectedLanguages.length > 0 && !hasEnglish) {
    mainFlag = '🌐';
    mainLang = detectedLanguages[0];
  }

  return {
    resolution,
    resBadge,
    source,
    videoCodec,
    hdr,
    audioCodec,
    channels,
    sizeText,
    sizeGb,
    seeds,
    hasLatino,
    hasCastellano,
    hasEnglish,
    hasMulti,
    detectedLanguages,
    mainFlag,
    mainLang
  };
}

/**
 * Formatea un stream con el diseño elegante aprobado.
 * - name: Botón visual de 2 líneas con calidad + bandera de idioma.
 * - title: 3 líneas limpias (Calidad y Códecs, Audios identificados, Tamaño y Torbox).
 */
export function formatStreamDisplay(stream, parsed, userMaxRes = '1080p') {
  const badgeTier = userMaxRes === '4k' ? '⚡ [VIP 4K]' : '⚡ [VIP 1080p]';

  // Botón izquierdo
  const name = `${badgeTier}\n${parsed.mainFlag} ${parsed.mainLang}`;

  // Línea 1: Fuente, Calidad y Video Códecs
  const line1Parts = [
    `🎬 ${parsed.source} ${parsed.resBadge}`
  ];
  if (parsed.videoCodec) line1Parts.push(parsed.videoCodec);
  if (parsed.hdr) line1Parts.push(parsed.hdr);
  const line1 = line1Parts.join(' · ');

  // Línea 2: Audios y Sonido Envolvente
  const audioBadges = [];
  if (parsed.hasLatino) {
    audioBadges.push(parsed.channels ? `Español Latino (${parsed.channels})` : 'Español Latino');
  }
  if (parsed.hasCastellano) {
    audioBadges.push(parsed.channels && !parsed.hasLatino ? `Castellano (${parsed.channels})` : 'Castellano');
  }
  if (parsed.hasEnglish || (!parsed.hasLatino && !parsed.hasCastellano)) {
    audioBadges.push('Inglés');
  }
  if (parsed.hasMulti && !parsed.hasLatino && !parsed.hasCastellano) {
    audioBadges.push('Multi Audio');
  }

  const audioDetails = [];
  if (audioBadges.length > 0) {
    audioDetails.push(audioBadges.join(' · '));
  }
  if (parsed.audioCodec) {
    audioDetails.push(parsed.audioCodec);
  }
  const line2 = `🔊 ${audioDetails.join(' · ') || 'Audio Original'}`;

  // Línea 3: Tamaño y Caché Rápido
  const seedsInfo = parsed.seeds > 0 ? ` (${parsed.seeds} seeds)` : '';
  const sizeDisplay = parsed.sizeText ? `💾 ${parsed.sizeText}` : '💾 Directo';
  const line3 = `${sizeDisplay} · ⚡ Torbox Instantáneo${seedsInfo}`;

  const title = `${line1}\n${line2}\n${line3}`;

  // Resumen compacto para el inspector del panel admin
  const qualitySummary = `${parsed.resBadge} ${parsed.source} · ${parsed.mainFlag} ${parsed.mainLang}${parsed.sizeText ? ' · ' + parsed.sizeText : ''}`;

  return {
    ...stream,
    name,
    title,
    _parsed: parsed,
    _qualitySummary: qualitySummary
  };
}
