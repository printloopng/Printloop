import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from 'typeorm';

@Entity('tenant_balances')
export class TenantBalance {
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  lifetimeTenantNet: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  lifetimeCommission: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  lifetimePayouts: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  pendingPayouts: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  availableBalance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
