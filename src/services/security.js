import crypto from 'crypto';

// Secreto criptográfico del servidor para firmar sesiones
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Almacén de sesiones activas en memoria: sessionId -> { expiresAt, ip }
const activeSessions = new Map();

// Almacén de intentos de login por IP: ip -> { attempts, lockedUntil }
const loginAttempts = new Map();

// ----------------------------------------------------
// 1. ESCUDO ANTI-FUERZA BRUTA (Rate Limiting)
// ----------------------------------------------------
export function checkRateLimit(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (record && record.lockedUntil && record.lockedUntil > now) {
    const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return {
      allowed: false,
      error: `Demasiados intentos fallidos. IP bloqueada por seguridad. Intenta de nuevo en ${remainingMinutes} minuto(s).`
    };
  }

  return { allowed: true };
}

export function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { attempts: 0, lockedUntil: null };

  record.attempts += 1;

  // Si falla 5 veces, bloqueo de 30 minutos
  if (record.attempts >= 5) {
    record.lockedUntil = now + 30 * 60 * 1000;
    console.warn(`[Seguridad] IP ${ip} bloqueada por 30 minutos tras 5 intentos fallidos.`);
  }

  loginAttempts.set(ip, record);

  const remaining = 5 - (record.attempts % 5);
  return {
    locked: record.lockedUntil !== null,
    remainingAttempts: record.lockedUntil ? 0 : remaining
  };
}

export function resetFailedAttempts(ip) {
  loginAttempts.delete(ip);
}

// ----------------------------------------------------
// 2. COMPARACIÓN SEGURA CONTRA ATAQUES DE TIEMPO
// ----------------------------------------------------
export function timingSafeCompare(input, expected) {
  if (typeof input !== 'string' || typeof expected !== 'string') return false;

  const hashInput = crypto.createHash('sha256').update(input).digest();
  const hashExpected = crypto.createHash('sha256').update(expected).digest();

  return crypto.timingSafeEqual(hashInput, hashExpected);
}

// ----------------------------------------------------
// 3. SESIONES CRIPTOGRÁFICAS FIRMADAS (HMAC-SHA256)
// ----------------------------------------------------
export function createSessionToken(ip) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 8 * 3600 * 1000; // 8 horas de validez

  activeSessions.set(sessionId, { expiresAt, ip });

  const payload = `${sessionId}.${expiresAt}`;
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

  return `${payload}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [sessionId, expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  const now = Date.now();

  if (isNaN(expiresAt) || expiresAt < now) {
    activeSessions.delete(sessionId);
    return false;
  }

  const payload = `${sessionId}.${expiresAtStr}`;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');

  if (!timingSafeCompare(signature, expectedSig)) {
    return false;
  }

  const session = activeSessions.get(sessionId);
  if (!session || session.expiresAt < now) {
    return false;
  }

  return true;
}

export function revokeSessionToken(token) {
  if (!token) return;
  const parts = token.split('.');
  if (parts.length === 3) {
    activeSessions.delete(parts[0]);
  }
}

// ----------------------------------------------------
// 4. AUTENTICACIÓN EN DOS PASOS (2FA - TOTP RFC 6238)
// ----------------------------------------------------
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let bits = '';
  for (let i = 0; i < bytes.length; i++) {
    bits += bytes[i].toString(2).padStart(8, '0');
  }

  let base32 = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    base32 += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return base32;
}

function base32ToBuffer(base32) {
  const cleaned = base32.toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTOTP(secretBase32, timeStep = 30) {
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter));

  const key = base32ToBuffer(secretBase32);
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export function verifyTOTP(token, secretBase32) {
  if (!token || !secretBase32) return false;
  const userToken = String(token).trim();

  // Validar ventana actual, anterior y siguiente (+-30s por desajustes de reloj)
  const nowSec = Math.floor(Date.now() / 1000);
  const key = base32ToBuffer(secretBase32);

  for (let offset = -1; offset <= 1; offset++) {
    const counter = Math.floor(nowSec / 30) + offset;
    const buffer = Buffer.alloc(8);
    buffer.writeBigInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
    const hmacOffset = hmac[hmac.length - 1] & 0x0f;
    const binary =
      ((hmac[hmacOffset] & 0x7f) << 24) |
      ((hmac[hmacOffset + 1] & 0xff) << 16) |
      ((hmac[hmacOffset + 2] & 0xff) << 8) |
      (hmac[hmacOffset + 3] & 0xff);

    const otp = (binary % 1000000).toString().padStart(6, '0');
    if (timingSafeCompare(userToken, otp)) {
      return true;
    }
  }

  return false;
}
