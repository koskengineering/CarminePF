// Database viewer script
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function viewDatabase() {
  try {
    console.log('🗄️  CarminePF Database Viewer\n');
    console.log('='.repeat(50));

    // 1. View Config
    console.log('\n📋 CONFIG TABLE:');
    const configs = await prisma.config.findMany();
    console.table(configs.map(config => ({
      id: config.id,
      isActive: config.isActive,
      isFirstRun: config.isFirstRun,
      deleteAfterDays: config.deleteAfterDays,
      isAmazonOnly: config.isAmazonOnly,
      isFBAOnly: config.isFBAOnly,
      minStarRating: config.minStarRating,
      minReviewCount: config.minReviewCount,
      createdAt: config.createdAt.toLocaleString('ja-JP'),
      updatedAt: config.updatedAt.toLocaleString('ja-JP')
    })));

    // 2. View ProductIds
    console.log('\n📦 PRODUCT IDS TABLE:');
    const productIds = await prisma.productId.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20 // Show last 20
    });
    console.log(`Total ASINs in database: ${await prisma.productId.count()}`);
    console.log('Last 20 ASINs:');
    console.table(productIds.map(product => ({
      id: product.id,
      asin: product.asin,
      createdAt: product.createdAt.toLocaleString('ja-JP')
    })));

    // 3. View Items
    console.log('\n🛒 ITEMS TABLE (Purchase Queue):');
    const items = await prisma.item.findMany({
      include: {
        product: true
      },
      orderBy: { createdAt: 'desc' },
      take: 20 // Show last 20
    });
    console.log(`Total items in queue: ${await prisma.item.count()}`);
    console.log(`Unprocessed items: ${await prisma.item.count({ where: { processedAt: null } })}`);
    console.log('Last 20 items:');
    console.table(items.map(item => ({
      id: item.id,
      asin: item.product.asin,
      sellerId: item.sellerId || 'N/A',
      price: item.price ? `¥${item.price}` : 'N/A',
      processed: item.processedAt ? '✅' : '❌',
      processedAt: item.processedAt?.toLocaleString('ja-JP') || 'Not processed',
      createdAt: item.createdAt.toLocaleString('ja-JP')
    })));

    // 4. Statistics
    console.log('\n📊 STATISTICS:');
    const stats = {
      'Total ASINs tracked': await prisma.productId.count(),
      'Total items created': await prisma.item.count(),
      'Unprocessed items': await prisma.item.count({ where: { processedAt: null } }),
      'Processed items': await prisma.item.count({ where: { processedAt: { not: null } } }),
      'Items with seller ID': await prisma.item.count({ where: { sellerId: { not: null } } }),
      'Items without seller ID': await prisma.item.count({ where: { sellerId: null } })
    };
    console.table(stats);

    // 5. Recent activity
    console.log('\n🕐 RECENT ACTIVITY (Last 10 new ASINs):');
    const recentAsins = await prisma.productId.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });
    
    recentAsins.forEach(product => {
      console.log(`\n${product.asin} (Added: ${product.createdAt.toLocaleString('ja-JP')})`);
      if (product.items.length > 0) {
        product.items.forEach(item => {
          console.log(`  └─ Item #${item.id}: Seller=${item.sellerId || 'N/A'}, Price=¥${item.price || 'N/A'}, Processed=${item.processedAt ? '✅' : '❌'}`);
        });
      } else {
        console.log('  └─ No purchase items created');
      }
    });

  } catch (error) {
    console.error('Error viewing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Add command line options
const args = process.argv.slice(2);
if (args.includes('--watch')) {
  console.log('🔄 Watch mode enabled. Refreshing every 5 seconds...\n');
  setInterval(async () => {
    console.clear();
    await viewDatabase();
  }, 5000);
} else {
  viewDatabase();
}