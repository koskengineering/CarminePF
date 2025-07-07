import axios, { AxiosInstance } from 'axios';
import { Config } from '@prisma/client';
import { ConfigService } from './config.service';
import { ItemsService } from './items.service';
import { logger } from '../utils/logger';

interface KeepaResponse {
  asinList?: string[];
  error?: {
    message: string;
  };
  tokensLeft?: number;
}

export class KeepaService {
  private configService: ConfigService;
  private itemsService: ItemsService;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.configService = new ConfigService();
    this.itemsService = new ItemsService();
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'CarminePF/1.0'
      }
    });
  }

  async fetchAndUpdateProducts(): Promise<void> {
    try {
      const config = await this.configService.getConfig();
      if (!config || !config.isActive) {
        logger.info('Skipping fetch: configuration not active');
        return;
      }


      // Fetch products from Keepa API
      const response = await this.axiosInstance.get<KeepaResponse>(config.url);
      
      if (response.status !== 200) {
        throw new Error(`Keepa API returned status ${response.status}`);
      }

      const data = response.data;

      // Check for errors
      if (data.error) {
        logger.error('Keepa API error', data.error);
        throw new Error(data.error.message);
      }

      // Check token status
      if (data.tokensLeft !== undefined && data.tokensLeft < 0) {
        logger.warn('Keepa API tokens exhausted');
        throw new Error('Keepa API tokens exhausted');
      }

      // Process ASINs
      const asins = data.asinList || [];
      logger.info(`📡 Fetched ${asins.length} ASINs from Keepa API`);

      if (asins.length > 0) {
        // Filter ASINs based on config
        const filteredAsins = this.filterAsins(asins, config);
        
        if (config.isFirstRun) {
          // First run: Create items but mark them as processed immediately
          logger.info(`🏁 First run: Processing ${filteredAsins.length} ASINs as baseline`);
          
          // Create items for all ASINs (including fetching seller info)
          const keepaApiKey = process.env.KEEPA_API_KEY || config.apiKey;
          await this.itemsService.createItemsForNewAsins(filteredAsins, keepaApiKey);
          
          // Mark all unprocessed items as processed (baseline)
          await this.itemsService.markAllUnprocessedItemsAsProcessed();
          
          // Mark first run as complete
          await this.configService.markFirstRunComplete();
        } else {
          // Subsequent runs: Create items only for new ASINs with seller info
          logger.info(`🔍 Checking for new ASINs among ${filteredAsins.length} fetched ASINs`);
          const keepaApiKey = process.env.KEEPA_API_KEY || config.apiKey;
          await this.itemsService.createItemsForNewAsins(filteredAsins, keepaApiKey);
        }
      }

      // Log remaining tokens
      if (data.tokensLeft !== undefined) {
        logger.info(`Keepa API tokens remaining: ${data.tokensLeft}`);
      }

    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Keepa API request failed', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          logger.warn('Keepa API rate limit exceeded');
        }
      } else {
        logger.error('Error fetching products from Keepa', error);
      }
      
      throw error;
    }
  }

  private filterAsins(asins: string[], _config: Config): string[] {
    // Extract valid ASINs (format: B[A-Z0-9]{9})
    const validAsins = asins.filter(asin => {
      const isValid = /^B[A-Z0-9]{9}$/.test(asin);
      if (!isValid) {
        logger.warn(`Invalid ASIN format: ${asin}`);
      }
      return isValid;
    });

    logger.info(`Filtered ${validAsins.length} valid ASINs from ${asins.length} total`);
    return validAsins;
  }
}