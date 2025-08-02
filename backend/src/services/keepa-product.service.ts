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
    avg?: number[][]; // Average prices [[30day], [90day], [180day], ...]
    avg30?: number[]; // 30-day average prices [Amazon, New, Used, ...]
    avg90?: number[]; // 90-day average prices [Amazon, New, Used, ...]
    avg180?: number[]; // 180-day average prices [Amazon, New, Used, ...]
    buyBoxSellerId?: string;
    buyBoxIsFBA?: boolean;
    buyBoxIsPrimeEligible?: boolean;
  };
  csv?: number[][];
  buyBoxSellerIdHistory?: any[];
  feePercentage?: number; // Amazon referral fee percentage
  g?: number; // Category ID for fee calculation
}

export interface ProductInfo {
  asin: string;
  title: string;
  cheapestNewSellerId: string | null;
  cheapestNewPrice: number | null; // Current new price (purchase price) in yen
  averagePrice90Days: number | null; // 90-day average price (selling price) in yen
  referralFeePercentage: number | null; // Amazon referral fee percentage
  fbaFees: number | null; // FBA fees in yen
  profitAmount: number | null; // Calculated profit in yen
  profitRate: number | null; // Calculated profit rate as percentage
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
        stats: 90   // Include stats with 90-day average
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
      const { offers } = product;

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
    const { asin, title, offers, stats } = product;
    
    // Filter for valid new offers (condition 1 = New only)
    const newOffers = offers!.filter(offer => 
      offer.condition !== undefined &&
      offer.condition === 1 && // 1 = New (not 0 = Unknown)
      offer.sellerId && 
      offer.offerCSV &&
      offer.offerCSV.length >= 2 &&
      offer.offerCSV[offer.offerCSV.length - 2] > 0 // Latest price > 0
    );

    if (newOffers.length === 0) {
      return this.createEmptyProductInfo(product);
    }

    // Sort by total price (latest price + latest shipping)
    newOffers.sort((a, b) => {
      const priceA = a.offerCSV![a.offerCSV!.length - 2];
      const shippingA = a.offerCSV![a.offerCSV!.length - 1] || 0;
      const priceB = b.offerCSV![b.offerCSV!.length - 2];
      const shippingB = b.offerCSV![b.offerCSV!.length - 1] || 0;
      return (priceA + shippingA) - (priceB + shippingB);
    });

    const cheapestOffer = newOffers[0];
    // Convert from yen (smallest currency unit) to yen - no conversion needed for Japan
    const purchasePrice = cheapestOffer.offerCSV![cheapestOffer.offerCSV!.length - 2];

    // Get 90-day average price
    const averagePrice90Days = this.get90DayAveragePrice(product);
    
    // Get Amazon fees
    const referralFeePercentage = this.getReferralFeePercentage(product);
    const fbaFees = this.calculateFBAFees(product, purchasePrice);
    
    // Calculate profit
    let profitAmount = null;
    let profitRate = null;
    
    if (averagePrice90Days && purchasePrice && referralFeePercentage !== null && fbaFees !== null) {
      const amazonFees = averagePrice90Days * referralFeePercentage * 1.1; // Including 10% tax
      profitAmount = averagePrice90Days - amazonFees - fbaFees - purchasePrice;
      profitRate = (profitAmount / averagePrice90Days) * 100;
    }

    return {
      asin,
      title: title || 'Unknown Product',
      cheapestNewSellerId: cheapestOffer.sellerId,
      cheapestNewPrice: purchasePrice,
      averagePrice90Days,
      referralFeePercentage,
      fbaFees,
      profitAmount,
      profitRate,
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
    let purchasePrice = null;
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
        purchasePrice = product.stats.current[1];
      } else if (product.stats.current[0] > 0) {
        purchasePrice = product.stats.current[0];
        sellerId = sellerId || 'AN1VRQENFRJN5'; // Amazon seller
      }
    }

    // Alternative: Get price from CSV data
    if (!purchasePrice && product.csv) {
      // csv[0] = Amazon, csv[1] = New
      for (let i = 0; i < 2 && i < product.csv.length; i++) {
        if (product.csv[i] && product.csv[i].length > 0) {
          const lastPrice = product.csv[i][product.csv[i].length - 1];
          if (lastPrice > 0) {
            purchasePrice = lastPrice;
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

    // Get 90-day average price
    const averagePrice90Days = this.get90DayAveragePrice(product);
    
    // Get Amazon fees
    const referralFeePercentage = this.getReferralFeePercentage(product);
    const fbaFees = this.calculateFBAFees(product, purchasePrice);
    
    // Calculate profit
    let profitAmount = null;
    let profitRate = null;
    
    if (averagePrice90Days && purchasePrice && referralFeePercentage !== null && fbaFees !== null) {
      const amazonFees = averagePrice90Days * referralFeePercentage * 1.1; // Including 10% tax
      profitAmount = averagePrice90Days - amazonFees - fbaFees - purchasePrice;
      profitRate = (profitAmount / averagePrice90Days) * 100;
    }

    logger.debug(`Fallback data for ${asin}: sellerId=${sellerId}, price=${purchasePrice}`);

    return {
      asin,
      title: title || 'Unknown Product',
      cheapestNewSellerId: sellerId,
      cheapestNewPrice: purchasePrice,
      averagePrice90Days,
      referralFeePercentage,
      fbaFees,
      profitAmount,
      profitRate,
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
      averagePrice90Days: null,
      referralFeePercentage: null,
      fbaFees: null,
      profitAmount: null,
      profitRate: null,
      isFBA: false,
      isPrime: false
    };
  }

  /**
   * Get 90-day average price from product stats
   */
  private get90DayAveragePrice(product: KeepaProduct): number | null {
    try {
      if (product.stats) {
        // Check if avg90 is directly available
        if (product.stats.avg90) {
          // avg90[1] = 90-day average for new products
          if (product.stats.avg90[1] && product.stats.avg90[1] > 0) {
            return product.stats.avg90[1];
          }
          // Fallback to Amazon average if new average not available
          if (product.stats.avg90[0] && product.stats.avg90[0] > 0) {
            return product.stats.avg90[0];
          }
        }
        
        // Check if avg array is available (when stats param is passed as number)
        if (product.stats.avg && product.stats.avg.length > 1) {
          // avg[1] = 90-day average [Amazon, New, Used, ...]
          const avg90 = product.stats.avg[1];
          if (avg90 && avg90[1] && avg90[1] > 0) {
            return avg90[1]; // New product 90-day average
          }
          if (avg90 && avg90[0] && avg90[0] > 0) {
            return avg90[0]; // Amazon 90-day average
          }
        }
      }
      
      // If no average data, try current price as fallback
      if (product.stats && product.stats.current) {
        if (product.stats.current[1] > 0) {
          return product.stats.current[1];
        }
        if (product.stats.current[0] > 0) {
          return product.stats.current[0];
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Error getting 90-day average for ${product.asin}`, error);
      return null;
    }
  }

  /**
   * Get Amazon referral fee percentage based on category
   */
  private getReferralFeePercentage(product: KeepaProduct): number | null {
    try {
      // Default referral fee percentages by category
      // These are approximate values for Amazon Japan
      const defaultFees: { [key: number]: number } = {
        0: 0.15,   // General/Unknown
        1: 0.15,   // Baby Products
        2: 0.15,   // Beauty
        3: 0.10,   // Books
        4: 0.15,   // Camera & Photo
        5: 0.15,   // Electronics
        6: 0.15,   // DVD
        7: 0.15,   // PC Hardware
        8: 0.15,   // Kitchen
        9: 0.15,   // Music
        10: 0.15,  // Musical Instruments
        11: 0.15,  // Office Products
        12: 0.15,  // Outdoors
        13: 0.15,  // Software
        14: 0.15,  // Sports
        15: 0.15,  // Tools & Home
        16: 0.15,  // Toys
        17: 0.15,  // Video Games
        18: 0.15,  // Watches
        19: 0.15,  // Apparel
        20: 0.15,  // Shoes
        21: 0.15,  // Luggage
        22: 0.15,  // Jewelry
        23: 0.15   // Health
      };
      
      // If product has category information
      if (product.g !== undefined && product.g !== null) {
        return defaultFees[product.g] || 0.15;
      }
      
      // If product has explicit fee percentage
      if (product.feePercentage) {
        return product.feePercentage;
      }
      
      // Default to 15%
      return 0.15;
    } catch (error) {
      logger.error(`Error getting referral fee for ${product.asin}`, error);
      return 0.15; // Default to 15%
    }
  }

  /**
   * Calculate FBA fees based on product dimensions and weight
   * This is a simplified calculation - actual fees may vary
   */
  private calculateFBAFees(product: KeepaProduct, price: number | null): number | null {
    try {
      if (!price) return null;
      
      // Simplified FBA fee calculation for Japan
      // Small and light: ¥350-450
      // Standard size: ¥400-600
      // Oversize: ¥600+
      
      // For now, use a default average FBA fee
      // In production, this should be calculated based on actual product dimensions
      const defaultFBAFee = 450; // Average FBA fee in yen
      
      return defaultFBAFee;
    } catch (error) {
      logger.error(`Error calculating FBA fees for ${product.asin}`, error);
      return null;
    }
  }
}