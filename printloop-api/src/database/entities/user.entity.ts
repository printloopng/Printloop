import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { Wallet } from './wallet.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin'
}

export enum AdminPrivilege {
  MANAGE_PRICING = 'manage_pricing',
  MANAGE_KIOSKS = 'manage_kiosks',
  MANAGE_USERS = 'manage_users',
  MANAGE_ADMINS = 'manage_admins',
  VIEW_LOGS = 'view_logs',
  VIEW_REPORTS = 'view_reports',
}

@Entity('users')
@Index('idx_user_tenant', ['tenantId'])
@Index('UQ_users_email_tenant', ['email', 'tenantId'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 20 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 255 })
  salt: string;

  
  @Column({ type: 'varchar', length: 96, nullable: true, unique: true })
  printToken: string | null;

  
  @Column({ type: 'varchar', length: 64, nullable: true })
  totpSecret: string | null;

  
  @Column({ type: 'boolean', default: false })
  totpEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  isEmailVerified: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  verificationToken: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  resetToken: string;

  @OneToOne(() => Wallet, wallet => wallet.user)
  wallet: Wallet;

  @Column({
    type: 'simple-enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'simple-json', nullable: true })
  adminPrivileges: AdminPrivilege[];

  @Column({ type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  blockReason: string;

  @Column({ type: 'datetime', nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
