import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WebhookEvent {
  JOB_COMPLETED = 'job.completed',
  JOB_FAILED = 'job.failed',
  CUSTOMER_SIGNED_UP = 'customer.signed_up',
  PAYOUT_PAID = 'payout.paid',
}

@Entity('tenant_webhooks')
@Index('idx_tenant_webhook_tenant', ['tenantId'])
export class TenantWebhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  
  @Column({ type: 'varchar', length: 100 })
  name: string;

  
  @Column({ type: 'varchar', length: 1024 })
  url: string;

  
  @Column({ type: 'varchar', length: 96 })
  secret: string;

  
  @Column({ type: 'simple-json', default: '[]' })
  events: WebhookEvent[];

  
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  
  @Column({ type: 'datetime', nullable: true })
  lastSuccessAt: Date | null;

  
  @Column({ type: 'datetime', nullable: true })
  lastFailureAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastFailureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
