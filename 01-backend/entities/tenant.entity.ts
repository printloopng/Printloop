import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 30, unique: true })
  @Index('idx_tenant_slug')
  slug: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  customDomain: string | null;

  @Column({
    type: 'simple-enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status: TenantStatus;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 4,
    default: 0.1,
  })
  commissionPct: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  paystackSubaccountCode: string | null;

  @Column({ type: 'datetime', nullable: true })
  suspendedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  suspendReason: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string | null;

  @Column({ type: 'float', nullable: true })
  lat: number | null;

  @Column({ type: 'float', nullable: true })
  lng: number | null;

  @Column({ type: 'boolean', default: false })
  isDiscoverable: boolean;

  @Column({
    type: 'simple-enum',
    enum: ['open', 'busy', 'closed'],
    default: 'open',
  })
  availability: 'open' | 'busy' | 'closed';

  @Column({ type: 'varchar', length: 64, nullable: true })
  lmsKey: string | null;

  @Column({ type: 'simple-json', nullable: true })
  photos: string[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
