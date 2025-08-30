// Simplified background script for testing popup functionality
class TestGovernmentWebsiteDetector {
  constructor() {
    this.apiEndpoint = 'http://localhost:5000/analyze';
    this.setupEventListeners();
    console.log('🚀 Test Extension Loaded');
  }

  setupEventListeners() {
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && !this.shouldSkipUrl(tab.url)) {
        console.log('🔍 Tab updated, checking:', tab.url);
        this.checkWebsite(tab.url, tabId);
      }
    });

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'checkWebsite') {
        console.log('📨 Message received:', request.url);
        this.checkWebsite(request.url, sender.tab.id);
        sendResponse({ success: true });
      }
    });
  }

  shouldSkipUrl(url) {
    const skipPatterns = ['chrome://', 'chrome-extension://', 'moz-extension://', 'edge://', 'about:', 'file://', 'data:'];
    return skipPatterns.some(pattern => url.startsWith(pattern));
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return url;
    }
  }

  async checkWebsite(url, tabId) {
    try {
      const domain = this.extractDomain(url);
      console.log(`🔍 Checking website: ${domain}`);

      // Call ML API
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url, domain: domain })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('📊 ML Result:', result);

        // Update badge
        this.updateBadge(tabId, result);

        // Show warning if unsafe
        if (result.isUnsafe) {
          console.log('⚠️ Showing warning popup for unsafe site');
          this.showWarning(tabId, domain, result);
        } else {
          console.log('✅ Site is safe, no warning needed');
        }
      } else {
        console.error('❌ API Error:', response.status);
      }
    } catch (error) {
      console.error('❌ Check website error:', error);
    }
  }

  async showWarning(tabId, domain, result) {
    try {
      console.log('💉 Injecting warning popup...');
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.injectSimpleWarning,
        args: [domain, result]
      });
      console.log('✅ Warning popup injected successfully');
    } catch (error) {
      console.error('❌ Error injecting warning:', error);
    }
  }

  // Simple warning popup for testing
  injectSimpleWarning(domain, result) {
    console.log('🚨 Creating warning popup for:', domain);
    
    // Remove existing warning
    const existing = document.getElementById('test-warning');
    if (existing) existing.remove();

    // Create simple warning
    const warning = document.createElement('div');
    warning.id = 'test-warning';
    warning.style.cssText = `
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      background: #ff4444;
      color: white;
      padding: 20px;
      border-radius: 10px;
      z-index: 999999;
      font-family: Arial, sans-serif;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    
    warning.innerHTML = `
      <div>🚨 TEST WARNING POPUP 🚨</div>
      <div style="font-size: 14px; margin-top: 10px;">
        Domain: ${domain}<br>
        Classification: ${result.classification}<br>
        This is a test popup to verify injection works!
      </div>
      <button onclick="this.parentElement.remove()" style="
        margin-top: 15px;
        padding: 8px 16px;
        background: white;
        color: #ff4444;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-weight: bold;
      ">Close Test</button>
    `;

    // Insert into page
    if (document.body) {
      document.body.appendChild(warning);
      console.log('✅ Test warning popup created successfully');
    } else {
      console.error('❌ Document body not found');
    }

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (document.getElementById('test-warning')) {
        warning.remove();
        console.log('🔄 Test warning auto-removed');
      }
    }, 10000);
  }

  updateBadge(tabId, result) {
    try {
      if (result.isGovernment) {
        chrome.action.setBadgeText({ tabId, text: 'GOV' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#2196F3' });
      } else if (result.isUnsafe) {
        chrome.action.setBadgeText({ tabId, text: '⚠' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#FF5722' });
      }
      console.log('✅ Badge updated');
    } catch (error) {
      console.error('❌ Badge update error:', error);
    }
  }
}

// Initialize the test detector
const testDetector = new TestGovernmentWebsiteDetector();
console.log('🧪 Test Extension Background Script Loaded');
