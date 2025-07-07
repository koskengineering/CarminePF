// Test script to check new ASIN detection and logging
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testNewAsins() {
  try {
    console.log('🚀 Starting test...\n');

    // 1. Check current status
    console.log('1️⃣ Checking current status...');
    const statusRes = await axios.get(`${API_BASE_URL}/status`);
    console.log('Status:', statusRes.data);
    console.log('');

    // 2. Stop monitoring if running
    if (statusRes.data.isRunning) {
      console.log('2️⃣ Stopping monitoring...');
      await axios.post(`${API_BASE_URL}/stop`);
      await sleep(2000);
    }

    // 3. Update configuration (replace YOUR_API_KEY with actual key)
    console.log('3️⃣ Updating configuration...');
    const configData = {
      url: 'https://keepa.com/product-finder/_ajax/?key=YOUR_API_KEY&domain=co.jp&selection=%7B%22productTypes%22%3A%5B0%5D%7D',
      deleteAfterDays: 7,
      isAmazonOnly: false,
      isFBAOnly: false,
      minStarRating: null,
      minReviewCount: null
    };
    
    try {
      await axios.post(`${API_BASE_URL}/config`, configData);
      console.log('✅ Configuration updated');
    } catch (error) {
      console.log('⚠️  Config update failed (API key may need to be set in env)');
    }
    console.log('');

    // 4. Start monitoring
    console.log('4️⃣ Starting monitoring...');
    await axios.post(`${API_BASE_URL}/start`);
    console.log('✅ Monitoring started');
    console.log('');

    // 5. Monitor logs
    console.log('5️⃣ Monitoring logs (press Ctrl+C to stop)...');
    console.log('First run will save baseline, subsequent runs will detect new ASINs');
    console.log('Watch the backend logs for detailed information about new ASINs\n');
    console.log('Expected log pattern:');
    console.log('  📡 Fetched X ASINs from Keepa API');
    console.log('  🏁 First run: Saving X ASINs as baseline (first time)');
    console.log('  🔍 Checking for new ASINs (subsequent runs)');
    console.log('  🆕 New ASINs detected: X');
    console.log('  📦 Product details for ASIN...');
    console.log('  ✅ Created X new product IDs and items');
    console.log('  🛒 Extension fetched X unprocessed items');
    console.log('');

    // 6. Periodically check for unprocessed items
    let checkCount = 0;
    const checkInterval = setInterval(async () => {
      try {
        checkCount++;
        const itemsRes = await axios.get(`${API_BASE_URL}/items`);
        if (itemsRes.data.length > 0) {
          console.log(`\n📌 Check #${checkCount}: Found ${itemsRes.data.length} unprocessed items ready for extension:`);
          itemsRes.data.forEach(item => {
            console.log(`  - ASIN: ${item.asin}, Seller: ${item.sellerId || 'N/A'}, Price: ¥${item.price || 'N/A'}`);
          });
        } else {
          console.log(`📌 Check #${checkCount}: No unprocessed items`);
        }
      } catch (error) {
        console.error('Error checking items:', error.message);
      }
    }, 10000); // Check every 10 seconds

    // Keep the script running
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Stopping test...');
      clearInterval(checkInterval);
      
      try {
        await axios.post(`${API_BASE_URL}/stop`);
        console.log('✅ Monitoring stopped');
      } catch (error) {
        console.error('Error stopping monitoring:', error.message);
      }
      
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testNewAsins();