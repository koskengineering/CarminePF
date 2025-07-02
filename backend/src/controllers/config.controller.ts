import { Request, Response } from 'express';
import { ConfigService } from '../services/config.service';
import { logger } from '../utils/logger';

export class ConfigController {
  private configService: ConfigService;

  constructor() {
    this.configService = new ConfigService();
  }

  updateConfig = async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, deleteAfterDays, isAmazonOnly, isFBAOnly, minStarRating, minReviewCount } = req.body;

      if (!url) {
        res.status(400).json({ error: 'URL is required' });
        return;
      }

      // Replace YOUR_API_KEY placeholder with actual API key from environment
      const keepaApiKey = process.env.KEEPA_API_KEY;
      if (!keepaApiKey) {
        res.status(500).json({ error: 'Keepa API key not configured in environment variables' });
        return;
      }

      // Replace YOUR_API_KEY in the URL with the actual API key
      const finalUrl = url.replace(/YOUR_API_KEY/g, keepaApiKey);

      // Validate that the URL contains the API key
      const urlObj = new URL(finalUrl);
      const apiKey = urlObj.searchParams.get('key');
      
      if (!apiKey || apiKey === 'YOUR_API_KEY') {
        res.status(400).json({ error: 'Invalid URL: API key not found or still contains placeholder' });
        return;
      }

      const config = await this.configService.updateConfig({
        url: finalUrl,
        apiKey,
        deleteAfterDays: deleteAfterDays || 7,
        isAmazonOnly: isAmazonOnly || false,
        isFBAOnly: isFBAOnly || false,
        minStarRating: minStarRating || null,
        minReviewCount: minReviewCount || null
      });

      // Clear items and ids when config is updated
      await this.configService.clearData();

      res.json({ message: 'Configuration updated successfully', config });
    } catch (error) {
      logger.error('Error updating configuration', error);
      res.status(500).json({ error: 'Failed to update configuration' });
    }
  };

  getConfig = async (_: Request, res: Response): Promise<void> => {
    try {
      const config = await this.configService.getConfig();
      res.json(config);
    } catch (error) {
      logger.error('Error getting configuration', error);
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  };
}