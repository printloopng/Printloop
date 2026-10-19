import { Router } from 'express';
import { discoveryController } from '@/modules/public/controllers/discovery.controller';

const router = Router();

router.get('/shops/nearby', discoveryController.shopsNearby);
router.get('/shops', discoveryController.listShops);
router.get('/shops/:slug/reviews', discoveryController.shopReviews);
router.get('/shops/:slug', discoveryController.shopBySlug);
router.post('/handoff', discoveryController.createHandoff);
router.get('/handoff/verify', discoveryController.verifyHandoff);
router.post('/shops/seed-demo-nearby', discoveryController.seedDemoNearby);

export default router;
