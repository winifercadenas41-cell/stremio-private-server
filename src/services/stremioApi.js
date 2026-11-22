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

    // Si el correo ya existe, intentamos login
    if (data.error && (data.error.includes('already') || data.error.includes('exists') || registerResponse.status === 400)) {
      console.log(`[StremioAPI] Correo ${email} ya existe, intentando login...`);
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
        return {
          success: true,
          authKey: loginData.result.authKey,
          userId: loginData.result.user?._id || null,
          isNew: false
        };
      }
    }

    return {
      success: false,
      error: data.error || 'Error al registrar cuenta en Stremio'
    };
  } catch (error) {
    console.error('[StremioAPI] Error en registro:', error);
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
    // 2. Cyberflix Catalog (Filas con tendencias de Netflix, Disney+, Max, etc.)
    {
      transportUrl: 'https://cyberflix.elfhosted.com/c/catalogs=netflix,disney,hbo,amazon/manifest.json',
      manifest: {
        id: 'org.cyberflix.catalog',
        version: '1.4.1',
        name: 'Cyberflix Catalog',
        description: 'Tendencias populares de plataformas de streaming',
        resources: ['catalog'],
        types: ['movie', 'series'],
        catalogs: [
          { type: 'movie', id: 'cyberflix.netflix', name: 'Netflix Movies' },
          { type: 'series', id: 'cyberflix.netflix', name: 'Netflix Series' },
          { type: 'movie', id: 'cyberflix.disney', name: 'Disney+ Movies' },
          { type: 'movie', id: 'cyberflix.hbo', name: 'Max Movies' }
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
