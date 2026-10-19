import axios from 'axios';
import { logger } from '../utils/logger';
import { getSettings, isConfigured } from './settings';
import { emitKioskEvent } from './ipc';
import { getApiUrl } from '../config';

let heartbeatInterval: NodeJS.Timeout | null = null;

export function startHeartbeat() {
  if (heartbeatInterval) return;

  const sendHeartbeat = async () => {
    if (!isConfigured()) {
      logger.debug('Kiosk not configured, skipping heartbeat');
      return;
    }

    const settings = getSettings();
    const apiUrl = getApiUrl();

    try {
      const response = await axios.get(`${apiUrl}/api/printer/heartbeat`, {
        headers: {
          'X-Kiosk-Key': settings.apiKey,
        },
        timeout: 5000,
      });

      emitKioskEvent('heartbeat:success', response.data);
      logger.debug('Heartbeat sent successfully');
    } catch (error) {
      logger.warn({ err: error }, 'Heartbeat failed');
      emitKioskEvent('heartbeat:failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  sendHeartbeat();

  const settings = getSettings();
  heartbeatInterval = setInterval(sendHeartbeat, settings.heartbeatInterval);

  logger.info({ interval: settings.heartbeatInterval }, 'Heartbeat started');
}

export function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info('Heartbeat stopped');
  }
}
