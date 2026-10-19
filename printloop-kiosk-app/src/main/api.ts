import axios, { AxiosError, AxiosInstance } from 'axios';
import { API_URL } from '../config';
import { getSettings } from './settings';

export function kioskApi(): AxiosInstance {
  return axios.create({
    baseURL: `${API_URL}/api`,
    headers: { 'X-Kiosk-Key': getSettings().apiKey },
    timeout: 15_000,
  });
}

export function unwrap<T>(body: any): T {
  return (body?.data ?? body) as T;
}

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
