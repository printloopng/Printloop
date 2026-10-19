import dotenv from 'dotenv';
dotenv.config();

const PRODUCTION_API_URL = 'https://api.printloop.app';

export const API_URL = (process.env.API_URL?.trim() || PRODUCTION_API_URL).replace(/\/+$/, '');

export const config = {
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV === 'development',
  },
};
