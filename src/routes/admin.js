import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { config } from '../config.js';
import { registerStremioAccount, setupUserAddons } from '../services/stremioApi.js';
import { concurrencyService } from '../services/concurrency.js';

export const adminRouter = Router();

// Middleware de autenticación simple para la API del panel
function authMiddleware(req, res, next) {
  const token = req.headers['authorization'] || req.headers['x-admin-token'] || req.query.token;
  if (!token || token !== config.adminPassword) {
    return res.status(401).json({ error: 'No autorizado. Contraseña incorrecta.' });
  }
  next();
}

/**
 * Validar contraseña del administrador
 */
adminRouter.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === config.adminPassword) {
    return res.json({ success: true, token: config.adminPassword });
  }
  return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
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

  // Generar correo o clave automática si el admin no especifica una
  const randomSuffix = Math.random().toString(36).substring(2, 7);
  const finalEmail = (email && email.trim()) || `vip_${randomSuffix}@torboxstream.com`;
  const finalPassword = (password && password.trim()) || `Vip${Math.floor(1000 + Math.random() * 9000)}!`;
  const finalScreens = parseInt(maxScreens || 4, 10);
  const finalRes = maxRes === '4k' ? '4k' : '1080p';
  const newUuid = uuidv4();

  console.log(`[Admin] Creando cuenta automática para: ${finalEmail} (${finalRes}, ${finalScreens} pantallas)`);

  // 1. Registrar cuenta en la API oficial de Stremio
  const registerResult = await registerStremioAccount(finalEmail, finalPassword);
  if (!registerResult.success) {
    return res.status(500).json({
      error: `Error al crear la cuenta en Stremio: ${registerResult.error}`
    });
  }

  // 2. Guardar usuario en base de datos local
  const createdUser = db.createUser({
    uuid: newUuid,
    name: name || 'Cliente VIP',
    email: finalEmail,
    password: finalPassword,
    authKey: registerResult.authKey,
    maxScreens: finalScreens,
    maxRes: finalRes
  });

  // 3. Inyectar addons en la cuenta de Stremio recién creada
  let addonSetupSuccess = false;
  if (registerResult.authKey) {
    const addonResult = await setupUserAddons(registerResult.authKey, newUuid);
    addonSetupSuccess = addonResult.success;
  }

  // 4. Plantilla de bienvenida para entregar al cliente
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

  // Si tiene authKey, refrescar la inyección de addons
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
 * Permite cambiar el plan de un usuario mediante API sin intervención manual.
 */
adminRouter.post('/upgrade', authMiddleware, async (req, res) => {
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
