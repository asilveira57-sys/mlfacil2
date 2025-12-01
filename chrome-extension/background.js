// ML Analyzer Pro - Background Service Worker

console.log('ML Analyzer Pro: Background script loaded');

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('ML Analyzer Pro: Extension installed');
    // Open welcome page
    chrome.tabs.create({
      url: 'YOUR_APP_URL/auth'
    });
  } else if (details.reason === 'update') {
    console.log('ML Analyzer Pro: Extension updated');
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('ML Analyzer Pro: Message received:', request);
  
  if (request.action === 'getAuthToken') {
    // Retrieve auth token from storage
    chrome.storage.local.get(['authToken'], (result) => {
      sendResponse({ token: result.authToken });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'setAuthToken') {
    // Store auth token
    chrome.storage.local.set({ authToken: request.token }, () => {
      console.log('ML Analyzer Pro: Auth token stored');
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'clearAuthToken') {
    // Clear auth token
    chrome.storage.local.remove(['authToken'], () => {
      console.log('ML Analyzer Pro: Auth token cleared');
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle tab updates to detect ML product pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isMLProductPage = /produto\.mercadolivre\.com\.br|articulo\.mercadolibre\.com/.test(tab.url);
    
    if (isMLProductPage) {
      console.log('ML Analyzer Pro: Product page detected:', tab.url);
      // Inject content script if needed
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).catch(err => console.error('ML Analyzer Pro: Script injection failed:', err));
    }
  }
});
