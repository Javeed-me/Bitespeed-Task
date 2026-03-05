import { Router } from 'express';
import { postIdentify } from '../controllers/identifyController';

const router = Router();

router.post('/identify', postIdentify);

export default router;

