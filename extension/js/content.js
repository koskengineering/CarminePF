// Content script for Amazon automatic purchase
console.log('CarminePF content script loaded');

class AmazonAutoPurchase {
  constructor() {
    this.urlParams = new URLSearchParams(window.location.search);
    this.isAutoCheckout = this.urlParams.get('autoCheckOut') === 'true';
    this.itemId = this.urlParams.get('id');
    this.minStarRating = parseFloat(this.urlParams.get('review_star')) || null;
    this.minReviewCount = parseInt(this.urlParams.get('review_count')) || null;
    this.amazonOnly = this.urlParams.get('amazon_only') === 'true';
    this.fbaOnly = this.urlParams.get('fba_only') === 'true';
    
    this.result = {
      itemId: this.itemId,
      asin: this.extractAsinFromUrl(),
      status: 'initialized',
      timestamp: new Date().toISOString(),
      error: null,
      orderNumber: null,
      tabId: null
    };

    this.init();
  }

  async init() {
    if (!this.isAutoCheckout) {
      console.log('Not an auto checkout page');
      return;
    }

    try {
      // Get tab ID
      this.result.tabId = await this.getTabId();
      
      this.log('Auto checkout started', 'info');
      
      // Wait for page to fully load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.startPurchaseFlow());
      } else {
        this.startPurchaseFlow();
      }
    } catch (error) {
      console.error('Error in init:', error);
      this.result.status = 'error';
      this.result.error = `Initialization error: ${error.message}`;
      this.reportResult();
    }
  }

  async getTabId() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getTabId' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting tab ID:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response?.tabId || null);
        }
      });
    });
  }

  extractAsinFromUrl() {
    const match = window.location.href.match(/\/dp\/([A-Z0-9]{10})/);
    return match ? match[1] : null;
  }

  async startPurchaseFlow() {
    try {
      // Check if product meets criteria
      const productInfo = await this.getProductInfo();
      
      if (!this.meetsRequirements(productInfo)) {
        this.result.status = 'rejected';
        this.result.error = 'Product does not meet requirements';
        this.reportResult();
        return;
      }

      // Start purchase process
      await this.selectQuantityAndPurchase();
      
    } catch (error) {
      this.result.status = 'error';
      this.result.error = error.message;
      this.reportResult();
      this.log(`Purchase error: ${error.message}`, 'error');
    }
  }

  async getProductInfo() {
    const info = {
      title: this.getElementText('#productTitle'),
      price: this.extractPrice(),
      starRating: this.extractStarRating(),
      reviewCount: this.extractReviewCount(),
      availability: this.getElementText('#availability span'),
      seller: this.getSellerInfo(),
      isFBA: this.checkIfFBA(),
      isAmazon: this.checkIfAmazon()
    };

    this.log(`Product info: ${JSON.stringify(info)}`, 'debug');
    return info;
  }

  extractPrice() {
    const priceElement = document.querySelector('.a-price-whole, .a-price .a-offscreen');
    if (!priceElement) return null;
    
    const priceText = priceElement.textContent || priceElement.innerText;
    const match = priceText.match(/[\d,]+/);
    return match ? parseInt(match[0].replace(/,/g, ''), 10) : null;
  }

  extractStarRating() {
    const starElement = document.querySelector('[data-hook="average-star-rating"] .a-icon-alt, .a-icon-star .a-icon-alt');
    if (!starElement) return null;
    
    const match = starElement.textContent.match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
  }

  extractReviewCount() {
    const reviewElement = document.querySelector('[data-hook="total-review-count"], #acrCustomerReviewText');
    if (!reviewElement) return null;
    
    const match = reviewElement.textContent.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  getSellerInfo() {
    const sellerElement = document.querySelector('#merchant-info, [data-feature-name="merchant"] a, #merchantInfoFeature_feature_div');
    return sellerElement ? sellerElement.textContent.trim() : 'Unknown';
  }

  checkIfFBA() {
    const fulfillmentText = this.getElementText('#fulfillmentInfoFeature_feature_div, #merchant-info');
    return fulfillmentText.includes('Amazon') || fulfillmentText.includes('アマゾン');
  }

  checkIfAmazon() {
    const seller = this.getSellerInfo();
    return seller.includes('Amazon.co.jp') || seller.includes('アマゾン');
  }

  meetsRequirements(productInfo) {
    // Check star rating requirement
    if (this.minStarRating && (!productInfo.starRating || productInfo.starRating < this.minStarRating)) {
      this.log(`Star rating ${productInfo.starRating} below minimum ${this.minStarRating}`, 'warn');
      return false;
    }

    // Check review count requirement
    if (this.minReviewCount && (!productInfo.reviewCount || productInfo.reviewCount < this.minReviewCount)) {
      this.log(`Review count ${productInfo.reviewCount} below minimum ${this.minReviewCount}`, 'warn');
      return false;
    }

    // Check Amazon seller requirement
    if (this.amazonOnly && !productInfo.isAmazon) {
      this.log('Not sold by Amazon', 'warn');
      return false;
    }

    // Check FBA requirement
    if (this.fbaOnly && !productInfo.isFBA) {
      this.log('Not fulfilled by Amazon', 'warn');
      return false;
    }

    this.log('Product meets all requirements', 'info');
    return true;
  }

  async selectQuantityAndPurchase() {
    this.result.status = 'selecting_quantity';
    
    // Try to select quantity (default to 1)
    const quantitySelector = document.querySelector('#quantity');
    if (quantitySelector) {
      quantitySelector.value = '1';
      this.log('Quantity set to 1', 'info');
    }

    // Wait a moment for any UI updates
    await this.sleep(1000);

    // Click "Buy Now" button
    await this.clickBuyNow();
  }

  async clickBuyNow() {
    this.result.status = 'clicking_buy_now';
    
    const buyNowButton = document.querySelector('#buy-now-button, [name="submit.buy-now"]');
    
    if (!buyNowButton) {
      throw new Error('Buy Now button not found');
    }

    if (buyNowButton.disabled) {
      throw new Error('Buy Now button is disabled');
    }

    this.log('Clicking Buy Now button', 'info');
    buyNowButton.click();

    // Wait for navigation to checkout
    await this.waitForCheckout();
  }

  async waitForCheckout() {
    this.result.status = 'waiting_for_checkout';
    
    // Wait for checkout page or turbo checkout
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      // Check if we're on checkout page
      if (window.location.href.includes('/checkout/') || 
          window.location.href.includes('/buy/')) {
        await this.handleCheckout();
        return;
      }

      // Check for turbo checkout iframe
      const turboFrame = document.querySelector('#turbo-checkout-iframe');
      if (turboFrame) {
        await this.handleTurboCheckout(turboFrame);
        return;
      }

      await this.sleep(500);
    }

    throw new Error('Checkout page did not load within timeout');
  }

  async handleCheckout() {
    this.result.status = 'in_checkout';
    this.log('Reached checkout page', 'info');

    // Look for place order button
    await this.sleep(2000); // Wait for page to stabilize

    const placeOrderButton = document.querySelector('#placeOrder, [name="placeOrder"], .place-order-button');
    
    if (placeOrderButton && !placeOrderButton.disabled) {
      this.log('Clicking Place Order button', 'info');
      this.result.status = 'placing_order';
      
      // Extract order number if available
      this.extractOrderNumber();
      
      placeOrderButton.click();
      
      // Wait for order confirmation
      await this.waitForOrderConfirmation();
    } else {
      throw new Error('Place Order button not found or disabled');
    }
  }

  async handleTurboCheckout(iframe) {
    this.result.status = 'turbo_checkout';
    this.log('Handling turbo checkout', 'info');

    try {
      // Wait for iframe to load
      await this.sleep(2000);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error('Cannot access turbo checkout iframe');
      }

      const turboButton = iframeDoc.querySelector('#turbo-checkout-pyo-button, .turbo-checkout-button');
      if (turboButton) {
        this.log('Clicking turbo checkout button', 'info');
        this.result.status = 'placing_order';
        turboButton.click();
        
        await this.waitForOrderConfirmation();
      } else {
        throw new Error('Turbo checkout button not found');
      }
    } catch (error) {
      this.log(`Turbo checkout error: ${error.message}`, 'error');
      throw error;
    }
  }

  async waitForOrderConfirmation() {
    this.result.status = 'waiting_for_confirmation';
    
    const maxWait = 30000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      // Check for order confirmation page
      if (window.location.href.includes('/thankyou/') ||
          window.location.href.includes('/orderconfirmation/') ||
          document.querySelector('.order-confirmation, #order-summary')) {
        
        this.result.status = 'completed';
        this.extractOrderNumber();
        this.log('Order completed successfully', 'success');
        this.reportResult();
        return;
      }

      // Check for errors
      const errorElement = document.querySelector('.error, .alert-error, [data-test-id="error"]');
      if (errorElement) {
        throw new Error(`Order error: ${errorElement.textContent.trim()}`);
      }

      await this.sleep(1000);
    }

    throw new Error('Order confirmation not received within timeout');
  }

  extractOrderNumber() {
    // Try multiple patterns for order number
    const patterns = [
      /order[#\s]*([0-9\-]+)/i,
      /注文番号[#\s]*([0-9\-]+)/i,
      /purchaseId=([0-9\-]+)/i
    ];

    for (const pattern of patterns) {
      const match = document.body.textContent.match(pattern) || 
                   window.location.href.match(pattern);
      if (match) {
        this.result.orderNumber = match[1];
        break;
      }
    }
  }

  getElementText(selector) {
    const element = document.querySelector(selector);
    return element ? element.textContent.trim() : '';
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  log(message, level = 'info') {
    console.log(`[CarminePF] ${message}`);
    
    // Send log to background script
    chrome.runtime.sendMessage({
      action: 'log',
      level: level,
      message: message,
      data: { asin: this.result.asin, itemId: this.itemId }
    });
  }

  reportResult() {
    this.result.timestamp = new Date().toISOString();
    
    const messageData = {
      action: this.result.status === 'completed' ? 'purchaseComplete' : 'purchaseError',
      data: this.result
    };

    try {
      chrome.runtime.sendMessage(messageData, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error sending message to background:', chrome.runtime.lastError);
        } else {
          console.log('Message sent successfully:', response);
        }
      });
    } catch (error) {
      console.error('Error in reportResult:', error);
    }

    this.log(`Purchase result: ${this.result.status}`, 
             this.result.status === 'completed' ? 'success' : 'error');
  }
}

// Initialize auto purchase if this is a product page
if (window.location.href.includes('amazon.co.jp/dp/') || 
    window.location.href.includes('amazon.co.jp/gp/product/')) {
  
  // Check if already initialized to prevent duplicate execution
  if (!window.carminePFInitialized) {
    window.carminePFInitialized = true;
    
    // Small delay to ensure page is ready
    setTimeout(() => {
      try {
        new AmazonAutoPurchase();
      } catch (error) {
        console.error('Error initializing AmazonAutoPurchase:', error);
      }
    }, 1000);
  }
}