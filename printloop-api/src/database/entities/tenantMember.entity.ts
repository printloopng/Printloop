import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

export enum TenantMemberRole {
  
  OWNER = 'owner',
  
  ADMIN = 'admin',
  
  STAFF = 'staff',
}

@Entity('tenant_members')
@Index('idx_tenant_member_unique', ['tenantId', 'userId'], { unique: true })
@Index('idx_tenant_member_user', ['userId'])
export class TenantMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({
    type: 'simple-enum',
    enum: TenantMemberRole,
    default: TenantMemberRole.STAFF,
  })
  role: TenantMemberRole;

  @CreateDateColumn()
  createdAt: Date;
}
