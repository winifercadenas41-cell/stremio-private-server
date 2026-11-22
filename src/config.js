import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  torboxApiKey: process.env.TORBOX_API_KEY || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  baseUrl: (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  serviceName: process.env.SERVICE_NAME || 'Torbox VIP Streams',
  sessionTimeoutMinutes: parseInt(process.env.SESSION_TIMEOUT_MINUTES || '60', 10),
  warningVideoUrl: process.env.WARNING_VIDEO_URL || 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
};
