import { Request, Response } from 'express';
import { ItemsService } from '../services/items.service';
import { ConfigService } from '../services/config.service';
import { logger } from '../utils/logger';

export class ItemsController {
  private itemsService: ItemsService;
  private configService: ConfigService;

  constructor() {
    this.itemsService = new ItemsService();
    this.configService = new ConfigService();
  }

  getUnprocessedItems = async (_: Request, res: Response): Promise<void> => {
    try {
      // Get minimum profit rate from config
      const config = await this.configService.getConfig();
      const minProfitRate = config?.minProfitRate || undefined;
      
      const items = await this.itemsService.getUnprocessedItems(minProfitRate);
      
      // Mark items as processed
      if (items.length > 0) {
        await this.itemsService.markItemsAsProcessed(items.map(item => item.id));
      }

      // Transform items to include ASIN, seller info, and profit data
      const response = items.map(item => ({
        id: item.id,
        asin: item.product.asin,
        sellerId: item.sellerId,
        price: item.price,
        averagePrice90Days: item.averagePrice90Days,
        profitAmount: item.profitAmount,
        profitRate: item.profitRate,
        createdAt: item.createdAt
      }));

      res.json(response);
    } catch (error) {
      logger.error('Error getting unprocessed items', error);
      res.status(500).json({ error: 'Failed to get unprocessed items' });
    }
  };
}