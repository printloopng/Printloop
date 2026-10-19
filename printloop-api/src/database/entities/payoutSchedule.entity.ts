import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';

export enum PayoutCadence {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  
  MANUAL = 'manual',
}

@Entity('payout_schedules')
@Index('idx_payout_schedule_tenant', ['tenantId'], { unique: true })
export class PayoutSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({
    type: 'simple-enum',
    enum: PayoutCadence,
    default: PayoutCadence.WEEKLY,
  })
  cadence: PayoutCadence;

  
  @Column({ type: 'int', default: 5 })
  dayOfWeek: number;

  
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 5000 })
  minPayoutAmount: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  bankCode: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  accountNumber: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  accountName: string | null;

  
  @Column({ type: 'varchar', length: 64, nullable: true })
  recipientCode: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
