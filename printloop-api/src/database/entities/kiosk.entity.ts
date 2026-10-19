import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  BaseEntity,
} from 'typeorm';

export enum KioskStatus {
  ACTIVE = 'ACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  OFFLINE = 'OFFLINE',
  DISABLED = 'DISABLED',
}

@Entity('kiosks')
@Index('idx_kiosk_tenant', ['tenantId'])
export class Kiosk extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  campus: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  shopId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_kiosk_api_key')
  apiKey: string;

  @Column({
    type: 'simple-enum',
    enum: KioskStatus,
    default: KioskStatus.ACTIVE,
  })
  status: KioskStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerName: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerModel: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ipAddress: string;

  @Column({ type: 'datetime', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastPrintedAt: Date;

  
  @Column({ type: 'datetime', nullable: true })
  lastOfflineAlertAt: Date | null;

  
  @Column({ type: 'datetime', nullable: true })
  testPrintPassedAt: Date | null;

  
  @Column({ type: 'boolean', nullable: true })
  capColor: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  capDuplex: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  capA3: boolean | null;

  
  @Column({ type: 'text', nullable: true })
  capMedia: string | null;

  @Column({ type: 'datetime', nullable: true })
  capUpdatedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  totalJobsPrinted: number;

  @Column({ type: 'int', default: 0 })
  totalPagesPrinted: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  
  @Column({ type: 'varchar', length: 1024, nullable: true })
  mapsUrl: string | null;

  
  @Column({ type: 'boolean', default: true })
  isPublic: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
