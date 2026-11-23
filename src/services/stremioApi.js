import { config } from '../config.js';

const STREMIO_API_URL = 'https://api.strem.io/api';

/**
 * Registra una cuenta nueva en Stremio oficial.
 * Si ya existe, intenta iniciar sesión para obtener el authKey.
 */
export async function registerStremioAccount(email, password) {
  try {
    // 1. Intentar registro
    const registerResponse = await fetch(`${STREMIO_API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'register',
        email,
        password,
        gdpr: true
      })
    });

    const data = await registerResponse.json();

    if (data.result && data.result.authKey) {
      return {
        success: true,
        authKey: data.result.authKey,
        userId: data.result.user?._id || null,
        isNew: true
      };
    }

    // Convertir el error de Stremio a texto de forma segura (sea string u objeto)
    const errorStr = (
      typeof data.error === 'string'
        ? data.error
        : (data.error?.message || JSON.stringify(data.error || ''))
    ).toLowerCase();

    // 2. Si el registro falló (por ejemplo, porque la cuenta ya existe), intentar login
    console.log(`[StremioAPI] Registro no completado (${errorStr}), intentando login para cuenta existente...`);
    
    const loginResponse = await fetch(`${STREMIO_API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'login',
        email,
        password
      })
    });

    const loginData = await loginResponse.json();
    if (loginData.result && loginData.result.authKey) {
      console.log(`[StremioAPI] Login exitoso para la cuenta existente: ${email}`);
      return {
        success: true,
        authKey: loginData.result.authKey,
        userId: loginData.result.user?._id || null,
        isNew: false
      };
    }

    const loginErrorStr = typeof loginData.error === 'string'
      ? loginData.error
      : (loginData.error?.message || 'Error en inicio de sesión. Verifica que la contraseña coincida con la de tu cuenta de Stremio.');

    return {
      success: false,
      error: loginErrorStr
    };
  } catch (error) {
    console.error('[StremioAPI] Error en registro/login:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Inyecta los addons automáticamente a la cuenta usando su authKey:
 * - Tu addon privado de AIOStreams con Torbox
 * - Cinemeta oficial (búsqueda de películas y series)
 * - Cyberflix / Streaming Catalogs (tendencias de Netflix, Disney, HBO, Prime)
 */
export async function setupUserAddons(authKey, userUuid) {
  if (!authKey) {
    throw new Error('Se requiere authKey para configurar los addons');
  }

  const privateAddonManifestUrl = `${config.baseUrl}/stremio/${userUuid}/manifest.json`;

  const addons = [
    // 1. Cinemeta oficial (catálogo base necesario para Stremio)
    {
      transportUrl: 'https://v3-cinemeta.strem.io/manifest.json',
      manifest: {
        id: 'com.linvo.cinemeta',
        version: '3.0.12',
        name: 'Cinemeta',
        description: 'Catálogo oficial de películas y series',
        resources: ['catalog', 'meta'],
        types: ['movie', 'series'],
        catalogs: [
          { type: 'movie', id: 'top' },
          { type: 'series', id: 'top' }
        ]
      }
    },
    // 2. Streaming Catalogs (Tendencias oficiales de Netflix, HBO Max, Disney+, Prime Video, Apple TV+)
    {
      transportUrl: 'https://7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club/manifest.json',
      manifest: {
        id: 'community.streaming-catalogs',
        version: '1.1.1',
        name: 'Streaming Catalogs',
        description: 'Tendencias populares de Netflix, Disney+, HBO Max, Prime Video y Apple TV+',
        resources: ['catalog'],
        types: ['movie', 'series'],
        catalogs: [
          { id: 'nfx', type: 'movie', name: 'Netflix' },
          { id: 'nfx', type: 'series', name: 'Netflix' },
          { id: 'hbm', type: 'movie', name: 'HBO Max' },
          { id: 'hbm', type: 'series', name: 'HBO Max' },
          { id: 'dnp', type: 'movie', name: 'Disney+' },
          { id: 'dnp', type: 'series', name: 'Disney+' },
          { id: 'amp', type: 'movie', name: 'Prime Video' },
          { id: 'amp', type: 'series', name: 'Prime Video' },
          { id: 'atp', type: 'movie', name: 'Apple TV+' },
          { id: 'atp', type: 'series', name: 'Apple TV+' }
        ]
      }
    },
    // 3. Tu addon privado con Torbox y límites
    {
      transportUrl: privateAddonManifestUrl,
      manifest: {
        id: `com.torbox.private.${userUuid}`,
        version: '1.0.0',
        name: config.serviceName,
        description: 'Streams privados en alta velocidad con Torbox',
        resources: ['stream'],
        types: ['movie', 'series'],
        idPrefixes: ['tt']
      }
    }
  ];

  try {
    const response = await fetch(`${STREMIO_API_URL}/addonCollectionSet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'addonCollectionSet',
        authKey,
        addons
      })
    });

    const data = await response.json();
    return {
      success: data.result && data.result.success !== false,
      data
    };
  } catch (error) {
    console.error('[StremioAPI] Error inyectando addons:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
