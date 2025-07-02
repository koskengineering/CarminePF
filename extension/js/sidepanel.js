class CarminePFSidePanel {
  constructor() {
    this.apiBaseUrl = 'http://localhost:3000/api';
    this.isRunning = false;
    this.pollInterval = null;
    this.itemCheckInterval = null;
    
    this.elements = {
      toggleButton: document.getElementById('toggleButton'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      configForm: document.getElementById('configForm'),
      logArea: document.getElementById('logArea'),
      productFinderUrl: document.getElementById('productFinderUrl'),
      isAmazonOnly: document.getElementById('isAmazonOnly'),
      isFBAOnly: document.getElementById('isFBAOnly'),
      minStarRating: document.getElementById('minStarRating'),
      minReviewCount: document.getElementById('minReviewCount'),
      deleteAfterDays: document.getElementById('deleteAfterDays')
    };

    this.init();
  }

  async init() {
    // Load saved configuration
    await this.loadConfig();
    
    // Check initial status
    await this.checkStatus();
    
    // Bind event listeners
    this.bindEvents();
    
    this.log('CarminePF初期化完了', 'info');
  }

  bindEvents() {
    this.elements.toggleButton.addEventListener('click', () => this.toggleMonitoring());
    this.elements.configForm.addEventListener('submit', (e) => this.saveConfig(e));
  }

  async loadConfig() {
    try {
      const stored = await chrome.storage.local.get([
        'productFinderUrl',
        'isAmazonOnly',
        'isFBAOnly',
        'minStarRating',
        'minReviewCount',
        'deleteAfterDays'
      ]);

      if (stored.productFinderUrl) {
        this.elements.productFinderUrl.value = stored.productFinderUrl;
      }
      this.elements.isAmazonOnly.checked = stored.isAmazonOnly || false;
      this.elements.isFBAOnly.checked = stored.isFBAOnly || false;
      this.elements.minStarRating.value = stored.minStarRating || '';
      this.elements.minReviewCount.value = stored.minReviewCount || '';
      this.elements.deleteAfterDays.value = stored.deleteAfterDays || 7;
    } catch (error) {
      this.log('設定の読み込みに失敗しました', 'error');
      console.error(error);
    }
  }

  async saveConfig(e) {
    e.preventDefault();
    
    const config = {
      productFinderUrl: this.elements.productFinderUrl.value.trim(),
      isAmazonOnly: this.elements.isAmazonOnly.checked,
      isFBAOnly: this.elements.isFBAOnly.checked,
      minStarRating: this.elements.minStarRating.value ? parseFloat(this.elements.minStarRating.value) : null,
      minReviewCount: this.elements.minReviewCount.value ? parseInt(this.elements.minReviewCount.value) : null,
      deleteAfterDays: parseInt(this.elements.deleteAfterDays.value) || 7
    };

    try {
      // Save to Chrome storage
      await chrome.storage.local.set(config);
      
      // Send to backend
      const response = await fetch(`${this.apiBaseUrl}/config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: config.productFinderUrl,
          deleteAfterDays: config.deleteAfterDays,
          isAmazonOnly: config.isAmazonOnly,
          isFBAOnly: config.isFBAOnly,
          minStarRating: config.minStarRating,
          minReviewCount: config.minReviewCount
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save configuration');
      }

      this.log('設定を保存しました', 'success');
    } catch (error) {
      this.log(`設定の保存に失敗しました: ${error.message}`, 'error');
      console.error(error);
    }
  }

  async toggleMonitoring() {
    this.elements.toggleButton.disabled = true;
    
    try {
      if (this.isRunning) {
        await this.stopMonitoring();
      } else {
        await this.startMonitoring();
      }
    } catch (error) {
      this.log(`エラーが発生しました: ${error.message}`, 'error');
      console.error(error);
    } finally {
      this.elements.toggleButton.disabled = false;
    }
  }

  async startMonitoring() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/start`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to start monitoring');
      }

      this.isRunning = true;
      this.updateUI();
      this.startPolling();
      this.log('監視を開始しました', 'success');
    } catch (error) {
      throw error;
    }
  }

  async stopMonitoring() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/stop`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to stop monitoring');
      }

      this.isRunning = false;
      this.updateUI();
      this.stopPolling();
      this.log('監視を停止しました', 'info');
    } catch (error) {
      throw error;
    }
  }

  async checkStatus() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/status`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch status');
      }

      const status = await response.json();
      this.isRunning = status.isRunning;
      this.updateUI();

      if (this.isRunning) {
        this.startPolling();
      }
    } catch (error) {
      this.log('ステータスの取得に失敗しました', 'error');
      console.error(error);
    }
  }

  startPolling() {
    // Stop any existing polling
    this.stopPolling();

    // Poll for new items every 5 seconds (reduced frequency)
    this.itemCheckInterval = setInterval(() => {
      this.checkForNewItems();
    }, 5000);
  }

  stopPolling() {
    if (this.itemCheckInterval) {
      clearInterval(this.itemCheckInterval);
      this.itemCheckInterval = null;
    }
  }

  async checkForNewItems() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/items`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch items');
      }

      const items = await response.json();
      
      if (items.length > 0) {
        this.log(`${items.length}件の新商品を処理中...`, 'info');
        // Process items sequentially with delay
        for (const item of items) {
          await this.processItem(item);
        }
      }
    } catch (error) {
      console.error('Error checking for new items:', error);
    }
  }

  async processItem(item) {
    try {
      this.log(`新しい商品を検出: ${item.asin}`, 'info');
      
      // Get saved configuration for purchase criteria
      const config = await chrome.storage.local.get([
        'minStarRating',
        'minReviewCount',
        'isAmazonOnly',
        'isFBAOnly'
      ]);

      // Create URL with query parameters for auto checkout
      const url = new URL(`https://www.amazon.co.jp/dp/${item.asin}`);
      url.searchParams.set('autoCheckOut', 'true');
      url.searchParams.set('id', item.id.toString());
      
      if (config.minStarRating) {
        url.searchParams.set('review_star', config.minStarRating.toString());
      }
      if (config.minReviewCount) {
        url.searchParams.set('review_count', config.minReviewCount.toString());
      }
      if (config.isAmazonOnly) {
        url.searchParams.set('amazon_only', 'true');
      }
      if (config.isFBAOnly) {
        url.searchParams.set('fba_only', 'true');
      }

      // Open new tab for purchase
      await chrome.tabs.create({
        url: url.toString(),
        active: false
      });

      this.log(`購入ページを開きました: ${item.asin}`, 'success');
      
      // Add delay between processing items to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      this.log(`商品処理エラー: ${error.message}`, 'error');
      console.error(error);
    }
  }

  updateUI() {
    if (this.isRunning) {
      this.elements.toggleButton.textContent = '停止';
      this.elements.toggleButton.classList.add('stop');
      this.elements.statusDot.classList.add('active');
      this.elements.statusText.textContent = '監視中';
    } else {
      this.elements.toggleButton.textContent = '開始';
      this.elements.toggleButton.classList.remove('stop');
      this.elements.statusDot.classList.remove('active');
      this.elements.statusText.textContent = '停止中';
    }
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;
    
    logEntry.innerHTML = `
      <div class="log-time">${timestamp}</div>
      <div class="log-message">${this.escapeHtml(message)}</div>
    `;
    
    this.elements.logArea.appendChild(logEntry);
    this.elements.logArea.scrollTop = this.elements.logArea.scrollHeight;
    
    // Keep only last 50 log entries
    while (this.elements.logArea.children.length > 50) {
      this.elements.logArea.removeChild(this.elements.logArea.firstChild);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.carminePF = new CarminePFSidePanel();
});