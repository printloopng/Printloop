import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '@/common/middleware/auth.middleware';
import { resolveTenant, requireTenantRole } from '@/common/middleware/tenant.middleware';
import { allowUploadTicket } from '@/common/middleware/uploadTicket.middleware';
import { TenantMemberRole } from '@/database/entities/tenantMember.entity';
import { uploadsController as ctrl } from '@/modules/public/controllers/uploads.controller';

const router = Router();
const images = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const documents = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/ticket', authenticate, ctrl.issueTicket);
router.post('/review-photo', allowUploadTicket('review-photo'), authenticate, images.single('file'), ctrl.reviewPhoto);
router.post(
  '/edited-document',
  allowUploadTicket('edited-document'),
  authenticate,
  resolveTenant,
  requireTenantRole(TenantMemberRole.OWNER, TenantMemberRole.ADMIN, TenantMemberRole.STAFF),
  documents.single('file'),
  ctrl.editedDocument,
);

export default router;
