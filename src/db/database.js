import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Database {
  constructor() {
    this.data = {
      users: [],
      settings: {
        twoFactorSecret: null,
        twoFactorEnabled: false
      }
    };
    this.gitSha = null;
    this.syncTimeout = null;
    this.load();
    this.syncFromGitHub();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data.users = Array.isArray(parsed.users) ? parsed.users : [];
        this.data.settings = parsed.settings || { twoFactorSecret: null, twoFactorEnabled: false };
      } else {
        this.saveLocally();
      }
    } catch (err) {
      console.error('[DB] Error cargando base de datos local:', err);
      this.data = { users: [], settings: { twoFactorSecret: null, twoFactorEnabled: false } };
    }
  }

  saveLocally() {
    try {
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Error guardando base de datos local:', err);
    }
  }

  save() {
    this.saveLocally();
    this.scheduleGitHubSync();
  }

  // ----------------------------------------------------
  // PERSISTENCIA EN GITHUB (Gratis y Permanente)
  // ----------------------------------------------------
  async syncFromGitHub() {
    if (!config.githubToken || !config.githubRepo) return;

    try {
      const url = `https://api.github.com/repos/${config.githubRepo}/contents/data/database.json`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${config.githubToken}`,
          'User-Agent': 'StremioServer-DB',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (response.ok) {
        const fileData = await response.json();
        this.gitSha = fileData.sha;
        const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
        const parsed = JSON.parse(decoded);

        if (Array.isArray(parsed.users) && parsed.users.length > 0) {
          // Si GitHub tiene más datos o los datos remotos, fusionar
          this.data = parsed;
          this.saveLocally();
          console.log(`[DB] ☁️ Base de datos restaurada desde GitHub con éxito (${parsed.users.length} usuarios).`);
        }
      }
    } catch (err) {
      console.log('[DB] Nota: No se pudo leer backup de GitHub (se usará local):', err.message);
    }
  }

  scheduleGitHubSync() {
    if (!config.githubToken || !config.githubRepo) return;

    clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => {
      this.syncToGitHub().catch(() => {});
    }, 2500); // 2.5s debounce
  }

  async syncToGitHub() {
    if (!config.githubToken || !config.githubRepo) return;

    try {
      const url = `https://api.github.com/repos/${config.githubRepo}/contents/data/database.json`;
      const contentBase64 = Buffer.from(JSON.stringify(this.data, null, 2)).toString('base64');

      // Obtener el SHA actual si no lo tenemos
      if (!this.gitSha) {
        const getRes = await fetch(url, {
          headers: {
            'Authorization': `token ${config.githubToken}`,
            'User-Agent': 'StremioServer-DB'
          }
        });
        if (getRes.ok) {
          const getData = await getRes.json();
          this.gitSha = getData.sha;
        }
      }

      const body = {
        message: 'chore(db): Auto-sync database backup',
        content: contentBase64,
        sha: this.gitSha || undefined
      };

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${config.githubToken}`,
          'User-Agent': 'StremioServer-DB',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (putRes.ok) {
        const putData = await putRes.json();
        this.gitSha = putData.content?.sha || null;
        console.log('[DB] ☁️ Backup de base de datos sincronizado en GitHub con éxito.');
      }
    } catch (err) {
      console.error('[DB] Error sincronizando backup en GitHub:', err.message);
    }
  }

  // ----------------------------------------------------
  // MÉTODOS CRUD DE USUARIOS
  // ----------------------------------------------------
  getUsers() {
    return this.data.users;
  }

  getUserByUuid(uuid) {
    return this.data.users.find(u => u.uuid === uuid);
  }

  getUserByEmail(email) {
    return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  createUser(userData) {
    const newUser = {
      uuid: userData.uuid,
      name: userData.name || 'Cliente',
      email: userData.email,
      password: userData.password,
      authKey: userData.authKey || '',
      maxScreens: parseInt(userData.maxScreens || 4, 10),
      maxRes: userData.maxRes === '4k' ? '4k' : '1080p',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.users.push(newUser);
    this.save();
    return newUser;
  }

  updateUser(uuid, fields) {
    const user = this.getUserByUuid(uuid);
    if (!user) return null;

    if (fields.name !== undefined) user.name = fields.name;
    if (fields.maxScreens !== undefined) user.maxScreens = parseInt(fields.maxScreens, 10);
    if (fields.maxRes !== undefined) user.maxRes = fields.maxRes === '4k' ? '4k' : '1080p';
    if (fields.isActive !== undefined) user.isActive = Boolean(fields.isActive);
    if (fields.authKey !== undefined) user.authKey = fields.authKey;

    user.updatedAt = new Date().toISOString();
    this.save();
    return user;
  }

  deleteUser(uuid) {
    const initialLen = this.data.users.length;
    this.data.users = this.data.users.filter(u => u.uuid !== uuid);
    if (this.data.users.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  toggleUserStatus(uuid) {
    const user = this.getUserByUuid(uuid);
    if (!user) return null;
    user.isActive = !user.isActive;
    user.updatedAt = new Date().toISOString();
    this.save();
    return user;
  }

  getStats() {
    const totalUsers = this.data.users.length;
    const activeUsers = this.data.users.filter(u => u.isActive !== false).length;
    const standardUsers = this.data.users.filter(u => u.maxRes === '1080p').length;
    const premiumUsers = this.data.users.filter(u => u.maxRes === '4k').length;
    return {
      totalUsers,
      activeUsers,
      pausedUsers: totalUsers - activeUsers,
      standardUsers,
      premiumUsers
    };
  }

  getSettings() {
    if (!this.data.settings) {
      this.data.settings = { twoFactorSecret: null, twoFactorEnabled: false };
    }
    return this.data.settings;
  }

  updateSettings(newSettings) {
    this.data.settings = { ...this.getSettings(), ...newSettings };
    this.save();
    return this.data.settings;
  }
}

export const db = new Database();
