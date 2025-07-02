import { Request, Response } from 'express';
import { ItemsService } from '../services/items.service';
import { logger } from '../utils/logger';

export class ItemsController {
  private itemsService: ItemsService;

  constructor() {
    this.itemsService = new ItemsService();
  }

  getUnprocessedItems = async (_: Request, res: Response): Promise<void> => {
    try {
      const items = await this.itemsService.getUnprocessedItems();
      
      // Mark items as processed
      if (items.length > 0) {
        await this.itemsService.markItemsAsProcessed(items.map(item => item.id));
      }

      // Transform items to include ASIN
      const response = items.map(item => ({
        id: item.id,
        asin: item.product.asin,
        createdAt: item.createdAt
      }));

      res.json(response);
    } catch (error) {
      logger.error('Error getting unprocessed items', error);
      res.status(500).json({ error: 'Failed to get unprocessed items' });
    }
  };
}