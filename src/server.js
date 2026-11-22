import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { stremioRouter } from './routes/stremio.js';
import { adminRouter } from './routes/admin.js';
import { healthRouter } from './routes/health.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del panel (CSS y JS)
app.use('/public', express.static(path.resolve(__dirname, '../public')));

// Ruta del Panel de Administración (Frontend)
app.get(['/', '/admin'], (req, res) => {
  res.sendFile(path.resolve(__dirname, 'views/admin.html'));
});

// Rutas de la API de Administración
app.use('/admin/api', adminRouter);

// Rutas del protocolo Stremio Addon
app.use('/stremio', stremioRouter);

// Ruta de comprobación de estado (Keep-Alive)
app.use('/health', healthRouter);

// Manejador 404
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
app.listen(config.port, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`⚡ ${config.serviceName} iniciado con éxito`);
  console.log(`📍 Servidor escuchando en: http://localhost:${config.port}`);
  console.log(`🖥️  Panel de Administración: http://localhost:${config.port}/admin`);
  console.log(`💓 Monitor Health: http://localhost:${config.port}/health`);
  console.log(`====================================================`);
});
