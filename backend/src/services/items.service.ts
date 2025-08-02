import { prisma } from '../config/database';
import { Item } from '@prisma/client';
import { logger } from '../utils/logger';
import { KeepaProductService, ProductInfo } from './keepa-product.service';

export class ItemsService {
  private keepaProductService: KeepaProductService;

  constructor() {
    this.keepaProductService = new KeepaProductService();
  }
  async getUnprocessedItems(minProfitRate?: number): Promise<any[]> {
    try {
      // Build where clause with profit rate filter if specified
      const whereClause: any = {
        processedAt: null
      };
      
      if (minProfitRate !== undefined && minProfitRate !== null) {
        whereClause.profitRate = {
          gte: minProfitRate
        };
      }
      
      const items = await prisma.item.findMany({
        where: whereClause,
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

      if (items.length > 0) {
        logger.info(`🛒 Extension fetched ${items.length} unprocessed items:`, {
          items: items.map(item => ({
            id: item.id,
            asin: item.product.asin,
            sellerId: item.sellerId || 'N/A',
            price: item.price ? `¥${item.price}` : 'N/A',
            profitRate: item.profitRate ? `${item.profitRate.toFixed(2)}%` : 'N/A'
          }))
        });
      }

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

      // Log new ASINs detected
      logger.info(`🆕 New ASINs detected: ${newAsins.length}`, {
        asins: newAsins
      });

      // Get product information including seller IDs from Keepa
      logger.info(`Fetching product info for ${newAsins.length} new ASINs`);
      const productInfos = await this.keepaProductService.getProductInfo(newAsins, apiKey);
      
      // Log detailed product information
      productInfos.forEach(info => {
        logger.info(`📦 Product details for ${info.asin}:`, {
          asin: info.asin,
          title: info.title,
          sellerId: info.cheapestNewSellerId || 'N/A',
          price: info.cheapestNewPrice ? `¥${info.cheapestNewPrice}` : 'N/A',
          isFBA: info.isFBA,
          isPrime: info.isPrime,
          url: info.cheapestNewSellerId 
            ? `https://www.amazon.co.jp/dp/${info.asin}?m=${info.cheapestNewSellerId}`
            : `https://www.amazon.co.jp/dp/${info.asin}`
        });
      });
      
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

        // Create items with seller info and profit data
        const itemsData = productIds.map(product => {
          const productInfo = productInfoMap.get(product.asin);
          return {
            productId: product.id,
            sellerId: productInfo?.cheapestNewSellerId || null,
            price: productInfo?.cheapestNewPrice || null,
            averagePrice90Days: productInfo?.averagePrice90Days || null,
            referralFeePercentage: productInfo?.referralFeePercentage || null,
            fbaFees: productInfo?.fbaFees || null,
            profitAmount: productInfo?.profitAmount || null,
            profitRate: productInfo?.profitRate || null,
            // Mark as processed if this is the first run after start
            processedAt: null  // Will be marked as processed separately if needed
          };
        });

        await tx.item.createMany({
          data: itemsData
        });
      });

      const itemsWithSellers = productInfos.filter(p => p.cheapestNewSellerId).length;
      logger.info(`✅ Created ${newAsins.length} new product IDs and items for purchase (${itemsWithSellers} with seller info)`);
    } catch (error) {
      logger.error('Error creating items for new ASINs', error);
      throw error;
    }
  }

  async markAllUnprocessedItemsAsProcessed(): Promise<void> {
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
        logger.info(`🔄 Marked ${result.count} unprocessed items as processed (first run baseline)`);
      }
    } catch (error) {
      logger.error('Error marking unprocessed items as processed', error);
      throw error;
    }
  }
}