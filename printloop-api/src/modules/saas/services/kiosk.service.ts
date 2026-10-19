import net from 'node:net';
import { repos } from '@/config/repos';
import { Kiosk, KioskStatus } from '@/database/entities/kiosk.entity';
import type { KioskRepository } from '@/modules/saas/repositories/kiosk.repository';
import crypto from 'crypto';

export class KioskService {
  private get kioskRepository(): KioskRepository {
    return repos.kiosk();
  }

  
  private generateApiKey(): string {
    const randomBytes = crypto.randomBytes(24).toString('base64url');
    return `KSK_${randomBytes}`;
  }

  
  async createKiosk(data: {
    name: string;
    
    tenantId?: string | null;
    location?: string;
    campus?: string;
    shopId?: string;
    printerName?: string;
    printerModel?: string;
    ipAddress?: string;
    notes?: string;
    mapsUrl?: string | null;
    isPublic?: boolean;
  }): Promise<Kiosk> {
    const apiKey = this.generateApiKey();

    const kiosk = this.kioskRepository.create({
      ...data,
      apiKey,
      status: KioskStatus.ACTIVE,
      isPublic: data.isPublic ?? true,
      mapsUrl: data.mapsUrl ?? null,
      totalJobsPrinted: 0,
      totalPagesPrinted: 0,
    });

    return await this.kioskRepository.save(kiosk);
  }

  
  async getKioskById(id: string, tenantId?: string | null): Promise<Kiosk | null> {
    if (tenantId) {
      return await this.kioskRepository.findOne({ where: { id, tenantId } });
    }
    return await this.kioskRepository.findOne({ where: { id } });
  }

  
  async getKioskByApiKey(apiKey: string): Promise<Kiosk | null> {
    return await this.kioskRepository.findOne({ where: { apiKey } });
  }

  
  async listKiosks(filters?: {
    tenantId?: string | null;
    status?: KioskStatus;
    campus?: string;
    location?: string;
  }): Promise<Kiosk[]> {
    if (!filters?.tenantId) {
      console.warn(
        '[kiosk.service] listKiosks called without tenantId — returning cross-tenant data. Retrofit the caller.',
      );
    }
    return this.kioskRepository.listFiltered(filters);
  }

  
  async updateKioskStatus(
    id: string,
    status: KioskStatus
  ): Promise<Kiosk | null> {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    kiosk.status = status;
    return await this.kioskRepository.save(kiosk);
  }

  
  async updateKiosk(
    id: string,
    updates: Partial<Omit<Kiosk, 'id' | 'apiKey' | 'createdAt' | 'updatedAt'>>
  ): Promise<Kiosk | null> {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    Object.assign(kiosk, updates);
    return await this.kioskRepository.save(kiosk);
  }

  
  async regenerateApiKey(id: string): Promise<Kiosk | null> {
    const kiosk = await this.getKioskById(id);
    if (!kiosk) return null;

    kiosk.apiKey = this.generateApiKey();
    return await this.kioskRepository.save(kiosk);
  }

  
  async recordPrintJob(
    kioskId: string,
    pageCount: number
  ): Promise<void> {
    await this.kioskRepository.increment(
      { id: kioskId },
      'totalJobsPrinted',
      1
    );
    await this.kioskRepository.increment(
      { id: kioskId },
      'totalPagesPrinted',
      pageCount
    );
    await this.kioskRepository.update(kioskId, { lastPrintedAt: new Date() });
  }

  
  async getOfflineKiosks(minutesOffline: number = 15): Promise<Kiosk[]> {
    return this.kioskRepository.findOffline(minutesOffline);
  }

  
  async testConnection(
    ipAddress: string,
    opts: { timeoutMs?: number; ports?: number[] } = {},
  ): Promise<{ ok: boolean; port: number | null; message: string }> {
    const ip = String(ipAddress || '').trim();
    if (!ip) return { ok: false, port: null, message: 'No IP address configured' };
    const ports = opts.ports && opts.ports.length ? opts.ports : [631, 6310, 9100];
    const timeoutMs = opts.timeoutMs ?? 1500;
    const tryPort = (port: number) =>
      new Promise<{ ok: boolean; port: number }>((resolve) => {
        const sock = new net.Socket();
        let done = false;
        const finish = (ok: boolean) => {
          if (done) return;
          done = true;
          try { sock.destroy(); } catch {  }
          resolve({ ok, port });
        };
        sock.setTimeout(timeoutMs);
        sock.once('connect', () => finish(true));
        sock.once('timeout', () => finish(false));
        sock.once('error', () => finish(false));
        try { sock.connect(port, ip); } catch { finish(false); }
      });
    for (const port of ports) {
      const r = await tryPort(port);
      if (r.ok) return { ok: true, port: r.port, message: `Reachable on ${ip}:${r.port}` };
    }
    return {
      ok: false,
      port: null,
      message: `No print port reachable on ${ip} (tried ${ports.join(', ')})`,
    };
  }

  
  async deleteKiosk(id: string): Promise<boolean> {
    const result = await this.kioskRepository.update(id, {
      status: KioskStatus.DISABLED,
    });
    return result.affected ? result.affected > 0 : false;
  }
}
