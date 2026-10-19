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
import { User } from './user.entity';
import { File } from './file.entity';
import { Kiosk } from './kiosk.entity';

export enum PrintJobStatus {
  PENDING = 'pending', // created, awaiting payment (e.g. group-batch participant jobs)
  RENDERING = 'rendering',
  AWAITING_ACCEPT = 'awaiting_accept',
  READY = 'ready', // paid + rendered, awaiting release at a kiosk
  RELEASING = 'releasing',
  PRINTING = 'printing',
  DONE = 'done', // printed / completed
  FAILED = 'failed',
  EXPIRED = 'expired',
  REFUNDED = 'refunded',
  AWAITING_EDIT = 'awaiting_edit',
  EDIT_COMPLETE = 'edit_complete',
  AWAITING_PAYMENT = 'awaiting_payment',
  PAID = 'paid',
}

export enum JobType {
  SINGLE = 'single',
  PERSONAL_BATCH = 'personal_batch',
  GROUP_BATCH = 'group_batch',
}

@Entity('print_jobs')
@Index('print_jobs_user_idem_uniq', ['userId', 'idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
@Index('idx_print_job_tenant', ['tenantId'])
@Index('idx_print_job_tenant_status', ['tenantId', 'status'])
export class PrintJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @ManyToOne(() => File, { nullable: true })
  @JoinColumn({ name: 'fileId' })
  file: File;

  @Column({ type: 'uuid', nullable: true })
  fileId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string;

  @Column({ type: 'varchar', length: 10, unique: true, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  paymentReference: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  cost: number;

  
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  finalCost: number | null;

  
  @Column({ type: 'datetime', nullable: true })
  costReconciledAt: Date | null;

  @Column({ type: 'int', default: 0 })
  totalPages: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  jobType: string;

  @Column({ type: 'boolean', default: false })
  editingRequired: boolean;

  @Column({ type: 'text', nullable: true })
  editingInstructions: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  editedDocumentUrl: string | null;

  @Column({
    type: 'simple-enum',
    enum: PrintJobStatus,
    default: PrintJobStatus.READY,
  })
  status: PrintJobStatus;

  @Column({ type: 'simple-json' })
  printConfiguration: {
    copies: number;
    paper: string;
    color: 'bw' | 'color';
    sided: 'single' | 'double';
    qualityDpi: 100 | 300 | 600;
    
    orientation?: 'portrait' | 'landscape';
  };

  @ManyToOne(() => Kiosk, { nullable: true })
  @JoinColumn({ name: 'kioskId' })
  kiosk: Kiosk;

  @Column({ type: 'uuid', nullable: true })
  kioskId: string;

  
  @Column({ type: 'uuid', nullable: true })
  printerProfileId: string | null;

  
  @Column({ type: 'boolean', default: false })
  requiresAccept: boolean;

  
  @Column({ type: 'uuid', nullable: true })
  reroutedFromTenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  printerId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  printerName: string | null;

  @Column({ type: 'uuid', nullable: true })
  groupSessionId: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  watermarkId: string | null;

  @Column({ type: 'int', default: 0 })
  pagesCompleted: number;

  
  @Column({ type: 'varchar', length: 64, nullable: true })
  agentConfirmation: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renderedKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  renderedPdfUrl: string | null;

  @Column({ type: 'simple-json', nullable: true })
  previewImageUrls: string[] | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'pending',
  })
  renderingStatus: 'pending' | 'processing' | 'ready' | 'failed';

  @Column({ type: 'text', nullable: true })
  renderingError: string | null;

  @Column({ type: 'datetime', nullable: true })
  renderingStartedAt: Date | null;

  @Column({ type: 'datetime', nullable: true })
  renderingCompletedAt: Date | null;

  
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'datetime', nullable: true })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
