import axios, { AxiosError, AxiosInstance } from 'axios';
import { getSettings } from './settings';

/** Axios client for the PrintLoop API, authenticated with this kiosk's key. */
export function kioskApi(): AxiosInstance {
  const { apiUrl, apiKey } = getSettings();
  if (!apiUrl) throw new Error('Set the PrintLoop server address in kiosk settings');
  return axios.create({
    baseURL: `${apiUrl}/api`,
    headers: { 'X-Kiosk-Key': apiKey },
    timeout: 15_000,
  });
}

/** Unwraps the `{ success, data }` envelope. */
export function unwrap<T>(body: any): T {
  return (body?.data ?? body) as T;
}

/** The API's own message when there is one, otherwise the transport error. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    const msg = err.response?.data?.message;
    if (msg) return String(msg);
    if (err.code === 'ECONNABORTED') return 'The PrintLoop server took too long to respond';
    if (!err.response) return 'Cannot reach the PrintLoop server';
  }
  return err instanceof Error ? err.message : String(err);
}

export function httpStatus(err: unknown): number | undefined {
  return err instanceof AxiosError ? err.response?.status : undefined;
}
