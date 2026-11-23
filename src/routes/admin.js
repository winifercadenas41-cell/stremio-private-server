import { Router } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { registerStremioAccount, setupUserAddons } from '../services/stremioApi.js';
import { concurrencyService } from '../services/concurrency.js';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetFailedAttempts,
  timingSafeCompare,
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  generateBase32Secret,
  verifyTOTP
} from '../services/security.js';

export const adminRouter = Router();

const pending2FATokens = new Map();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function authMiddleware(req, res, next) {
  const token = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;

  if (!token || !verifySessionToken(token)) {
    return res.status(401).json({ error: 'Sesión no válida o expirada. Por favor inicia sesión de nuevo.' });
  }
  next();
}

/**
 * PASO 1 LOGIN: Contraseña con Rate-Limit
 */
adminRouter.post('/login', (req, res) => {
  const clientIp = getClientIp(req);

  const rateLimitCheck = checkRateLimit(clientIp);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({ success: false, error: rateLimitCheck.error });
  }

  const { password } = req.body;
  const isPasswordValid = timingSafeCompare(password || '', config.adminPassword);

  if (!isPasswordValid) {
    const attemptResult = recordFailedAttempt(clientIp);
    if (attemptResult.locked) {
      return res.status(429).json({
        success: false,
        error: 'Has superado el límite de 5 intentos fallidos. Tu IP ha sido bloqueada por 30 minutos.'
      });
    }
    return res.status(401).json({
      success: false,
      error: `Contraseña incorrecta. Te quedan ${attemptResult.remainingAttempts} intento(s) antes del bloqueo temporal.`
    });
  }

  resetFailedAttempts(clientIp);

  const tempToken = crypto.randomBytes(32).toString('hex');
  const settings = db.getSettings();

  if (!settings.twoFactorEnabled) {
    const newSecret = generateBase32Secret(20);
    const otpauthUrl = `otpauth://totp/TorboxVIP:${encodeURIComponent(settings.adminUser || 'Admin')}?secret=${newSecret}&issuer=TorboxVIP`;

    pending2FATokens.set(tempToken, {
      ip: clientIp,
      expiresAt: Date.now() + 5 * 60 * 1000,
      setupSecret: newSecret,
      isSetup: true
    });

    return res.json({
      success: true,
      require2FASetup: true,
      tempToken,
      secret: newSecret,
      otpauthUrl
    });
  }

  pending2FATokens.set(tempToken, {
    ip: clientIp,
    expiresAt: Date.now() + 5 * 60 * 1000,
    secret: settings.twoFactorSecret,
    isSetup: false
  });

  return res.json({
    success: true,
    require2FA: true,
    tempToken
  });
});

/**
 * PASO 2 LOGIN: Validar código 2FA
 */
adminRouter.post('/verify-2fa', (req, res) => {
  const clientIp = getClientIp(req);
  const { tempToken, code } = req.body;

  const pending = pending2FATokens.get(tempToken);
  if (!pending || pending.expiresAt < Date.now()) {
    pending2FATokens.delete(tempToken);
    return res.status(401).json({ success: false, error: 'Sesión temporal expirada. Ingresa la contraseña de nuevo.' });
  }

  const secretToVerify = pending.isSetup ? pending.setupSecret : pending.secret;
  const isCodeValid = verifyTOTP(code, secretToVerify);

  if (!isCodeValid) {
    return res.status(401).json({ success: false, error: 'Código 2FA incorrecto o expirado.' });
  }

  if (pending.isSetup) {
    db.updateSettings({
      twoFactorSecret: pending.setupSecret,
      twoFactorEnabled: true
    });
    console.log('[Seguridad] 2FA activado y verificado.');
  }

  pending2FATokens.delete(tempToken);
  const sessionToken = createSessionToken(clientIp);

  return res.json({
    success: true,
    token: sessionToken
  });
});

adminRouter.post('/logout', (req, res) => {
  const token = req.headers['authorization'] || req.headers['x-admin-token'];
  revokeSessionToken(token);
  return res.json({ success: true });
});

/**
 * Obtener estadísticas y lista de usuarios
 */
adminRouter.get('/users', authMiddleware, (req, res) => {
  const users = db.getUsers().map(user => ({
    ...user,
    activeScreensNow: concurrencyService.getActiveSessionsCount(user.uuid)
  }));
  const stats = db.getStats();
  const totalLiveStreams = concurrencyService.getTotalActiveStreams();

  return res.json({
    users,
    stats: {
      ...stats,
      totalLiveStreams
    }
  });
});

/**
 * Creación de usuario con Filtros Avanzados
 */
adminRouter.post('/users', authMiddleware, async (req, res) => {
  const {
    name,
    email,
    password,
    maxScreens,
    maxRes,
    maxFileSizeGb,
    excludeCam,
    blockDolbyVision,
    audioLang
  } = req.body;

  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const finalEmail = (email && email.trim()) || `vip_${randomSuffix}@torboxstream.com`;
  const finalPassword = (password && password.trim()) || `Vip${Math.floor(1000 + Math.random() * 9000)}!`;
  const finalScreens = parseInt(maxScreens || 4, 10);
  const finalRes = maxRes === '4k' ? '4k' : '1080p';
  const newUuid = uuidv4();

  console.log(`[Admin] Creando cuenta para: ${finalEmail} (${finalRes}, ${finalScreens} pantallas, max ${maxFileSizeGb}GB)`);

  const registerResult = await registerStremioAccount(finalEmail, finalPassword);
  if (!registerResult.success) {
    return res.status(500).json({
      error: `Error al conectar con Stremio: ${registerResult.error}`
    });
  }

  const createdUser = db.createUser({
    uuid: newUuid,
    name: name || 'Cliente VIP',
    email: finalEmail,
    password: finalPassword,
    authKey: registerResult.authKey,
    maxScreens: finalScreens,
    maxRes: finalRes,
    maxFileSizeGb: maxFileSizeGb !== undefined ? parseFloat(maxFileSizeGb) : (finalRes === '4k' ? 0 : 8),
    excludeCam: excludeCam !== undefined ? Boolean(excludeCam) : true,
    blockDolbyVision: Boolean(blockDolbyVision),
    audioLang: audioLang || 'all'
  });

  let addonSetupSuccess = false;
  if (registerResult.authKey) {
    const addonResult = await setupUserAddons(registerResult.authKey, newUuid);
    addonSetupSuccess = addonResult.success;
  }

  const qualityText = finalRes === '4k' ? '4K Ultra HD + HDR' : '1080p Full HD';
  const welcomeMessage = `🎬 *¡Tu servicio de Streaming está listo!*\n\n` +
    `👤 *Usuario:* ${finalEmail}\n` +
    `🔑 *Contraseña:* ${finalPassword}\n` +
    `📺 *Pantallas permitidas:* ${finalScreens} simultánea(s)\n` +
    `✨ *Calidad de imagen:* ${qualityText}\n\n` +
    `*Instrucciones de uso en tu TV o Móvil:*\n` +
    `1. Descarga e instala la app oficial de *Stremio* en tu Smart TV o teléfono.\n` +
    `2. Inicia sesión con el correo y contraseña indicados arriba.\n` +
    `3. ¡Listo! Todas las películas, series y tendencias ya están preconfiguradas.`;

  return res.json({
    success: true,
    user: createdUser,
    addonSetupSuccess,
    welcomeMessage
  });
});

/**
 * Modificar plan y filtros avanzados
 */
adminRouter.put('/users/:uuid', authMiddleware, async (req, res) => {
  const { uuid } = req.params;
  const {
    name,
    maxScreens,
    maxRes,
    maxFileSizeGb,
    excludeCam,
    blockDolbyVision,
    audioLang
  } = req.body;

  const updatedUser = db.updateUser(uuid, {
    name,
    maxScreens,
    maxRes,
    maxFileSizeGb,
    excludeCam,
    blockDolbyVision,
    audioLang
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  if (updatedUser.authKey) {
    await setupUserAddons(updatedUser.authKey, updatedUser.uuid).catch(() => {});
  }

  return res.json({ success: true, user: updatedUser });
});

/**
 * Pausar o Reactivar cuenta
 */
adminRouter.post('/users/:uuid/toggle', authMiddleware, (req, res) => {
  const { uuid } = req.params;
  const user = db.toggleUserStatus(uuid);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  return res.json({ success: true, user });
});

/**
 * Obtener detalles de sesiones en vivo de un usuario (Inspector en tiempo real)
 */
adminRouter.get('/users/:uuid/sessions', authMiddleware, (req, res) => {
  const { uuid } = req.params;
  const user = db.getUserByUuid(uuid);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const sessions = concurrencyService.getUserSessions(uuid);
  return res.json({
    user: {
      name: user.name,
      email: user.email,
      maxScreens: user.maxScreens,
      maxRes: user.maxRes
    },
    sessions
  });
});

/**
 * Desconectar una pantalla específica
 */
adminRouter.delete('/users/:uuid/sessions/:sessionId', authMiddleware, (req, res) => {
  const { uuid, sessionId } = req.params;
  const terminated = concurrencyService.terminateSession(uuid, sessionId);
  return res.json({ success: true, terminated });
});

/**
 * Reiniciar todas las sesiones activas de un usuario
 */
adminRouter.post('/users/:uuid/reset-sessions', authMiddleware, (req, res) => {
  const { uuid } = req.params;
  concurrencyService.resetUserSessions(uuid);
  return res.json({ success: true, message: 'Todas las sesiones han sido reseteadas' });
});

/**
 * Eliminar cuenta
 */
adminRouter.delete('/users/:uuid', authMiddleware, (req, res) => {
  const { uuid } = req.params;
  concurrencyService.resetUserSessions(uuid);
  const deleted = db.deleteUser(uuid);
  if (!deleted) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }
  return res.json({ success: true });
});

/**
 * Endpoint de automatización (Webhook / Bot / Upgrade)
 */
adminRouter.post('/upgrade', (req, res) => {
  const token = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  if (!token || !timingSafeCompare(token, config.adminPassword)) {
    return res.status(401).json({ error: 'No autorizado para webhook' });
  }

  const { email, uuid, maxScreens, maxRes, maxFileSizeGb } = req.body;
  const targetUser = uuid ? db.getUserByUuid(uuid) : db.getUserByEmail(email);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuario no encontrado para upgrade' });
  }

  const updated = db.updateUser(targetUser.uuid, {
    maxScreens: maxScreens !== undefined ? maxScreens : targetUser.maxScreens,
    maxRes: maxRes !== undefined ? maxRes : '4k',
    maxFileSizeGb: maxFileSizeGb !== undefined ? maxFileSizeGb : 0
  });

  return res.json({
    success: true,
    message: `Plan de ${updated.name} actualizado con éxito`,
    user: updated
  });
});
