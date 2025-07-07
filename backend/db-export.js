// Database export script
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function exportToCSV() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const exportDir = path.join(__dirname, 'exports');
    
    // Create export directory if it doesn't exist
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir);
    }

    console.log(`📁 Exporting to: ${exportDir}`);

    // 1. Export ProductIds
    const productIds = await prisma.productId.findMany({
      orderBy: { createdAt: 'desc' }
    });
    
    const productIdsCsv = [
      'ID,ASIN,Created At',
      ...productIds.map(p => `${p.id},"${p.asin}","${p.createdAt.toISOString()}"`)
    ].join('\n');
    
    const productIdsFile = path.join(exportDir, `productIds_${timestamp}.csv`);
    fs.writeFileSync(productIdsFile, productIdsCsv);
    console.log(`✅ Exported ${productIds.length} product IDs to ${productIdsFile}`);

    // 2. Export Items with Product info
    const items = await prisma.item.findMany({
      include: {
        product: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const itemsCsv = [
      'ID,ASIN,Seller ID,Price,Processed,Processed At,Created At',
      ...items.map(item => 
        `${item.id},"${item.product.asin}","${item.sellerId || ''}",${item.price || ''},"${item.processedAt ? 'Yes' : 'No'}","${item.processedAt?.toISOString() || ''}","${item.createdAt.toISOString()}"`
      )
    ].join('\n');
    
    const itemsFile = path.join(exportDir, `items_${timestamp}.csv`);
    fs.writeFileSync(itemsFile, itemsCsv);
    console.log(`✅ Exported ${items.length} items to ${itemsFile}`);

    // 3. Export summary
    const summary = {
      exportDate: new Date().toISOString(),
      totalAsins: await prisma.productId.count(),
      totalItems: await prisma.item.count(),
      unprocessedItems: await prisma.item.count({ where: { processedAt: null } }),
      processedItems: await prisma.item.count({ where: { processedAt: { not: null } } })
    };
    
    const summaryFile = path.join(exportDir, `summary_${timestamp}.json`);
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    console.log(`✅ Exported summary to ${summaryFile}`);

    console.log('\n📊 Export Summary:');
    console.table(summary);

  } catch (error) {
    console.error('Error exporting database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

exportToCSV();