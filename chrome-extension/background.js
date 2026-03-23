// ML Analyzer Pro - Background Service Worker
// Includes ZPL label capture from Mercado Livre downloads

console.log('ML Analyzer Pro: Background script loaded');

const APP_BASE_URL = 'https://mlfacil2.lovable.app';

// ── ZPL Download Detection ──────────────────────────────────────────

function isZplDownload(downloadItem) {
  const url = (downloadItem.url || '').toLowerCase();
  const filename = (downloadItem.filename || '').toLowerCase();
  const finalUrl = (downloadItem.finalUrl || url).toLowerCase();

  // Must come from ML domain
  const isMlDomain = /mercadolivre\.com|mercadolibre\.com|mercadoshops\.com/.test(url) ||
                     /mercadolivre\.com|mercadolibre\.com|mercadoshops\.com/.test(finalUrl);

  // Must be a text/zpl file
  const isLabelFile = filename.endsWith('.txt') || filename.endsWith('.zpl');

  // Common label file patterns
  const isLabelName = /etiquet|label|envio|shipment|volume/i.test(filename);

  return isMlDomain && isLabelFile && isLabelName;
}

// Listen for downloads
chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state || delta.state.current !== 'complete') return;

  try {
    const [downloadItem] = await chrome.downloads.search({ id: delta.id });
    if (!downloadItem) return;

    if (!isZplDownload(downloadItem)) return;

    console.log('[ZPL_IMPORT] capture_detected', downloadItem.filename);

    // Read the file content using fetch on the local file URL
    const fileUrl = downloadItem.url;
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      console.error('[ZPL_IMPORT] file_read_error', response.status);
      return;
    }

    const zplContent = await response.text();
    console.log('[ZPL_IMPORT] file_read_success', { length: zplContent.length });

    if (!zplContent.trim()) {
      console.warn('[ZPL_IMPORT] empty file, skipping');
      return;
    }

    // Open the ZPL converter with the content
    const encoded = encodeURIComponent(zplContent);
    const fileName = encodeURIComponent(downloadItem.filename || 'etiqueta.txt');
    const targetUrl = `${APP_BASE_URL}/zpl-converter?zpl=${encoded}&source=mercado_livre&file_name=${fileName}`;

    chrome.tabs.create({ url: targetUrl });
    console.log('[ZPL_IMPORT] download_completed - opened converter');
  } catch (err) {
    console.error('[ZPL_IMPORT] import_error', err);
  }
});

// ── Existing functionality ──────────────────────────────────────────

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('ML Analyzer Pro: Extension installed');
    chrome.tabs.create({ url: `${APP_BASE_URL}/auth` });
  } else if (details.reason === 'update') {
    console.log('ML Analyzer Pro: Extension updated');
  }
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('ML Analyzer Pro: Message received:', request);
  
  if (request.action === 'getAuthToken') {
    chrome.storage.local.get(['authToken'], (result) => {
      sendResponse({ token: result.authToken });
    });
    return true;
  }
  
  if (request.action === 'setAuthToken') {
    chrome.storage.local.set({ authToken: request.token }, () => {
      console.log('ML Analyzer Pro: Auth token stored');
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'clearAuthToken') {
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
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }).catch(err => console.error('ML Analyzer Pro: Script injection failed:', err));
    }
  }
});
