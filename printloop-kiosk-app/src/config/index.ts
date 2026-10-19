import dotenv from 'dotenv';
dotenv.config();

// The server address lives in kiosk settings (src/main/settings.ts); API_URL
// in .env only pre-fills it during development.
export const config = {
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV === 'development',
  },
};
