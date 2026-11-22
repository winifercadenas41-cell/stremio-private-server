import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Asegurar que existe el directorio de datos
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Database {
  constructor() {
    this.data = {
      users: [],
      settings: {}
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        if (!Array.isArray(this.data.users)) {
          this.data.users = [];
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.error('[DB] Error cargando base de datos, iniciando limpia:', err);
      this.data = { users: [], settings: {} };
    }
  }

  save() {
    try {
      const tempFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('[DB] Error guardando base de datos:', err);
    }
  }

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
    const activeUsers = this.data.users.filter(u => u.isActive).length;
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
}

export const db = new Database();
