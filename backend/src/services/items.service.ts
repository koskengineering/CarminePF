import { prisma } from '../config/database';
import { Item } from '@prisma/client';
import { logger } from '../utils/logger';
import { KeepaProductService, ProductInfo } from './keepa-product.service';

export class ItemsService {
  private keepaProductService: KeepaProductService;

  constructor() {
    this.keepaProductService = new KeepaProductService();
  }
  async getUnprocessedItems(): Promise<(Item & { product: { asin: string } })[]> {
    try {
      const items = await prisma.item.findMany({
        where: {
          processedAt: null
        },
        include: {
          product: {
            select: {
              asin: true
            }
          }
        },
        orderBy: {
          createdAt: 'asc'
        },
        take: 3 // Limit to 3 items per request to prevent overwhelming
      });

      return items;
    } catch (error) {
      logger.error('Error getting unprocessed items', error);
      throw error;
    }
  }

  async markItemsAsProcessed(itemIds: number[]): Promise<void> {
    try {
      await prisma.item.updateMany({
        where: {
          id: {
            in: itemIds
          }
        },
        data: {
          processedAt: new Date()
        }
      });

      logger.info(`Marked ${itemIds.length} items as processed`);
    } catch (error) {
      logger.error('Error marking items as processed', error);
      throw error;
    }
  }

  async saveAsinsAsBaseline(asins: string[]): Promise<void> {
    try {
      // Save ASINs as baseline without creating items
      const uniqueAsins = [...new Set(asins)]; // Remove duplicates
      
      // Get existing ASINs
      const existingProducts = await prisma.productId.findMany({
        where: {
          asin: {
            in: uniqueAsins
          }
        },
        select: {
          asin: true
        }
      });

      const existingAsins = new Set(existingProducts.map(p => p.asin));
      const newAsins = uniqueAsins.filter(asin => !existingAsins.has(asin));

      if (newAsins.length > 0) {
        // Create product IDs only (no items for purchase)
        await prisma.productId.createMany({
          data: newAsins.map(asin => ({ asin }))
        });

        logger.info(`Saved ${newAsins.length} ASINs as baseline`);
      } else {
        logger.info('All ASINs already exist in baseline');
      }
    } catch (error) {
      logger.error('Error saving ASINs as baseline', error);
      throw error;
    }
  }

  async createItemsForNewAsins(asins: string[], apiKey: string): Promise<void> {
    try {
      // Get existing ASINs
      const existingProducts = await prisma.productId.findMany({
        where: {
          asin: {
            in: asins
          }
        },
        select: {
          asin: true
        }
      });

      const existingAsins = new Set(existingProducts.map(p => p.asin));
      const newAsins = asins.filter(asin => !existingAsins.has(asin));

      if (newAsins.length === 0) {
        logger.info('No new ASINs to add');
        return;
      }

      // Get product information including seller IDs from Keepa
      logger.info(`Fetching product info for ${newAsins.length} new ASINs`);
      const productInfos = await this.keepaProductService.getProductInfo(newAsins, apiKey);
      
      // Create a map for quick lookup
      const productInfoMap = new Map<string, ProductInfo>();
      for (const info of productInfos) {
        productInfoMap.set(info.asin, info);
      }

      // Create new product IDs and items in a transaction
      await prisma.$transaction(async (tx) => {
        // Create product IDs
        const productIds = await Promise.all(
          newAsins.map(asin =>
            tx.productId.create({
              data: { asin },
              select: { id: true, asin: true }
            })
          )
        );

        // Create items with seller info
        const itemsData = productIds.map(product => {
          const productInfo = productInfoMap.get(product.asin);
          return {
            productId: product.id,
            sellerId: productInfo?.cheapestNewSellerId || null,
            price: productInfo?.cheapestNewPrice || null
          };
        });

        await tx.item.createMany({
          data: itemsData
        });
      });

      const itemsWithSellers = productInfos.filter(p => p.cheapestNewSellerId).length;
      logger.info(`Created ${newAsins.length} new product IDs and items for purchase (${itemsWithSellers} with seller info)`);
    } catch (error) {
      logger.error('Error creating items for new ASINs', error);
      throw error;
    }
  }

  async markUnprocessedItemsAsProcessedAfterApiCall(): Promise<void> {
    try {
      const result = await prisma.item.updateMany({
        where: {
          processedAt: null
        },
        data: {
          processedAt: new Date()
        }
      });

      if (result.count > 0) {
        logger.info(`Marked ${result.count} unprocessed items as processed after API call`);
      }
    } catch (error) {
      logger.error('Error marking unprocessed items as processed', error);
      throw error;
    }
  }
}