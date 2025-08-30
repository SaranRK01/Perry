// Options page functionality
class OptionsManager {
  constructor() {
    this.defaultSettings = {
      apiEndpoint: '',
      apiKey: '',
      showWarnings: true,
      warningDuration: 15,
      confidenceThreshold: 0.7,
      enableFallback: true,
      customKeywords: 'ministry, department, bureau, council, agency, administration',
      enableLogging: false,
      cacheResults: true
    };
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    await this.loadSettings();
  }

  setupEventListeners() {
    // Save settings button
    document.getElementById('saveSettings').addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset settings button
    document.getElementById('resetSettings').addEventListener('click', () => {
      this.resetSettings();
    });

    // Test connection button
    document.getElementById('testConnection').addEventListener('click', () => {
      this.testConnection();
    });

    // Clear cache button
    document.getElementById('clearCache').addEventListener('click', () => {
      this.clearCache();
    });

    // Real-time API endpoint validation
    document.getElementById('apiEndpoint').addEventListener('blur', () => {
      this.validateApiEndpoint();
    });
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(this.defaultSettings);
      
      // Populate form fields
      document.getElementById('apiEndpoint').value = result.apiEndpoint || '';
      document.getElementById('apiKey').value = result.apiKey || '';
      document.getElementById('showWarnings').checked = result.showWarnings;
      document.getElementById('warningDuration').value = result.warningDuration;
      document.getElementById('confidenceThreshold').value = result.confidenceThreshold;
      document.getElementById('enableFallback').checked = result.enableFallback;
      document.getElementById('customKeywords').value = result.customKeywords || '';
      document.getElementById('enableLogging').checked = result.enableLogging;
      document.getElementById('cacheResults').checked = result.cacheResults;
      
      // Update API status
      if (result.apiEndpoint) {
        this.updateApiStatus('checking', 'Checking...');
        this.testConnection(false); // Test silently
      }
      
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showMessage('Error loading settings', 'error');
    }
  }

  async saveSettings() {
    try {
      const settings = {
        apiEndpoint: document.getElementById('apiEndpoint').value.trim(),
        apiKey: document.getElementById('apiKey').value.trim(),
        showWarnings: document.getElementById('showWarnings').checked,
        warningDuration: parseInt(document.getElementById('warningDuration').value),
        confidenceThreshold: parseFloat(document.getElementById('confidenceThreshold').value),
        enableFallback: document.getElementById('enableFallback').checked,
        customKeywords: document.getElementById('customKeywords').value.trim(),
        enableLogging: document.getElementById('enableLogging').checked,
        cacheResults: document.getElementById('cacheResults').checked
      };

      // Validate settings
      if (!this.validateSettings(settings)) {
        return;
      }

      // Save to storage
      await chrome.storage.sync.set(settings);
      
      this.showMessage('Settings saved successfully!', 'success');
      
      // Notify background script of settings change
      chrome.runtime.sendMessage({
        action: 'settingsUpdated',
        settings: settings
      });
      
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showMessage('Error saving settings', 'error');
    }
  }

  resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      // Clear from storage
      chrome.storage.sync.clear();
      
      // Reset form to defaults
      document.getElementById('apiEndpoint').value = '';
      document.getElementById('apiKey').value = '';
      document.getElementById('showWarnings').checked = this.defaultSettings.showWarnings;
      document.getElementById('warningDuration').value = this.defaultSettings.warningDuration;
      document.getElementById('confidenceThreshold').value = this.defaultSettings.confidenceThreshold;
      document.getElementById('enableFallback').checked = this.defaultSettings.enableFallback;
      document.getElementById('customKeywords').value = this.defaultSettings.customKeywords;
      document.getElementById('enableLogging').checked = this.defaultSettings.enableLogging;
      document.getElementById('cacheResults').checked = this.defaultSettings.cacheResults;
      
      this.updateApiStatus('disconnected', 'Not Connected');
      this.showMessage('Settings reset to defaults', 'success');
    }
  }

  async testConnection(showResult = true) {
    const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
    
    if (!apiEndpoint) {
      this.updateApiStatus('disconnected', 'No endpoint configured');
      if (showResult) {
        this.showMessage('Please enter an API endpoint first', 'error');
      }
      return;
    }

    this.updateApiStatus('checking', 'Testing...');
    
    try {
      // Test with a sample domain
      const testData = {
        domain: 'test.gov',
        url: 'https://test.gov'
      };

      const apiKey = document.getElementById('apiKey').value.trim();
      const headers = {
        'Content-Type': 'application/json'
      };
      
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(testData)
      });

      if (response.ok) {
        const data = await response.json();
        
        // Validate response format
        if (this.validateApiResponse(data)) {
          this.updateApiStatus('connected', 'Connected');
          if (showResult) {
            this.showMessage('API connection successful!', 'success');
          }
        } else {
          this.updateApiStatus('disconnected', 'Invalid Response');
          if (showResult) {
            this.showMessage('API returned invalid response format', 'error');
          }
        }
      } else {
        this.updateApiStatus('disconnected', `Error ${response.status}`);
        if (showResult) {
          this.showMessage(`API connection failed: ${response.status}`, 'error');
        }
      }
      
    } catch (error) {
      console.error('API test error:', error);
      this.updateApiStatus('disconnected', 'Connection Failed');
      if (showResult) {
        this.showMessage(`Connection failed: ${error.message}`, 'error');
      }
    }
  }

  validateApiResponse(data) {
    return (
      typeof data === 'object' &&
      typeof data.isGovernment === 'boolean' &&
      typeof data.confidence === 'number' &&
      data.confidence >= 0 && data.confidence <= 1
    );
  }

  async clearCache() {
    if (confirm('Are you sure you want to clear all cached analysis results?')) {
      try {
        // Get all storage keys
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = [];
        
        // Find site analysis cache keys
        for (const key in allData) {
          if (key.startsWith('site_')) {
            keysToRemove.push(key);
          }
        }
        
        // Remove cache keys
        if (keysToRemove.length > 0) {
          await chrome.storage.local.remove(keysToRemove);
          this.showMessage(`Cleared ${keysToRemove.length} cached results`, 'success');
        } else {
          this.showMessage('No cached data found', 'success');
        }
        
      } catch (error) {
        console.error('Error clearing cache:', error);
        this.showMessage('Error clearing cache', 'error');
      }
    }
  }

  validateSettings(settings) {
    // Validate API endpoint
    if (settings.apiEndpoint && !this.isValidUrl(settings.apiEndpoint)) {
      this.showMessage('Please enter a valid API endpoint URL', 'error');
      return false;
    }

    // Validate confidence threshold
    if (settings.confidenceThreshold < 0 || settings.confidenceThreshold > 1) {
      this.showMessage('Confidence threshold must be between 0 and 1', 'error');
      return false;
    }

    // Validate warning duration
    if (settings.warningDuration < -1) {
      this.showMessage('Invalid warning duration', 'error');
      return false;
    }

    return true;
  }

  validateApiEndpoint() {
    const endpoint = document.getElementById('apiEndpoint').value.trim();
    if (endpoint && !this.isValidUrl(endpoint)) {
      this.showMessage('Please enter a valid URL', 'error');
    }
  }

  isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  updateApiStatus(status, text) {
    const statusEl = document.getElementById('apiStatus');
    statusEl.className = `api-status ${status}`;
    statusEl.textContent = text;
  }

  showMessage(message, type) {
    const messageEl = document.getElementById('statusMessage');
    messageEl.className = `status-message status-${type}`;
    messageEl.textContent = message;
    messageEl.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 5000);
  }
}

// Initialize options manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
