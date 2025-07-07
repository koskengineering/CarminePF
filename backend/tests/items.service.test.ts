import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ItemsService } from '../src/services/items.service';
import { prisma } from '../src/config/database';
import { KeepaProductService } from '../src/services/keepa-product.service';

// Mock Keepa Product Service
jest.mock('../src/services/keepa-product.service');
const MockedKeepaProductService = KeepaProductService as jest.MockedClass<typeof KeepaProductService>;

describe('ItemsService - New ASIN Detection', () => {
  let itemsService: ItemsService;
  let mockedKeepaProductService: jest.Mocked<KeepaProductService>;

  beforeEach(async () => {
    // Clean up database
    await prisma.item.deleteMany();
    await prisma.productId.deleteMany();
    await prisma.config.deleteMany();

    // Reset mocks
    jest.clearAllMocks();
    
    // Create mock instance
    mockedKeepaProductService = new MockedKeepaProductService() as jest.Mocked<KeepaProductService>;
    mockedKeepaProductService.getProductInfo.mockResolvedValue([]);
    
    itemsService = new ItemsService();
    // Replace the service instance with mock
    (itemsService as any).keepaProductService = mockedKeepaProductService;
  });

  afterEach(async () => {
    await prisma.item.deleteMany();
    await prisma.productId.deleteMany();
    await prisma.config.deleteMany();
  });

  describe('saveAsinsAsBaseline', () => {
    it('should save new ASINs as baseline without creating items', async () => {
      const asins = ['B123456789', 'B987654321', 'B111111111'];

      await itemsService.saveAsinsAsBaseline(asins);

      // Check that ProductIds were created
      const productIds = await prisma.productId.findMany();
      expect(productIds).toHaveLength(3);
      expect(productIds.map(p => p.asin).sort()).toEqual(asins.sort());

      // Check that no Items were created
      const items = await prisma.item.findMany();
      expect(items).toHaveLength(0);
    });

    it('should not create duplicate ProductIds for existing ASINs', async () => {
      const initialAsins = ['B123456789', 'B987654321'];
      const newAsins = ['B987654321', 'B111111111', 'B222222222']; // B987654321 is duplicate

      // First run - baseline
      await itemsService.saveAsinsAsBaseline(initialAsins);
      
      // Second run - should only add new ones
      await itemsService.saveAsinsAsBaseline(newAsins);

      const productIds = await prisma.productId.findMany();
      const uniqueAsins = ['B123456789', 'B987654321', 'B111111111', 'B222222222'];
      expect(productIds).toHaveLength(4);
      expect(productIds.map(p => p.asin).sort()).toEqual(uniqueAsins.sort());
    });
  });

  describe('createItemsForNewAsins', () => {
    beforeEach(() => {
      // Mock Keepa Product Service responses
      mockedKeepaProductService.getProductInfo.mockResolvedValue([
        {
          asin: 'B111111111',
          title: 'Product 1',
          cheapestNewSellerId: 'SELLER123',
          cheapestNewPrice: 1500,
          isFBA: true,
          isPrime: true
        },
        {
          asin: 'B222222222',
          title: 'Product 2',
          cheapestNewSellerId: 'SELLER456',
          cheapestNewPrice: 2000,
          isFBA: false,
          isPrime: false
        }
      ]);
    });

    it('should only process new ASINs and create items for purchase', async () => {
      // Setup: Create baseline with existing ASINs
      const existingAsins = ['B123456789', 'B987654321'];
      await itemsService.saveAsinsAsBaseline(existingAsins);

      // Test: Process mixed ASINs (some existing, some new)
      const mixedAsins = ['B123456789', 'B111111111', 'B987654321', 'B222222222'];
      await itemsService.createItemsForNewAsins(mixedAsins, 'test-api-key');

      // Verify: Only new ASINs should have been processed
      const allProductIds = await prisma.productId.findMany();
      expect(allProductIds).toHaveLength(4); // 2 existing + 2 new

      // Verify: Only new ASINs should have items created
      const items = await prisma.item.findMany({
        include: {
          product: true
        }
      });
      expect(items).toHaveLength(2); // Only for new ASINs
      
      const itemAsins = items.map(item => item.product.asin).sort();
      expect(itemAsins).toEqual(['B111111111', 'B222222222']);

      // Verify: Items have seller info
      expect(items[0].sellerId).toBe('SELLER123');
      expect(items[0].price).toBe(1500);
      expect(items[1].sellerId).toBe('SELLER456');
      expect(items[1].price).toBe(2000);
    });

    it('should do nothing when all ASINs already exist', async () => {
      // Setup: Create baseline
      const existingAsins = ['B123456789', 'B987654321'];
      await itemsService.saveAsinsAsBaseline(existingAsins);

      // Test: Try to process only existing ASINs
      await itemsService.createItemsForNewAsins(existingAsins, 'test-api-key');

      // Verify: No new products or items created
      const productIds = await prisma.productId.findMany();
      expect(productIds).toHaveLength(2);

      const items = await prisma.item.findMany();
      expect(items).toHaveLength(0);

      // Verify: Keepa API was not called
      expect(mockedKeepaProductService.getProductInfo).not.toHaveBeenCalled();
    });

    it('should handle empty new ASINs list', async () => {
      await itemsService.createItemsForNewAsins([], 'test-api-key');

      const productIds = await prisma.productId.findMany();
      expect(productIds).toHaveLength(0);

      const items = await prisma.item.findMany();
      expect(items).toHaveLength(0);

      expect(mockedKeepaProductService.getProductInfo).not.toHaveBeenCalled();
    });
  });

  describe('Complete Workflow Test', () => {
    it('should correctly handle first run and subsequent runs', async () => {
      // Mock Keepa responses for different runs
      mockedKeepaProductService.getProductInfo
        .mockResolvedValueOnce([
          { asin: 'B111111111', title: 'Product 1', cheapestNewSellerId: 'SELLER1', cheapestNewPrice: 1000, isFBA: true, isPrime: true }
        ])
        .mockResolvedValueOnce([
          { asin: 'B222222222', title: 'Product 2', cheapestNewSellerId: 'SELLER2', cheapestNewPrice: 2000, isFBA: false, isPrime: false },
          { asin: 'B333333333', title: 'Product 3', cheapestNewSellerId: 'SELLER3', cheapestNewPrice: 3000, isFBA: true, isPrime: false }
        ]);

      // First run: Baseline with 3 ASINs
      const firstRunAsins = ['B123456789', 'B987654321', 'B111111111'];
      await itemsService.saveAsinsAsBaseline(firstRunAsins);

      // Verify: 3 ProductIds, 0 Items
      let productIds = await prisma.productId.findMany();
      let items = await prisma.item.findMany();
      expect(productIds).toHaveLength(3);
      expect(items).toHaveLength(0);

      // Second run: 2 existing + 1 new ASIN
      const secondRunAsins = ['B987654321', 'B111111111', 'B222222222'];
      await itemsService.createItemsForNewAsins(secondRunAsins, 'test-api-key');

      // Verify: 4 ProductIds total, 1 new Item (for B222222222)
      productIds = await prisma.productId.findMany();
      items = await prisma.item.findMany({ include: { product: true } });
      expect(productIds).toHaveLength(4);
      expect(items).toHaveLength(1);
      expect((items[0] as any).product.asin).toBe('B222222222');

      // Third run: 1 existing + 1 new ASIN
      const thirdRunAsins = ['B222222222', 'B333333333'];
      await itemsService.createItemsForNewAsins(thirdRunAsins, 'test-api-key');

      // Verify: 5 ProductIds total, 2 Items total (B222222222 + B333333333)
      productIds = await prisma.productId.findMany();
      items = await prisma.item.findMany({ include: { product: true } });
      expect(productIds).toHaveLength(5);
      expect(items).toHaveLength(2);
      
      const itemAsins = items.map(item => (item as any).product.asin).sort();
      expect(itemAsins).toEqual(['B222222222', 'B333333333']);
    });
  });
});