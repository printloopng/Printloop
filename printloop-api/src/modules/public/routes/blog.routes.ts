import { Router } from 'express';
import { publicBlogController } from '@/modules/public/controllers/blog.controller';

const router = Router();

router.get('/', publicBlogController.list);
router.get('/:slug', publicBlogController.getBySlug);

export default router;
