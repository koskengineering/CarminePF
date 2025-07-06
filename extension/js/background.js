// Service Worker for Chrome Extension

// Handle extension icon click to open side panel
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (error) {
    console.error('Error opening side panel:', error);
  }
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Background received message:', request);
  
  switch (request.action) {
    case 'getTabId':
      sendResponse({ tabId: sender.tab?.id || null });
      break;
      
    case 'purchaseComplete':
      handlePurchaseComplete(request.data);
      sendResponse({ success: true });
      break;
      
    case 'purchaseError':
      handlePurchaseError(request.data);
      sendResponse({ success: true });
      break;
      
    case 'log':
      console.log(`[${request.level}] ${request.message}`, request.data);
      sendResponse({ success: true });
      break;
      
    case 'closeTab':
      if (request.tabId) {
        chrome.tabs.remove(request.tabId).catch(err => {
          console.error('Error closing tab:', err);
        });
      }
      sendResponse({ success: true });
      break;
      
    default:
      console.warn('Unknown action:', request.action);
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true; // Keep message channel open for async response
});

// Handle successful purchase
async function handlePurchaseComplete(data) {
  console.log('Purchase completed:', data);
  
  // Store purchase history
  const stored = await chrome.storage.local.get('purchaseHistory');
  const history = stored.purchaseHistory || [];
  history.push({
    ...data,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 100 purchases
  if (history.length > 100) {
    history.splice(0, history.length - 100);
  }
  
  await chrome.storage.local.set({ purchaseHistory: history });
}

// Handle purchase error
async function handlePurchaseError(data) {
  console.error('Purchase error:', data);
  
  // Store error in history
  const stored = await chrome.storage.local.get('purchaseErrors');
  const errors = stored.purchaseErrors || [];
  errors.push({
    ...data,
    timestamp: new Date().toISOString()
  });
  
  // Keep only last 50 errors
  if (errors.length > 50) {
    errors.splice(0, errors.length - 50);
  }
  
  await chrome.storage.local.set({ purchaseErrors: errors });
}

// Initialize extension on install
chrome.runtime.onInstalled.addListener((details) => {
  console.log('CarminePF Extension installed:', details);
  
  // Set default values
  chrome.storage.local.set({
    isEnabled: false,
    purchaseHistory: [],
    purchaseErrors: []
  });
  
  // Set up cleanup alarm
  setupCleanupAlarm();
});

// Handle tab updates for purchase flow
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is an Amazon product page with auto checkout
    if (tab.url.includes('amazon.co.jp') && tab.url.includes('autoCheckOut=true')) {
      console.log('Auto checkout tab detected:', tabId);
      
      try {
        // Check if scripting API is available
        if (chrome.scripting && chrome.scripting.executeScript) {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['js/content.js']
          });
          console.log('Content script injected successfully');
        } else {
          console.warn('chrome.scripting API not available, content script should be injected via manifest');
        }
      } catch (err) {
        console.error('Error injecting content script:', err);
        // Fallback: The content script should already be injected via manifest.json
      }
    }
  }
});

// Set up alarm listener first
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    cleanupOldData();
  }
});

// Create cleanup alarm when extension starts
chrome.runtime.onStartup.addListener(() => {
  setupCleanupAlarm();
});

function setupCleanupAlarm() {
  chrome.alarms.create('cleanup', { periodInMinutes: 60 });
  console.log('Cleanup alarm created');
}

async function cleanupOldData() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7);
  
  const storage = await chrome.storage.local.get(['purchaseHistory', 'purchaseErrors']);
  
  if (storage.purchaseHistory) {
    storage.purchaseHistory = storage.purchaseHistory.filter(item => 
      new Date(item.timestamp) > cutoffDate
    );
  }
  
  if (storage.purchaseErrors) {
    storage.purchaseErrors = storage.purchaseErrors.filter(item => 
      new Date(item.timestamp) > cutoffDate
    );
  }
  
  await chrome.storage.local.set(storage);
  console.log('Cleanup completed');
}