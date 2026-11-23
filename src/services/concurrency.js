import { config } from '../config.js';

class ConcurrencyService {
  constructor() {
    // Mapa en memoria: uuid -> Array de sesiones activas
    this.sessions = new Map();

    // Limpieza periódica cada 3 minutos
    setInterval(() => this.cleanup(), 3 * 60 * 1000);
  }

  cleanup() {
    const now = Date.now();
    const timeoutMs = config.sessionTimeoutMinutes * 60 * 1000;

    for (const [uuid, userSessions] of this.sessions.entries()) {
      const active = userSessions.filter(s => (now - s.lastSeen) < timeoutMs);
      if (active.length === 0) {
        this.sessions.delete(uuid);
      } else {
        this.sessions.set(uuid, active);
      }
    }
  }

  /**
   * Valida si el usuario puede abrir una nueva pantalla o continuar la actual.
   * Almacena metadatos detallados de reproducción para auditoría y visualización en tiempo real.
   * 
   * @param {string} uuid - UUID del usuario
   * @param {string} clientIp - IP del dispositivo
   * @param {string} mediaId - ID de la película/capítulo (ej. tt123456:1:1)
   * @param {number} maxScreens - Límite de pantallas simultáneas asignadas (1-4)
   * @param {object} details - Metadatos adicionales (mediaTitle, mediaPoster, streamQuality, device)
   * @returns {{ allowed: boolean, currentScreens: number, maxScreens: number }}
   */
  checkAndRegister(uuid, clientIp, mediaId, maxScreens, details = {}) {
    this.cleanup();

    const now = Date.now();
    let userSessions = this.sessions.get(uuid) || [];

    // 1. Verificar si esta sesión ya existe (mismo dispositivo y mismo contenido)
    const existingIndex = userSessions.findIndex(s => s.clientIp === clientIp && s.mediaId === mediaId);

    if (existingIndex !== -1) {
      // Renovar el timestamp y actualizar metadatos
      userSessions[existingIndex].lastSeen = now;
      if (details.mediaTitle) userSessions[existingIndex].mediaTitle = details.mediaTitle;
      if (details.mediaPoster) userSessions[existingIndex].mediaPoster = details.mediaPoster;
      if (details.streamQuality) userSessions[existingIndex].streamQuality = details.streamQuality;
      if (details.device) userSessions[existingIndex].device = details.device;

      this.sessions.set(uuid, userSessions);
      return {
        allowed: true,
        currentScreens: userSessions.length,
        maxScreens
      };
    }

    // 2. Si es una sesión del mismo dispositivo cambiando de película/episodio
    const sameDeviceIndex = userSessions.findIndex(s => s.clientIp === clientIp);
    if (sameDeviceIndex !== -1) {
      userSessions[sameDeviceIndex].mediaId = mediaId;
      userSessions[sameDeviceIndex].mediaTitle = details.mediaTitle || userSessions[sameDeviceIndex].mediaTitle || mediaId;
      userSessions[sameDeviceIndex].mediaPoster = details.mediaPoster || userSessions[sameDeviceIndex].mediaPoster || '';
      userSessions[sameDeviceIndex].streamQuality = details.streamQuality || userSessions[sameDeviceIndex].streamQuality || 'Reproducción en curso';
      userSessions[sameDeviceIndex].device = details.device || userSessions[sameDeviceIndex].device || 'Dispositivo Stremio';
      userSessions[sameDeviceIndex].startedAt = now;
      userSessions[sameDeviceIndex].lastSeen = now;

      this.sessions.set(uuid, userSessions);
      return {
        allowed: true,
        currentScreens: userSessions.length,
        maxScreens
      };
    }

    // 3. Es un nuevo dispositivo. Verificar si ya alcanzó el límite de pantallas
    if (userSessions.length >= maxScreens) {
      return {
        allowed: false,
        currentScreens: userSessions.length,
        maxScreens
      };
    }

    // 4. Registrar la nueva pantalla activa
    const sessionId = `s_${Math.random().toString(36).substring(2, 9)}`;
    userSessions.push({
      id: sessionId,
      clientIp,
      mediaId,
      mediaTitle: details.mediaTitle || mediaId,
      mediaPoster: details.mediaPoster || '',
      streamQuality: details.streamQuality || 'Enlace Torbox Directo',
      device: details.device || 'Dispositivo Stremio',
      startedAt: now,
      lastSeen: now
    });

    this.sessions.set(uuid, userSessions);

    return {
      allowed: true,
      currentScreens: userSessions.length,
      maxScreens
    };
  }

  /**
   * Obtiene la lista detallada de pantallas en reproducción para un usuario específico.
   */
  getUserSessions(uuid) {
    this.cleanup();
    const list = this.sessions.get(uuid) || [];
    const now = Date.now();

    return list.map(session => ({
      ...session,
      durationMinutes: Math.max(1, Math.round((now - session.startedAt) / 60000)),
      lastSeenSecondsAgo: Math.max(0, Math.round((now - session.lastSeen) / 1000))
    }));
  }

  /**
   * Desconecta una pantalla específica de un usuario.
   */
  terminateSession(uuid, sessionId) {
    let list = this.sessions.get(uuid) || [];
    const initialLen = list.length;
    list = list.filter(s => s.id !== sessionId);

    if (list.length === 0) {
      this.sessions.delete(uuid);
    } else {
      this.sessions.set(uuid, list);
    }

    return list.length < initialLen;
  }

  getActiveSessionsCount(uuid) {
    const userSessions = this.sessions.get(uuid) || [];
    return userSessions.length;
  }

  resetUserSessions(uuid) {
    this.sessions.delete(uuid);
    return true;
  }

  getTotalActiveStreams() {
    let total = 0;
    for (const list of this.sessions.values()) {
      total += list.length;
    }
    return total;
  }
}

export const concurrencyService = new ConcurrencyService();
