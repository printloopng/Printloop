import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type PrinterCapabilities = {
  maxDpi: 100 | 300 | 600;
  colorMode: 'bw' | 'color';
  paperSize: 'A4' | 'A3' | 'LETTER' | 'LEGAL' | null;
  duplex: boolean;
};

@Entity('printer_profiles')
@Index('idx_printer_profile_tenant', ['tenantId'])
export class PrinterProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid', nullable: true })
  kioskId: string | null;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  ippUri: string | null;

  @Column({ type: 'varchar', length: 20, default: 'unknown' })
  driverKind: string;

  @Column({ type: 'simple-json' })
  capabilities: PrinterCapabilities;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
