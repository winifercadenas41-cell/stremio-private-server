# ⚡ Torbox VIP Streams - Servidor Privado & Gestor de Cuentas Stremio

Servidor privado para Stremio con **AIOStreams integrado**, **Torbox Debrid**, panel web de administración con **creación de cuentas en 1 clic** y control estricto de **pantallas simultáneas (estilo Netflix)** y resolución (1080p vs 4K).

---

## 🚀 Características Principales

1. **Creación Automática en Stremio (1 Clic):**
   - Registra al usuario en la API oficial de Stremio.
   - Le inyecta automáticamente tu Addon privado de Torbox + Catálogo de tendencias de streaming (Netflix, Disney+, Max).
   - Genera una plantilla lista para copiar y enviar al cliente por WhatsApp o Telegram.

2. **Control de Pantallas Simultáneas (1 a 4 Pantallas):**
   - Configurable al crear la cuenta o editable en caliente.
   - Si se supera el límite contratado (ej. una 3ª o 5ª pantalla), entrega un clip de aviso:
     > ⚠️ *"Has alcanzado el límite de pantallas de tu plan. Cierra la reproducción en otro dispositivo para continuar."*

3. **Selector de Resolución Máxima (1080p vs 4K):**
   - **Estándar (1080p):** Elimina enlaces 4K y archivos pesados para evitar que televisores sencillos o móviles se traben.
   - **Premium (4K):** Entrega todas las calidades (4K, Remux, HDR, Dolby Vision).

4. **Modificación de Planes en Caliente:**
   - Si un cliente pasa de 1080p a 4K o de 2 a 4 pantallas, lo cambias en el panel con dos clics y **se actualiza al instante sin que el cliente toque su televisor**.

5. **Kill Switch (Pausa de Cuentas):**
   - Si un usuario no renueva, puedes pausarlo con un clic; su Stremio dejará de funcionar sin afectar a los demás.

6. **Seguridad Absoluta de Torbox:**
   - Tu clave API de Torbox vive únicamente en el servidor; ningún usuario o televisor tiene acceso a ella.

---

## 🛠️ Estructura del Proyecto

```
stremio-server/
├── Dockerfile                  # Empaquetado para Render / Docker
├── render.yaml                 # Configuración automática de Render
├── package.json
├── .env.example                # Plantilla de variables de entorno
├── src/
│   ├── server.js               # Servidor Express principal
│   ├── config.js               # Lectura de variables de entorno
│   ├── db/
│   │   └── database.js         # Base de datos ligera con persistencia
│   ├── services/
│   │   ├── stremioApi.js       # Conexión oficial a Stremio API
│   │   ├── concurrency.js      # Validador de sesiones y pantallas
│   │   └── scrapers.js         # Filtros de Torbox y Torrentio
│   ├── routes/
│   │   ├── stremio.js          # Rutas del Addon de Stremio
│   │   ├── admin.js            # API del panel y webhook de upgrades
│   │   └── health.js           # Monitor Keep-Alive
│   └── views/
│       └── admin.html          # Panel web de administración
└── public/
    ├── style.css               # Diseño moderno oscuro
    └── app.js                  # Lógica del frontend
```

---

## 💻 Ejecución Local (Para Pruebas en tu PC)

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Crear archivo `.env`:**
   Copia el archivo `.env.example` y renómbralo a `.env`:
   ```ini
   PORT=3000
   TORBOX_API_KEY=tu_api_key_de_torbox
   ADMIN_PASSWORD=MiClaveSuperSegura123
   BASE_URL=http://localhost:3000
   ```

3. **Iniciar servidor:**
   ```bash
   npm start
   ```

4. **Entrar al Panel:**
   Abre tu navegador en: `http://localhost:3000/admin`

---

## ☁️ Despliegue en Render (Listo para Producción)

Cuando estés listo para subirlo a Render:
1. Sube esta carpeta a tu repositorio privado de GitHub.
2. En [Render.com](https://render.com), crea un **New Web Service** conectado a tu repositorio.
3. Elige el entorno **Docker**.
4. Añade las variables de entorno en Render:
   - `TORBOX_API_KEY` = Tu clave de Torbox.
   - `ADMIN_PASSWORD` = La contraseña que quieras para tu panel.
   - `BASE_URL` = La URL que te asigne Render (ej. `https://tu-servicio.onrender.com`).
5. ¡Listo! Tu panel y tus addons estarán activos en la nube 24/7.
