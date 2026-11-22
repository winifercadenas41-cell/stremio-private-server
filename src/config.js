import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  torboxApiKey: process.env.TORBOX_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  serviceName: process.env.SERVICE_NAME || 'Torbox VIP Streams',
  // Reducido a 15 minutos para que pantallas abandonadas se liberen rápido automáticamente
  sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '15', 10),
  warningVideoUrl: process.env.WARNING_VIDEO_URL || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  githubToken: process.env.GITHUB_TOKEN || '',
  githubRepo: process.env.GITHUB_REPO || 'winifercadenas41-cell/stremio-private-server'
};
