import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ItemsService } from '../src/services/items.service';
import { ConfigService } from '../src/services/config.service';
import { KeepaService } from '../src/services/keepa.service';
import { prisma } from '../src/config/database';

// Mock dependencies
jest.mock('../src/services/keepa-product.service');
import { KeepaProductService } from '../src/services/keepa-product.service';
const MockedKeepaProductService = KeepaProductService as jest.MockedClass<typeof KeepaProductService>;

describe('First Run Behavior', () => {
  let itemsService: ItemsService;
  let configService: ConfigService;
  let keepaService: KeepaService;

  beforeEach(async () => {
    // Clean up database
    await prisma.item.deleteMany();
    await prisma.productId.deleteMany();
    await prisma.config.deleteMany();

    // Create services
    itemsService = new ItemsService();
    configService = new ConfigService();
    keepaService = new KeepaService();

    // Mock Keepa product API
    const mockedKeepaProductService = new MockedKeepaProductService() as jest.Mocked<KeepaProductService>;
    mockedKeepaProductService.getProductInfo.mockResolvedValue([
      {
        asin: 'B111111111',
        title: 'Product 1',
        cheapestNewSellerId: 'SELLER1',
        cheapestNewPrice: 1000,
        isFBA: true,
        isPrime: true
      },
      {
        asin: 'B222222222',
        title: 'Product 2',
        cheapestNewSellerId: 'SELLER2',
        cheapestNewPrice: 2000,
        isFBA: false,
        isPrime: false
      }
    ]);
    
    // Replace service instance
    (itemsService as any).keepaProductService = mockedKeepaProductService;

    // Create initial config
    await configService.updateConfig({
      url: 'https://test.keepa.com',
      apiKey: 'test-key',
      deleteAfterDays: 7,
      isAmazonOnly: false,
      isFBAOnly: false,
      minStarRating: null,
      minReviewCount: null
    });
  });

  afterEach(async () => {
    await prisma.item.deleteMany();
    await prisma.productId.deleteMany();
    await prisma.config.deleteMany();
  });

  it('should mark all items as processed on first run', async () => {
    // Simulate first run
    const asins = ['B111111111', 'B222222222'];
    
    // Set first run flag
    await configService.setFirstRun();
    
    // Process ASINs (first run behavior)
    await itemsService.createItemsForNewAsins(asins, 'test-key');
    
    // Check items were created
    const itemsBeforeMarking = await prisma.item.findMany();
    expect(itemsBeforeMarking).toHaveLength(2);
    expect(itemsBeforeMarking.every(item => item.processedAt === null)).toBe(true);
    
    // Mark all as processed (baseline)
    await itemsService.markAllUnprocessedItemsAsProcessed();
    
    // Check all items are now processed
    const itemsAfterMarking = await prisma.item.findMany();
    expect(itemsAfterMarking).toHaveLength(2);
    expect(itemsAfterMarking.every(item => item.processedAt !== null)).toBe(true);
    
    // Verify extension gets no items
    const unprocessedItems = await itemsService.getUnprocessedItems();
    expect(unprocessedItems).toHaveLength(0);
  });

  it('should only process new ASINs on subsequent runs', async () => {
    // First run: create baseline
    const firstRunAsins = ['B111111111', 'B222222222'];
    await itemsService.createItemsForNewAsins(firstRunAsins, 'test-key');
    await itemsService.markAllUnprocessedItemsAsProcessed();
    
    // Mock new product info for second run
    const keepaProductService = (itemsService as any).keepaProductService as jest.Mocked<KeepaProductService>;
    keepaProductService.getProductInfo.mockResolvedValue([
      {
        asin: 'B333333333',
        title: 'Product 3',
        cheapestNewSellerId: 'SELLER3',
        cheapestNewPrice: 3000,
        isFBA: true,
        isPrime: false
      }
    ]);
    
    // Second run: mix of old and new ASINs
    const secondRunAsins = ['B111111111', 'B333333333']; // 1 old, 1 new
    await itemsService.createItemsForNewAsins(secondRunAsins, 'test-key');
    
    // Check only new ASIN created unprocessed item
    const unprocessedItems = await itemsService.getUnprocessedItems();
    expect(unprocessedItems).toHaveLength(1);
    expect(unprocessedItems[0].product.asin).toBe('B333333333');
    
    // Check total items
    const allItems = await prisma.item.findMany({
      include: { product: true }
    });
    expect(allItems).toHaveLength(3); // 2 from first run + 1 from second
    
    // Check processed status
    const processedItems = allItems.filter(item => item.processedAt !== null);
    const unprocessedItemsAll = allItems.filter(item => item.processedAt === null);
    
    expect(processedItems).toHaveLength(2); // First run items
    expect(unprocessedItemsAll).toHaveLength(1); // New item only
  });
});