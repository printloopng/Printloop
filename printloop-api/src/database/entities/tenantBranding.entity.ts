import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from 'typeorm';

@Entity('tenant_brandings')
export class TenantBranding {
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  
  @Column({ type: 'varchar', length: 100, nullable: true })
  wordmark: string | null;

  
  @Column({ type: 'varchar', length: 120, nullable: true })
  tagline: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  logoUrl: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  faviconUrl: string | null;

  
  @Column({ type: 'varchar', length: 7, nullable: true })
  primaryColor: string | null;

  
  @Column({ type: 'varchar', length: 7, nullable: true })
  secondaryColor: string | null;

  
  @Column({ type: 'varchar', length: 7, nullable: true })
  accentColor: string | null;

  
  @Column({ type: 'varchar', length: 100, nullable: true })
  emailFromName: string | null;

  
  @Column({ type: 'varchar', length: 255, nullable: true })
  supportEmail: string | null;

  
  @Column({ type: 'varchar', length: 32, nullable: true })
  supportPhone: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
