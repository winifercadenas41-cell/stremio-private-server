import { config } from '../config.js';

class ConcurrencyService {
  constructor() {
    // Mapa en memoria: uuid -> Array de sesiones activas
    this.sessions = new Map();

    // Limpieza periódica cada 5 minutos
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
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
   * @param {string} uuid - UUID del usuario
   * @param {string} clientIp - IP o identificador del dispositivo
   * @param {string} mediaId - ID de la película/capítulo (ej. tt123456:1:1)
   * @param {number} maxScreens - Límite de pantallas simultáneas asignadas (1-4)
   * @returns {{ allowed: boolean, currentScreens: number, maxScreens: number }}
   */
  checkAndRegister(uuid, clientIp, mediaId, maxScreens) {
    this.cleanup();

    const now = Date.now();
    let userSessions = this.sessions.get(uuid) || [];

    // Verificar si esta sesión ya existe (mismo dispositivo o mismo contenido recientemente)
    const existingIndex = userSessions.findIndex(s => s.clientIp === clientIp && s.mediaId === mediaId);

    if (existingIndex !== -1) {
      // Renovar el timestamp de la sesión existente
      userSessions[existingIndex].lastSeen = now;
      this.sessions.set(uuid, userSessions);
      return {
        allowed: true,
        currentScreens: userSessions.length,
        maxScreens
      };
    }

    // Si es una sesión de un mismo dispositivo cambiando de película, actualizamos su sesión
    const sameDeviceIndex = userSessions.findIndex(s => s.clientIp === clientIp);
    if (sameDeviceIndex !== -1) {
      userSessions[sameDeviceIndex].mediaId = mediaId;
      userSessions[sameDeviceIndex].lastSeen = now;
      this.sessions.set(uuid, userSessions);
      return {
        allowed: true,
        currentScreens: userSessions.length,
        maxScreens
      };
    }

    // Es un dispositivo / pantalla nueva. Verificar si ya alcanzó el límite
    if (userSessions.length >= maxScreens) {
      return {
        allowed: false,
        currentScreens: userSessions.length,
        maxScreens
      };
    }

    // Registrar la nueva pantalla
    userSessions.push({
      clientIp,
      mediaId,
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
