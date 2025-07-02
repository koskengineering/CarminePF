import { Router } from 'express';
import { StatusController } from '../controllers/status.controller';
import { ConfigController } from '../controllers/config.controller';
import { ItemsController } from '../controllers/items.controller';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

const statusController = new StatusController();
const configController = new ConfigController();
const itemsController = new ItemsController();

// Status endpoints
router.post('/start', asyncHandler(statusController.start));
router.post('/stop', asyncHandler(statusController.stop));
router.get('/status', asyncHandler(statusController.getStatus));

// Config endpoints
router.post('/config', asyncHandler(configController.updateConfig));
router.get('/config', asyncHandler(configController.getConfig));

// Items endpoints
router.get('/items', asyncHandler(itemsController.getUnprocessedItems));

export default router;