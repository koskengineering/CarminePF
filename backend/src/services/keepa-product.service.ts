import axios, { AxiosInstance } from 'axios';
import { logger } from '../utils/logger';

interface KeepaOffer {
  sellerId: string;
  isPrime: boolean;
  isMAP: boolean;
  isFBA: boolean;
  condition: number; // 0 = New, 1 = Like New, etc.
  offerCSV: number[]; // [price, shipping, ...] in Keepa units
  sellerName?: string;
  sellerRating?: number;
}

interface KeepaProductResponse {
  products?: KeepaProduct[];
  tokensLeft?: number;
  error?: {
    message: string;
  };
}

interface KeepaProduct {
  asin: string;
  title?: string;
  offers?: KeepaOffer[];
  stats?: {
    current?: number[]; // [Amazon, New, Used, Sales Rank, ...]
    buyBoxSellerId?: string;
    buyBoxIsFBA?: boolean;
    buyBoxIsPrimeEligible?: boolean;
  };
  csv?: number[][];
  buyBoxSellerIdHistory?: any[];
}

export interface ProductInfo {
  asin: string;
  title: string;
  cheapestNewSellerId: string | null;
  cheapestNewPrice: number | null; // Price in yen
  isFBA: boolean;
  isPrime: boolean;
}

export class KeepaProductService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      timeout: 30000,
      headers: {
        'User-Agent': 'CarminePF/1.0'
      }
    });
  }

  /**
   * Get product information including cheapest new seller from Keepa
   */
  async getProductInfo(asins: string[], apiKey: string): Promise<ProductInfo[]> {
    try {
      if (asins.length === 0) {
        return [];
      }

      // Keepa API endpoint for product data
      const url = 'https://api.keepa.com/product';
      
      const params = {
        key: apiKey,
        domain: 5, // Amazon.co.jp
        asin: asins.join(','),
        offers: 20, // Include current offers
        stats: 1    // Include current stats
      };

      logger.info(`Fetching product info for ${asins.length} ASINs from Keepa API`);
      
      const response = await this.axiosInstance.get<KeepaProductResponse>(url, { params });

      if (response.status !== 200) {
        throw new Error(`Keepa API returned status ${response.status}`);
      }

      const data = response.data;

      // Check for errors
      if (data.error) {
        logger.error('Keepa Product API error', data.error);
        throw new Error(data.error.message);
      }

      // Check token status
      if (data.tokensLeft !== undefined && data.tokensLeft < 0) {
        logger.warn('Keepa API tokens exhausted');
        throw new Error('Keepa API tokens exhausted');
      }

      // Log remaining tokens
      if (data.tokensLeft !== undefined) {
        logger.info(`Keepa API tokens remaining: ${data.tokensLeft}`);
      }

      // Process products
      const products = data.products || [];
      const productInfos: ProductInfo[] = [];

      for (const product of products) {
        const productInfo = this.processProduct(product);
        if (productInfo) {
          productInfos.push(productInfo);
        }
      }

      logger.info(`Processed ${productInfos.length} products with offer data`);
      return productInfos;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger.error('Keepa Product API request failed', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        
        // Handle rate limiting
        if (error.response?.status === 429) {
          logger.warn('Keepa Product API rate limit exceeded');
        }
      } else {
        logger.error('Error fetching product info from Keepa', error);
      }
      
      throw error;
    }
  }

  /**
   * Process a single product to extract cheapest new offer
   */
  private processProduct(product: KeepaProduct): ProductInfo | null {
    try {
      const { asin, title, offers } = product;

      // First try to get seller info from offers
      if (offers && offers.length > 0) {
        return this.processOffersData(product);
      }

      // Fallback: Use buyBoxSellerIdHistory and stats
      return this.processFallbackData(product);

    } catch (error) {
      logger.error(`Error processing product ${product.asin}`, error);
      return null;
    }
  }

  /**
   * Process offers data when available
   */
  private processOffersData(product: KeepaProduct): ProductInfo {
    const { asin, title, offers } = product;
    
    // Filter for valid new offers (condition 0 or 1)
    const newOffers = offers!.filter(offer => 
      offer.condition !== undefined &&
      offer.condition <= 1 && // 0 = New, 1 = Like New
      offer.sellerId && 
      offer.offerCSV &&
      offer.offerCSV[0] > 0
    );

    if (newOffers.length === 0) {
      return this.createEmptyProductInfo(product);
    }

    // Sort by total price (offerCSV[0] is price, offerCSV[1] is shipping)
    newOffers.sort((a, b) => {
      const priceA = a.offerCSV![0];
      const shippingA = a.offerCSV![1] || 0;
      const priceB = b.offerCSV![0];
      const shippingB = b.offerCSV![1] || 0;
      return (priceA + shippingA) - (priceB + shippingB);
    });

    const cheapestOffer = newOffers[0];
    // Convert from Keepa price units (appears to be 1/1000 yen) to yen
    const priceInYen = Math.round(cheapestOffer.offerCSV![0] / 1000);

    return {
      asin,
      title: title || 'Unknown Product',
      cheapestNewSellerId: cheapestOffer.sellerId,
      cheapestNewPrice: priceInYen,
      isFBA: cheapestOffer.isFBA || false,
      isPrime: cheapestOffer.isPrime || false
    };
  }

  /**
   * Process fallback data when offers are not available
   */
  private processFallbackData(product: any): ProductInfo {
    const { asin, title } = product;
    
    let sellerId = null;
    let price = null;
    let isFBA = false;
    let isPrime = false;

    // Try to get seller from buyBoxSellerIdHistory
    if (product.buyBoxSellerIdHistory && product.buyBoxSellerIdHistory.length >= 2) {
      const lastSellerId = product.buyBoxSellerIdHistory[product.buyBoxSellerIdHistory.length - 1];
      // -1 = no seller, -2 = Amazon
      if (lastSellerId && lastSellerId !== '-1') {
        sellerId = lastSellerId === '-2' ? 'AN1VRQENFRJN5' : lastSellerId; // Amazon's seller ID
      }
    }

    // Try to get price from stats
    if (product.stats && product.stats.current) {
      // stats.current[0] = Amazon price, stats.current[1] = New price
      if (product.stats.current[1] > 0) {
        price = product.stats.current[1];
      } else if (product.stats.current[0] > 0) {
        price = product.stats.current[0];
        sellerId = sellerId || 'AN1VRQENFRJN5'; // Amazon seller
      }
    }

    // Alternative: Get price from CSV data
    if (!price && product.csv) {
      // csv[0] = Amazon, csv[1] = New
      for (let i = 0; i < 2 && i < product.csv.length; i++) {
        if (product.csv[i] && product.csv[i].length > 0) {
          const lastPrice = product.csv[i][product.csv[i].length - 1];
          if (lastPrice > 0) {
            price = lastPrice;
            if (i === 0) sellerId = sellerId || 'AN1VRQENFRJN5'; // Amazon price
            break;
          }
        }
      }
    }

    // Check FBA/Prime status from stats
    if (product.stats) {
      isFBA = product.stats.buyBoxIsFBA === true;
      isPrime = product.stats.buyBoxIsPrimeEligible === true;
    }

    logger.debug(`Fallback data for ${asin}: sellerId=${sellerId}, price=${price}`);

    return {
      asin,
      title: title || 'Unknown Product',
      cheapestNewSellerId: sellerId,
      cheapestNewPrice: price,
      isFBA,
      isPrime
    };
  }

  /**
   * Create empty product info
   */
  private createEmptyProductInfo(product: any): ProductInfo {
    return {
      asin: product.asin,
      title: product.title || 'Unknown Product',
      cheapestNewSellerId: null,
      cheapestNewPrice: null,
      isFBA: false,
      isPrime: false
    };
  }
}