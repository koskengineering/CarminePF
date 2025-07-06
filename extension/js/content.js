// Content script for Amazon automatic purchase
(function() {
  'use strict';
  
  console.log('CarminePF content script loaded');

  // Prevent duplicate execution
  if (window.AmazonAutoPurchase) {
    console.log('CarminePF already initialized, skipping...');
    return;
  }

  class AmazonAutoPurchase {
  constructor() {
    this.urlParams = new URLSearchParams(window.location.search);
    this.isAutoCheckout = this.urlParams.get('ac') === 'true';
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
      tabId: null,
      pageInfo: null,
      debugInfo: null
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
      // Wait for critical elements to load
      this.log('Waiting for page elements to load...', 'info');
      await this.waitForPageElements();
      
      // Check if product meets criteria immediately
      const productInfo = await this.getProductInfo();
      
      if (!this.meetsRequirements(productInfo)) {
        this.result.status = 'rejected';
        this.result.error = this.result.error || 'Product does not meet requirements';
        this.reportResult();
        return;
      }

      // Start purchase process immediately
      await this.selectQuantityAndPurchase();
      
    } catch (error) {
      this.result.status = 'error';
      this.result.error = error.message;
      this.reportResult();
      this.log(`Purchase error: ${error.message}`, 'error');
    }
  }

  async waitForPageElements() {
    const maxWaitTime = 10000; // 10 seconds max
    const checkInterval = 100; // Check every 100ms for faster response
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // Check if minimum required elements are present
      const productTitle = document.querySelector('#productTitle');
      const availabilityElement = document.querySelector('#availability');
      
      // If basic elements exist, proceed immediately
      if (productTitle && availabilityElement) {
        this.log('Basic elements loaded, proceeding', 'info');
        return;
      }
      
      await this.sleep(checkInterval);
    }
    
    this.log('Warning: Some elements may not have loaded', 'warn');
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
      isAmazon: this.checkIfAmazon(),
      isInStock: this.checkInStock(),
      hasBuyNowButton: this.checkBuyNowButton()
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

  checkInStock() {
    const availability = this.getElementText('#availability span');
    // Check for out of stock indicators
    if (availability.includes('在庫切れ') || 
        availability.includes('入荷時期は未定') ||
        availability.includes('現在在庫切れ') ||
        availability.includes('Out of Stock')) {
      return false;
    }
    
    // Check if "Buy Now" or "Add to Cart" buttons are present
    const buyNowButton = document.querySelector('#buy-now-button');
    const addToCartButton = document.querySelector('#add-to-cart-button');
    
    return !!(buyNowButton || addToCartButton);
  }

  checkBuyNowButton() {
    const buyNowButton = document.querySelector('#buy-now-button');
    return !!buyNowButton && !buyNowButton.disabled;
  }
  
  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await this.sleep(50); // Faster polling for quicker response
    }
    
    return null;
  }

  meetsRequirements(productInfo) {
    // Check if product is in stock
    if (!productInfo.isInStock) {
      this.log('Product is out of stock', 'warn');
      this.result.error = 'Product is out of stock';
      return false;
    }

    // Check if Buy Now button exists (required for purchase)
    if (!productInfo.hasBuyNowButton) {
      this.log('Buy Now button not available', 'warn');
      this.result.error = 'Buy Now button not available';
      return false;
    }

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
    
    try {
      // Try to select quantity (default to 1)
      const quantitySelector = document.querySelector('#quantity');
      if (quantitySelector) {
        // Check if quantity selector is editable
        if (quantitySelector.disabled || quantitySelector.readOnly) {
          this.log('Quantity selector is disabled or readonly', 'warn');
          this.result.debugInfo = this.collectDebugInfo('quantity_selection', {
            reason: 'quantity_selector_disabled',
            disabled: quantitySelector.disabled,
            readOnly: quantitySelector.readOnly
          });
        }
        
        const oldValue = quantitySelector.value;
        
        // Get the maximum value from the selector
        let maxQuantity = '1';
        if (quantitySelector.tagName === 'SELECT') {
          // For dropdown selector, get the last option value
          const options = quantitySelector.options;
          if (options.length > 0) {
            maxQuantity = options[options.length - 1].value;
          }
        } else if (quantitySelector.hasAttribute('max')) {
          // For input type number, use max attribute
          maxQuantity = quantitySelector.getAttribute('max');
        }
        
        // Set to maximum quantity
        quantitySelector.value = maxQuantity;
        this.log(`Setting quantity to maximum: ${maxQuantity}`, 'info');
        
        // Trigger change events
        quantitySelector.dispatchEvent(new Event('change', { bubbles: true }));
        quantitySelector.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Verify the value was set
        if (quantitySelector.value !== maxQuantity) {
          this.log(`Quantity change failed: expected ${maxQuantity}, got ${quantitySelector.value}`, 'error');
          this.result.debugInfo = this.collectDebugInfo('quantity_selection', {
            reason: 'quantity_change_failed',
            expectedValue: maxQuantity,
            actualValue: quantitySelector.value,
            oldValue: oldValue
          });
        } else {
          this.log(`Quantity set to maximum: ${maxQuantity}`, 'success');
        }
      } else {
        this.log('Quantity selector not found', 'warn');
        this.result.debugInfo = this.collectDebugInfo('quantity_selection', {
          reason: 'quantity_selector_not_found'
        });
      }

      // Wait a moment for any UI updates
      await this.sleep(1000);

      // Click "Buy Now" button
      await this.clickBuyNow();
      
    } catch (error) {
      this.result.error = `Quantity selection error: ${error.message}`;
      this.result.debugInfo = this.collectDebugInfo('quantity_selection', {
        reason: 'exception',
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async clickBuyNow() {
    this.result.status = 'clicking_buy_now';
    
    try {
      // Try to find button immediately first
      let buyNowButton = document.querySelector('#buy-now-button, [name="submit.buy-now"]');
      
      if (!buyNowButton) {
        // Wait only if not found immediately
        this.log('Buy Now button not immediately visible, waiting...', 'info');
        buyNowButton = await this.waitForElement('#buy-now-button, [name="submit.buy-now"]', 5000);
      }
      
      if (!buyNowButton) {
        this.result.debugInfo = this.collectDebugInfo('buy_now_click', {
          reason: 'button_not_found',
          waitTime: '5 seconds'
        });
        throw new Error('Buy Now button not found');
      }

      if (buyNowButton.disabled) {
        this.result.debugInfo = this.collectDebugInfo('buy_now_click', {
          reason: 'button_disabled',
          buttonText: buyNowButton.textContent?.trim(),
          buttonClasses: buyNowButton.className
        });
        throw new Error('Buy Now button is disabled');
      }

      this.log('Clicking Buy Now button', 'info');
      
      // Try multiple click methods
      const clickMethods = [
        () => buyNowButton.click(),
        () => buyNowButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
        () => {
          if (buyNowButton.form) {
            buyNowButton.form.submit();
          }
        }
      ];
      
      let clickSuccessful = false;
      for (const clickMethod of clickMethods) {
        try {
          clickMethod();
          clickSuccessful = true;
          break;
        } catch (clickError) {
          this.log(`Click method failed: ${clickError.message}`, 'warn');
        }
      }
      
      if (!clickSuccessful) {
        this.result.debugInfo = this.collectDebugInfo('buy_now_click', {
          reason: 'all_click_methods_failed'
        });
        throw new Error('All click methods failed');
      }

      // Wait for navigation to checkout
      await this.waitForCheckout();
      
    } catch (error) {
      if (!this.result.debugInfo) {
        this.result.debugInfo = this.collectDebugInfo('buy_now_click', {
          reason: 'exception',
          error: error.message,
          stack: error.stack
        });
      }
      throw error;
    }
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

    this.result.debugInfo = this.collectDebugInfo('checkout_process', {
      reason: 'checkout_page_timeout',
      waitTime: maxWait,
      currentUrl: window.location.href
    });
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
      this.result.debugInfo = this.collectDebugInfo('checkout_process', {
        reason: 'place_order_button_unavailable',
        buttonExists: !!placeOrderButton,
        buttonDisabled: placeOrderButton?.disabled
      });
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
        this.result.debugInfo = this.collectDebugInfo('checkout_process', {
          reason: 'turbo_iframe_access_denied',
          iframeExists: !!iframe
        });
        throw new Error('Cannot access turbo checkout iframe');
      }

      const turboButton = iframeDoc.querySelector('#turbo-checkout-pyo-button, .turbo-checkout-button');
      if (turboButton) {
        this.log('Clicking turbo checkout button', 'info');
        this.result.status = 'placing_order';
        turboButton.click();
        
        await this.waitForOrderConfirmation();
      } else {
        this.result.debugInfo = this.collectDebugInfo('checkout_process', {
          reason: 'turbo_button_not_found',
          iframeAccessible: true
        });
        throw new Error('Turbo checkout button not found');
      }
    } catch (error) {
      if (!this.result.debugInfo) {
        this.result.debugInfo = this.collectDebugInfo('checkout_process', {
          reason: 'turbo_checkout_exception',
          error: error.message,
          stack: error.stack
        });
      }
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
        this.result.debugInfo = this.collectDebugInfo('checkout_process', {
          reason: 'order_error_detected',
          errorMessage: errorElement.textContent.trim()
        });
        throw new Error(`Order error: ${errorElement.textContent.trim()}`);
      }

      await this.sleep(1000);
    }

    this.result.debugInfo = this.collectDebugInfo('checkout_process', {
      reason: 'order_confirmation_timeout',
      waitTime: maxWait,
      currentUrl: window.location.href
    });
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

  /**
   * Collect page information for debugging
   */
  collectPageInfo() {
    try {
      const pageInfo = {
        url: window.location.href,
        title: document.title,
        timestamp: new Date().toISOString(),
        elements: {}
      };

      // Collect key elements information
      const selectors = {
        productTitle: '#productTitle',
        price: '.a-price-whole, .a-price .a-offscreen',
        availability: '#availability span',
        quantitySelector: '#quantity',
        buyNowButton: '#buy-now-button, [name="submit.buy-now"]',
        addToCartButton: '#add-to-cart-button',
        sellerInfo: '#merchant-info, [data-feature-name="merchant"] a',
        starRating: '[data-hook="average-star-rating"] .a-icon-alt',
        reviewCount: '[data-hook="total-review-count"], #acrCustomerReviewText',
        errors: '.error, .alert-error, [data-test-id="error"]'
      };

      for (const [key, selector] of Object.entries(selectors)) {
        const elements = document.querySelectorAll(selector);
        pageInfo.elements[key] = Array.from(elements).map(el => ({
          exists: true,
          text: el.textContent?.trim() || '',
          value: el.value || '',
          disabled: el.disabled || false,
          visible: el.offsetParent !== null,
          classes: el.className,
          id: el.id,
          tagName: el.tagName
        }));
      }

      // Collect form information
      const forms = document.querySelectorAll('form');
      pageInfo.forms = Array.from(forms).map(form => ({
        id: form.id,
        action: form.action,
        method: form.method,
        inputs: Array.from(form.querySelectorAll('input, select')).map(input => ({
          name: input.name,
          type: input.type,
          value: input.value,
          disabled: input.disabled
        }))
      }));

      // Collect any error messages
      const errorElements = document.querySelectorAll('.error, .alert, .warning, [role="alert"]');
      pageInfo.errorMessages = Array.from(errorElements).map(el => el.textContent?.trim()).filter(text => text);

      // Save page screenshot info (we can't take actual screenshot in content script)
      pageInfo.viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        scrollTop: window.scrollY,
        scrollLeft: window.scrollX
      };

      return pageInfo;
    } catch (error) {
      console.error('Error collecting page info:', error);
      return { error: error.message, timestamp: new Date().toISOString() };
    }
  }

  /**
   * Collect debug information for failed operations
   */
  collectDebugInfo(operation, additionalInfo = {}) {
    const debugInfo = {
      operation,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...additionalInfo
    };

    // Add specific debug info based on operation
    switch (operation) {
      case 'quantity_selection':
        debugInfo.quantityElements = this.collectQuantityElementsInfo();
        break;
      case 'buy_now_click':
        debugInfo.buyNowElements = this.collectBuyNowElementsInfo();
        break;
      case 'checkout_process':
        debugInfo.checkoutElements = this.collectCheckoutElementsInfo();
        break;
      case 'general_error':
        debugInfo.pageInfo = this.collectPageInfo();
        break;
    }

    return debugInfo;
  }

  collectQuantityElementsInfo() {
    const quantitySelectors = ['#quantity', '[name="quantity"]', '.quantity-select'];
    const info = {};
    
    quantitySelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      info[selector] = Array.from(elements).map(el => ({
        exists: true,
        tagName: el.tagName,
        type: el.type,
        value: el.value,
        disabled: el.disabled,
        readonly: el.readOnly,
        style: el.style.cssText,
        computedStyle: window.getComputedStyle(el).display,
        options: el.tagName === 'SELECT' ? Array.from(el.options).map(opt => ({
          value: opt.value,
          text: opt.text,
          selected: opt.selected
        })) : null
      }));
    });

    return info;
  }

  collectBuyNowElementsInfo() {
    const buyNowSelectors = ['#buy-now-button', '[name="submit.buy-now"]', '.buy-now'];
    const info = {};
    
    buyNowSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      info[selector] = Array.from(elements).map(el => ({
        exists: true,
        tagName: el.tagName,
        type: el.type,
        disabled: el.disabled,
        text: el.textContent?.trim(),
        style: el.style.cssText,
        computedStyle: window.getComputedStyle(el).display,
        onclick: el.onclick ? el.onclick.toString() : null
      }));
    });

    return info;
  }

  collectCheckoutElementsInfo() {
    const checkoutSelectors = ['#placeOrder', '[name="placeOrder"]', '.place-order-button'];
    const info = {};
    
    checkoutSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      info[selector] = Array.from(elements).map(el => ({
        exists: true,
        tagName: el.tagName,
        disabled: el.disabled,
        text: el.textContent?.trim(),
        style: el.style.cssText
      }));
    });

    return info;
  }

  reportResult() {
    this.result.timestamp = new Date().toISOString();
    
    // Collect page info if there was an error
    if (this.result.status !== 'completed') {
      this.result.pageInfo = this.collectPageInfo();
      this.result.debugInfo = this.collectDebugInfo('general_error');
    }
    
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

// Make class available globally
window.AmazonAutoPurchase = AmazonAutoPurchase;

// Initialize auto purchase if this is a product page
if (window.location.href.includes('amazon.co.jp/dp/') || 
    window.location.href.includes('amazon.co.jp/gp/product/')) {
  
  // Check if already initialized to prevent duplicate execution
  if (!window.carminePFInitialized) {
    window.carminePFInitialized = true;
    
    // Initialize immediately if page is ready, otherwise wait
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      try {
        new AmazonAutoPurchase();
      } catch (error) {
        console.error('Error initializing AmazonAutoPurchase:', error);
      }
    } else {
      // Wait only if page is still loading
      document.addEventListener('DOMContentLoaded', () => {
        try {
          new AmazonAutoPurchase();
        } catch (error) {
          console.error('Error initializing AmazonAutoPurchase:', error);
        }
      });
    }
  }
}

})();