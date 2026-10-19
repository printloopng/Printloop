import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PaperSize {
  A4 = 'A4',
  A3 = 'A3',
  LETTER = 'LETTER',
  LEGAL = 'LEGAL',
}

export enum ColorType {
  BLACK_WHITE = 'BLACK_WHITE',
  COLOR = 'COLOR',
}

@Entity('pricing_configs')
@Index('UQ_pricing_tenant_paper_color', ['tenantId', 'paperSize', 'colorType'], { unique: true })
@Index('idx_pricing_tenant', ['tenantId'])
export class PricingConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'simple-enum', enum: PaperSize, default: PaperSize.A4 })
  paperSize: PaperSize;

  @Column({ type: 'simple-enum', enum: ColorType, default: ColorType.BLACK_WHITE })
  colorType: ColorType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerPage: number;

  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  duplexMultiplier: number;
  @Column({ type: 'decimal', precision: 4, scale: 2, default: 1.0 })
  highResolutionMultiplier: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price100Simplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price300Simplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price600Simplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price100Duplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price300Duplex: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price600Duplex: number | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: false })
  officeConversion: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
