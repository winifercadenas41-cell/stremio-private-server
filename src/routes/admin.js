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

// Tokens temporales de 5 minutos para el paso entre Contraseña y 2FA
const pending2FATokens = new Map();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// Middleware de autenticación por Token Criptográfico de Sesión
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;

  if (!token || !verifySessionToken(token)) {
    return res.status(401).json({ error: 'Sesión no válida o expirada. Por favor inicia sesión de nuevo.' });
  }
  next();
}

/**
 * PASO 1 DE LOGIN: Validar contraseña con Rate-Limit y Anti-Fuerza Bruta
 */
adminRouter.post('/login', (req, res) => {
  const clientIp = getClientIp(req);

  // 1. Verificar si la IP está bloqueada por demasiados intentos
  const rateLimitCheck = checkRateLimit(clientIp);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({ success: false, error: rateLimitCheck.error });
  }

  const { password } = req.body;

  // 2. Comparación segura contra ataques de tiempo
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

  // Contraseña correcta -> Resetear contador de fallos
  resetFailedAttempts(clientIp);

  // 3. Crear token temporal de 5 minutos para el 2FA
  const tempToken = crypto.randomBytes(32).toString('hex');
  const settings = db.getSettings();

  // Si no está configurado el 2FA aún, generamos el secreto para la vinculación inicial
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

  // 2FA ya está activo: pedir el código de 6 dígitos
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
 * PASO 2 DE LOGIN: Validar código 2FA (TOTP de 6 dígitos)
 */
adminRouter.post('/verify-2fa', (req, res) => {
  const clientIp = getClientIp(req);
  const { tempToken, code } = req.body;

  const pending = pending2FATokens.get(tempToken);
  if (!pending || pending.expiresAt < Date.now()) {
    pending2FATokens.delete(tempToken);
    return res.status(401).json({ success: false, error: 'La sesión temporal ha expirado. Ingresa la contraseña de nuevo.' });
  }

  // Validar código TOTP contra el secreto
  const secretToVerify = pending.isSetup ? pending.setupSecret : pending.secret;
  const isCodeValid = verifyTOTP(code, secretToVerify);

  if (!isCodeValid) {
    return res.status(401).json({ success: false, error: 'Código de 6 dígitos incorrecto o expirado. Revisa tu app de autenticación.' });
  }

  // Si fue configuración inicial de 2FA, guardamos el secreto permanentemente
  if (pending.isSetup) {
    db.updateSettings({
      twoFactorSecret: pending.setupSecret,
      twoFactorEnabled: true
    });
    console.log('[Seguridad] 2FA activado y verificado por primera vez.');
  }

  // Eliminar token temporal
  pending2FATokens.delete(tempToken);

  // Crear token de sesión criptográfico firmado válido por 8 horas
  const sessionToken = createSessionToken(clientIp);

  return res.json({
    success: true,
    token: sessionToken
  });
});

/**
 * Cerrar sesión (revocar token criptográfico)
 */
adminRouter.post('/logout', (req, res) => {
  const token = req.headers['authorization'] || req.headers['x-admin-token'];
  revokeSessionToken(token);
  return res.json({ success: true });
});

/**
 * Obtener estadísticas y lista de usuarios con sus sesiones activas
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
 * Creación automática de usuario en Stremio con inyección de Addons (1 Clic)
 */
adminRouter.post('/users', authMiddleware, async (req, res) => {
  const { name, email, password, maxScreens, maxRes } = req.body;

  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const finalEmail = (email && email.trim()) || `vip_${randomSuffix}@torboxstream.com`;
  const finalPassword = (password && password.trim()) || `Vip${Math.floor(1000 + Math.random() * 9000)}!`;
  const finalScreens = parseInt(maxScreens || 4, 10);
  const finalRes = maxRes === '4k' ? '4k' : '1080p';
  const newUuid = uuidv4();

  console.log(`[Admin] Creando cuenta automática para: ${finalEmail} (${finalRes}, ${finalScreens} pantallas)`);

  const registerResult = await registerStremioAccount(finalEmail, finalPassword);
  if (!registerResult.success) {
    return res.status(500).json({
      error: `Error al crear la cuenta en Stremio: ${registerResult.error}`
    });
  }

  const createdUser = db.createUser({
    uuid: newUuid,
    name: name || 'Cliente VIP',
    email: finalEmail,
    password: finalPassword,
    authKey: registerResult.authKey,
    maxScreens: finalScreens,
    maxRes: finalRes
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
    `1. Descarga e instala la app oficial de *Stremio* en tu Smart TV (Samsung, LG, Google TV, Fire TV) o teléfono.\n` +
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
 * Modificar plan en caliente (pantallas y resolución)
 */
adminRouter.put('/users/:uuid', authMiddleware, async (req, res) => {
  const { uuid } = req.params;
  const { name, maxScreens, maxRes } = req.body;

  const updatedUser = db.updateUser(uuid, { name, maxScreens, maxRes });
  if (!updatedUser) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  if (updatedUser.authKey) {
    await setupUserAddons(updatedUser.authKey, updatedUser.uuid).catch(() => {});
  }

  return res.json({ success: true, user: updatedUser });
});

/**
 * Pausar o Reactivar cuenta (Kill Switch)
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
 * Reiniciar sesiones activas de un usuario
 */
adminRouter.post('/users/:uuid/reset-sessions', authMiddleware, (req, res) => {
  const { uuid } = req.params;
  concurrencyService.resetUserSessions(uuid);
  return res.json({ success: true, message: 'Sesiones reseteadas con éxito' });
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
 * Endpoint de automatización (Webhook / Bot / Pasarela de pago)
 */
adminRouter.post('/upgrade', (req, res) => {
  const token = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  if (!token || !timingSafeCompare(token, config.adminPassword)) {
    return res.status(401).json({ error: 'No autorizado para webhook' });
  }

  const { email, uuid, maxScreens, maxRes } = req.body;
  const targetUser = uuid ? db.getUserByUuid(uuid) : db.getUserByEmail(email);
  if (!targetUser) {
    return res.status(404).json({ error: 'Usuario no encontrado para upgrade' });
  }

  const updated = db.updateUser(targetUser.uuid, {
    maxScreens: maxScreens !== undefined ? maxScreens : targetUser.maxScreens,
    maxRes: maxRes !== undefined ? maxRes : '4k'
  });

  return res.json({
    success: true,
    message: `Plan de ${updated.name} actualizado con éxito`,
    user: updated
  });
});
