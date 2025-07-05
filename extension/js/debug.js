// Debug page script
document.addEventListener('DOMContentLoaded', async () => {
  // Load and display errors
  async function loadErrors() {
    const stored = await chrome.storage.local.get('purchaseErrors');
    const errors = stored.purchaseErrors || [];
    
    const errorsDiv = document.getElementById('errors');
    errorsDiv.innerHTML = '';
    
    // Update stats
    document.getElementById('totalErrors').textContent = errors.length;
    
    const today = new Date().toDateString();
    const todayErrors = errors.filter(e => new Date(e.timestamp).toDateString() === today);
    document.getElementById('todayErrors').textContent = todayErrors.length;
    
    if (errors.length === 0) {
      errorsDiv.innerHTML = '<p>エラー履歴はありません</p>';
      return;
    }
    
    // Display errors in reverse order (newest first)
    errors.reverse().forEach((error, index) => {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error-item';
      
      const time = new Date(error.timestamp).toLocaleString('ja-JP');
      
      errorDiv.innerHTML = `
        <div class="timestamp">${time}</div>
        <div><strong>ASIN:</strong> ${error.asin || 'N/A'}</div>
        <div><strong>Status:</strong> ${error.status}</div>
        <div><strong>Error:</strong> ${error.error || 'Unknown error'}</div>
        ${error.sellerId ? `<div><strong>Seller ID:</strong> ${error.sellerId}</div>` : ''}
        ${error.price ? `<div><strong>Price:</strong> ¥${error.price}</div>` : ''}
        <details>
          <summary>詳細情報</summary>
          <pre>${JSON.stringify(error, null, 2)}</pre>
        </details>
      `;
      
      errorsDiv.appendChild(errorDiv);
    });
  }
  
  // Load and display success history
  async function loadSuccess() {
    const stored = await chrome.storage.local.get('purchaseHistory');
    const history = stored.purchaseHistory || [];
    
    const successDiv = document.getElementById('success');
    successDiv.innerHTML = '';
    
    // Update stats
    document.getElementById('totalSuccess').textContent = history.length;
    
    if (history.length === 0) {
      successDiv.innerHTML = '<p>購入成功履歴はありません</p>';
      return;
    }
    
    // Display success in reverse order (newest first)
    history.reverse().forEach((purchase, index) => {
      const purchaseDiv = document.createElement('div');
      purchaseDiv.className = 'success-item';
      
      const time = new Date(purchase.timestamp).toLocaleString('ja-JP');
      
      purchaseDiv.innerHTML = `
        <div class="timestamp">${time}</div>
        <div><strong>ASIN:</strong> ${purchase.asin || 'N/A'}</div>
        <div><strong>Order Number:</strong> ${purchase.orderNumber || 'N/A'}</div>
        ${purchase.sellerId ? `<div><strong>Seller ID:</strong> ${purchase.sellerId}</div>` : ''}
        ${purchase.price ? `<div><strong>Price:</strong> ¥${purchase.price}</div>` : ''}
        <details>
          <summary>詳細情報</summary>
          <pre>${JSON.stringify(purchase, null, 2)}</pre>
        </details>
      `;
      
      successDiv.appendChild(purchaseDiv);
    });
  }
  
  // Clear errors
  document.getElementById('clearErrors').addEventListener('click', async () => {
    if (confirm('エラー履歴をすべて削除しますか？')) {
      await chrome.storage.local.set({ purchaseErrors: [] });
      loadErrors();
    }
  });
  
  // Clear success history
  document.getElementById('clearSuccess').addEventListener('click', async () => {
    if (confirm('成功履歴をすべて削除しますか？')) {
      await chrome.storage.local.set({ purchaseHistory: [] });
      loadSuccess();
    }
  });
  
  // Export errors to JSON
  document.getElementById('exportErrors').addEventListener('click', async () => {
    const stored = await chrome.storage.local.get('purchaseErrors');
    const errors = stored.purchaseErrors || [];
    
    const dataStr = JSON.stringify(errors, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `carminepf-errors-${new Date().toISOString().split('T')[0]}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  });
  
  // Refresh buttons
  document.getElementById('refreshErrors').addEventListener('click', loadErrors);
  document.getElementById('refreshSuccess').addEventListener('click', loadSuccess);
  
  // Initial load
  loadErrors();
  loadSuccess();
});