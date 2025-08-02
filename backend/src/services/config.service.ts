import { prisma } from '../config/database';
import { Config } from '@prisma/client';
import { logger } from '../utils/logger';

interface ConfigUpdateData {
  url: string;
  apiKey: string;
  deleteAfterDays: number;
  isAmazonOnly: boolean;
  isFBAOnly: boolean;
  minStarRating: number | null;
  minReviewCount: number | null;
  minProfitRate: number | null;
}

export class ConfigService {
  async getConfig(): Promise<Config | null> {
    try {
      const config = await prisma.config.findFirst({
        orderBy: { id: 'desc' }
      });
      return config;
    } catch (error) {
      logger.error('Error getting config', error);
      throw error;
    }
  }

  async updateConfig(data: ConfigUpdateData): Promise<Config> {
    try {
      // Delete all existing configs
      await prisma.config.deleteMany();

      // Create new config
      const config = await prisma.config.create({
        data: {
          url: data.url,
          apiKey: data.apiKey,
          deleteAfterDays: data.deleteAfterDays,
          isAmazonOnly: data.isAmazonOnly,
          isFBAOnly: data.isFBAOnly,
          minStarRating: data.minStarRating,
          minReviewCount: data.minReviewCount,
          minProfitRate: data.minProfitRate,
          isActive: false,
          isFirstRun: true // Reset first run flag when config is updated
        }
      });

      logger.info('Configuration updated', { configId: config.id });
      return config;
    } catch (error) {
      logger.error('Error updating config', error);
      throw error;
    }
  }

  async updateActiveStatus(isActive: boolean): Promise<void> {
    try {
      const config = await this.getConfig();
      if (config) {
        await prisma.config.update({
          where: { id: config.id },
          data: { isActive }
        });
      }
    } catch (error) {
      logger.error('Error updating active status', error);
      throw error;
    }
  }

  async clearData(): Promise<void> {
    try {
      // Delete all items and product IDs
      await prisma.item.deleteMany();
      await prisma.productId.deleteMany();
      logger.info('Cleared all items and product IDs');
    } catch (error) {
      logger.error('Error clearing data', error);
      throw error;
    }
  }

  async setFirstRun(): Promise<void> {
    try {
      const config = await this.getConfig();
      if (config) {
        await prisma.config.update({
          where: { id: config.id },
          data: { isFirstRun: true }
        });
        logger.info('First run flag set');
      }
    } catch (error) {
      logger.error('Error setting first run flag', error);
      throw error;
    }
  }

  async markFirstRunComplete(): Promise<void> {
    try {
      const config = await this.getConfig();
      if (config && config.isFirstRun) {
        await prisma.config.update({
          where: { id: config.id },
          data: { isFirstRun: false }
        });
        logger.info('First run marked as complete');
      }
    } catch (error) {
      logger.error('Error marking first run complete', error);
      throw error;
    }
  }

  async cleanupOldData(): Promise<void> {
    try {
      const config = await this.getConfig();
      if (!config) return;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.deleteAfterDays);

      // Delete old product IDs and their items (cascade delete)
      const deleted = await prisma.productId.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      });

      if (deleted.count > 0) {
        logger.info(`Cleaned up ${deleted.count} old product IDs`);
      }
    } catch (error) {
      logger.error('Error cleaning up old data', error);
      throw error;
    }
  }
}