// Background service worker for the extension
class GovernmentWebsiteDetector {
  constructor() {
    this.apiEndpoint = 'http://localhost:5000/analyze'; // Fixed endpoint
    this.isApiConfigured = false;
    this.setupEventListeners();
    this.loadSettings();
  }

  setupEventListeners() {
    // Listen for tab updates - more comprehensive checking
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      console.log('Tab updated:', changeInfo, tab?.url);
      if (changeInfo.status === 'complete' && tab.url && !this.shouldSkipUrl(tab.url)) {
        console.log('Checking website from tab update:', tab.url);
        this.checkWebsite(tab.url, tabId);
      }
    });

    // Listen for navigation events
    chrome.webNavigation.onCompleted.addListener((details) => {
      console.log('Navigation completed:', details.url);
      if (details.frameId === 0 && !this.shouldSkipUrl(details.url)) { // Main frame only
        console.log('Checking website from navigation:', details.url);
        this.checkWebsite(details.url, details.tabId);
      }
    });

    // Listen for tab activation (when user switches tabs)
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab.url && !this.shouldSkipUrl(tab.url)) {
          console.log('Checking website from tab activation:', tab.url);
          this.checkWebsite(tab.url, activeInfo.tabId);
        }
      } catch (error) {
        console.error('Error in tab activation listener:', error);
      }
    });

    // Listen for messages from content script and popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'checkWebsite') {
        // Handle request from popup (no sender.tab) or content script
        const tabId = request.tabId || (sender.tab ? sender.tab.id : null);
        this.checkWebsite(request.url, tabId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse({ error: error.message }));
        return true; // Keep message channel open for async response
      } else if (request.action === 'settingsUpdated') {
        this.loadSettings();
        sendResponse({ success: true });
      }
    });
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get({
        apiEndpoint: 'http://localhost:5000/analyze',
        showWarnings: true,
        warningDuration: 10,
        confidenceThreshold: 0.7,
        enableFallback: true
      });
      
      this.apiEndpoint = settings.apiEndpoint;
      this.showWarnings = settings.showWarnings;
      this.warningDuration = settings.warningDuration;
      this.confidenceThreshold = settings.confidenceThreshold;
      this.enableFallback = settings.enableFallback;
      
      // Test API connection
      this.testApiConnection();
      
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async checkWebsite(url, tabId) {
    try {
      // Extract domain from URL
      const domain = this.extractDomain(url);
      
      // Skip checking for extension pages, chrome pages, etc.
      if (this.shouldSkipUrl(url)) {
        console.log(`Skipping URL: ${url}`);
        return;
      }

      console.log(`🔍 Checking website: ${domain} (${url})`);

      // Check if we have recent cached result (within 1 hour)
      const cached = await chrome.storage.local.get([`site_${domain}`]);
      const cachedData = cached[`site_${domain}`];
      if (cachedData && (Date.now() - cachedData.timestamp) < 3600000) {
        console.log('Using cached result for', domain);
        this.updateBadge(tabId, cachedData);
        if (cachedData.isUnsafe && this.showWarnings !== false) {
          this.showWarning(tabId, domain, cachedData);
        }
        return;
      }

      // Call your ML model API
      const result = await this.callMLModel(domain, url);
      
      // Store result in chrome storage
      const dataToStore = {
        isGovernment: result.isGovernment,
        confidence: result.confidence,
        isUnsafe: result.isUnsafe,
        reason: result.reason,
        classification: result.classification,
        timestamp: Date.now()
      };
      
      await chrome.storage.local.set({
        [`site_${domain}`]: dataToStore
      });

      console.log(`✅ Analysis complete for ${domain}:`, result);

      // Update extension badge
      this.updateBadge(tabId, result);

      // If the site is detected as unsafe, show warning
      if (result.isUnsafe && this.showWarnings !== false) {
        console.log(`⚠️ Showing warning for unsafe site: ${domain}`);
        this.showWarning(tabId, domain, result);
      }

      // Update daily stats
      this.updateStats();

    } catch (error) {
      console.error('❌ Error checking website:', error);
      
      // Show error in badge
      chrome.action.setBadgeText({
        tabId: tabId,
        text: '!!'
      });
      chrome.action.setBadgeBackgroundColor({
        tabId: tabId,
        color: '#FF9800'
      });
    }
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }

  shouldSkipUrl(url) {
    const skipPatterns = [
      'chrome://',
      'chrome-extension://',
      'moz-extension://',
      'edge://',
      'about:',
      'file://',
      'data:'
    ];
    
    return skipPatterns.some(pattern => url.startsWith(pattern));
  }

  async callMLModel(domain, fullUrl) {
    try {
      console.log(`🔗 Calling ML model API: ${this.apiEndpoint}`);
      console.log(`📊 Analyzing: ${domain} (${fullUrl})`);
      
      const requestData = {
        url: fullUrl || `https://${domain}`,
        domain: domain
      };

      console.log('📤 Request data:', requestData);

      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('📥 ML model response:', data);
      
      // Validate and process response
      const result = {
        isGovernment: data.isGovernment || false,
        confidence: data.confidence || 0,
        isUnsafe: data.isUnsafe || false,
        reason: data.reason || data.classification || 'No reason provided',
        classification: data.classification || 'unknown'
      };

      console.log('🎯 Processed result:', result);
      return result;

    } catch (error) {
      console.error('❌ Error calling ML model:', error);
      
      // Use fallback if enabled
      if (this.enableFallback) {
        console.log('🔄 Using fallback detection...');
        return this.fallbackCheck(domain);
      }
      
      throw error;
    }
  }

  async updateStats() {
    try {
      const result = await chrome.storage.local.get(['dailyStats']);
      const stats = result.dailyStats || { sitesChecked: 0, date: new Date().toDateString() };
      
      // Reset stats if it's a new day
      const today = new Date().toDateString();
      if (stats.date !== today) {
        stats.sitesChecked = 1;
        stats.date = today;
      } else {
        stats.sitesChecked += 1;
      }
      
      await chrome.storage.local.set({ dailyStats: stats });
    } catch (error) {
      console.error('Error updating stats:', error);
    }
  }
  

  async testApiConnection() {
    try {
      const healthUrl = this.apiEndpoint.replace('/analyze', '/health');
      const response = await fetch(healthUrl);
      this.isApiConfigured = response.ok;
      console.log(`API health check: ${this.isApiConfigured ? 'Connected' : 'Failed'}`);
    } catch (error) {
      this.isApiConfigured = false;
      console.log('API connection failed:', error.message);
    }
  }

  fallbackCheck(domain) {
    // Simple fallback heuristics for government websites
    const govPatterns = [
      /\.gov$/,
      /\.gov\./,
      /government/i,
      /ministry/i,
      /parliament/i,
      /senate/i,
      /congress/i
    ];

    const isGovernment = govPatterns.some(pattern => pattern.test(domain));
    
    return {
  isGovernment: isGovernment,
  confidence: isGovernment ? 0.7 : 0.3,
  isUnsafe: !isGovernment, // Mark non-government as unsafe in fallback too
  reason: 'Fallback heuristic check',
  classification: isGovernment ? 'Government/Authorized Website' : 'Unsafe Website'
    };
  }

  async showWarning(tabId, domain, result) {
    try {
      // Inject warning into the page
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.injectWarning,
        args: [domain, result]
      });
    } catch (error) {
      console.error('Error showing warning:', error);
    }
  }

  // This function will be injected into the page
  injectWarning(domain, result) {
    // Remove any existing warnings
    const existingWarning = document.getElementById('gov-website-warning');
    if (existingWarning) {
      existingWarning.remove();
    }

    // Create warning element with enhanced styling
    const warning = document.createElement('div');
    warning.id = 'gov-website-warning';
    warning.innerHTML = `
      <div style="
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        background: linear-gradient(135deg, #ff6b6b, #ee5a52);
        color: white;
        padding: 15px;
        border-radius: 8px;
        z-index: 2147483647;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        border-right: 4px solid #d63031;
        animation: slideIn 0.3s ease-out;
      ">
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
          }
          #gov-website-warning button:hover {
            background: rgba(255,255,255,1) !important;
            transform: scale(1.02);
          }
        </style>
        <div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; display: flex; align-items: center;">
          <span style="margin-right: 8px;">🔒</span>
          PII Protection Alert
        </div>
        <div style="font-size: 12px; line-height: 1.4; margin-bottom: 12px;">
          <strong>⚠️ Unsafe website detected!</strong><br>
          If you're uploading documents containing personal information (PII), please mask sensitive data before uploading.
        </div>
        <div style="font-size: 11px; opacity: 0.9; margin-bottom: 10px;">
          Protect: SSN, addresses, phone numbers, financial data
        </div>
        <div style="font-size: 10px; opacity: 0.8; margin-bottom: 12px;">
          Site: ${domain} | Confidence: ${Math.round((result.confidence || 0) * 100)}%
        </div>
        <button id="dismiss-warning" style="
          padding: 6px 12px;
          background: rgba(255,255,255,0.9);
          color: #d63031;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          font-size: 11px;
          width: 100%;
          transition: all 0.2s ease;
        ">Got it, I'll be careful</button>
      </div>
    `;

    // Add dismiss functionality
    warning.querySelector('#dismiss-warning').addEventListener('click', () => {
      warning.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => warning.remove(), 300);
    });

    // Auto-dismiss based on settings (default 15 seconds)
    const dismissTime = result.warningDuration || 15000;
    if (dismissTime > 0) {
      setTimeout(() => {
        if (document.getElementById('gov-website-warning')) {
          warning.style.animation = 'slideOut 0.3s ease-in';
          setTimeout(() => warning.remove(), 300);
        }
      }, dismissTime);
    }

    // Insert at the beginning of body or document (no padding adjustment needed for left position)
    if (document.body) {
      document.body.appendChild(warning);
    } else {
      // If body doesn't exist yet, wait for it
      const observer = new MutationObserver((mutations, obs) => {
        if (document.body) {
          document.body.appendChild(warning);
          obs.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  }

  updateBadge(tabId, result) {
    let badgeText = '';
    let badgeColor = '#4CAF50'; // Green for safe

    if (result.isGovernment) {
      badgeText = 'GOV';
      badgeColor = '#2196F3'; // Blue for government
    } else if (result.isUnsafe) {
      badgeText = '⚠';
      badgeColor = '#FF5722'; // Red for unsafe
    }

    chrome.action.setBadgeText({
      tabId: tabId,
      text: badgeText
    });

    chrome.action.setBadgeBackgroundColor({
      tabId: tabId,
      color: badgeColor
    });
  }
}

// Initialize the detector
const detector = new GovernmentWebsiteDetector();
