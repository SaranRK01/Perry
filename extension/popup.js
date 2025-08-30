// Popup JavaScript functionality
class PopupManager {
  constructor() {
    this.currentTab = null;
    this.siteData = null;
    this.documentMasking = null;
    this.panMasking = null;
    this.selectedFile = null;
    this.panSelectedFile = null;
    this.apiEndpoint = 'http://localhost:5000';  // Unified server
    this.panApiEndpoint = 'http://localhost:5000';  // Same unified server
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    this.setupEventListeners();
    await this.testMLAPI(); // Test ML API connection
    await this.loadSiteData();
    this.updateUI();
    this.loadStats();
  }

  async testMLAPI() {
    try {
      const response = await fetch('http://localhost:5000/health');  // Unified server
      const result = await response.json();
      console.log('Unified Server Health Check:', result);
      
      // Also test direct analysis
      if (this.currentTab && this.currentTab.url) {
        console.log('🧪 Testing direct ML API call...');
        const testResponse = await fetch('http://localhost:5000/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: this.currentTab.url,
            domain: this.extractDomain(this.currentTab.url)
          })
        });
        const testResult = await testResponse.json();
        console.log('🧪 Direct ML API test result:', testResult);
      }
    } catch (error) {
      console.error('Unified Server not reachable:', error);
    }
  }

  async getCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tabs[0];
    } catch (error) {
      console.error('Error getting current tab:', error);
    }
  }

  setupEventListeners() {
    // Recheck button
    document.getElementById('recheck').addEventListener('click', () => {
      this.recheckSite();
    });

    // Toggle details button
    document.getElementById('toggleDetails').addEventListener('click', () => {
      this.toggleDetails();
    });

    // Settings and help links
    document.getElementById('settingsLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.openSettings();
    });

    document.getElementById('helpLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.openHelp();
    });

    // Document masking button
    document.getElementById('documentMaskingBtn').addEventListener('click', () => {
      console.log('Document masking button clicked');
      this.showMaskingInterface();
    });

    // PAN masking button
    document.getElementById('panMaskingBtn').addEventListener('click', () => {
      console.log('PAN masking button clicked');
      this.showPanMaskingInterface();
    });

    // Back button from masking interface
    setTimeout(() => {
      const backBtn = document.getElementById('backToMain');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.showMainInterface();
        });
      }
      
      const panBackBtn = document.getElementById('backToPanMain');
      if (panBackBtn) {
        panBackBtn.addEventListener('click', () => {
          this.showMainInterface();
        });
      }
    }, 100);
  }

  async loadSiteData() {
    if (!this.currentTab || !this.currentTab.url) {
      this.siteData = null;
      return;
    }

    try {
      const domain = this.extractDomain(this.currentTab.url);
      console.log('Loading site data for domain:', domain);
      const result = await chrome.storage.local.get([`site_${domain}`]);
      this.siteData = result[`site_${domain}`] || null;
      console.log('Loaded site data:', this.siteData);
      
      // If no cached data, trigger a fresh analysis
      if (!this.siteData) {
        console.log('No cached data found, triggering fresh analysis...');
        // Don't await here to avoid infinite loop
        this.recheckSite();
      }
    } catch (error) {
      console.error('Error loading site data:', error);
      this.siteData = null;
    }
  }

  updateUI() {
    const siteUrlEl = document.getElementById('siteUrl');
    const statusIndicatorEl = document.getElementById('statusIndicator');
    const statusTextEl = document.getElementById('statusText');
    const confidenceScoreEl = document.getElementById('confidenceScore');

    if (!this.currentTab || !this.currentTab.url) {
      siteUrlEl.textContent = 'No active tab';
      statusTextEl.textContent = 'Unknown';
      statusIndicatorEl.className = 'status-indicator unknown';
      return;
    }

    const domain = this.extractDomain(this.currentTab.url);
    siteUrlEl.textContent = domain;

    if (!this.siteData) {
      statusTextEl.textContent = 'Click "Recheck Site" to analyze';
      statusIndicatorEl.className = 'status-indicator unknown';
      confidenceScoreEl.textContent = '';
      return;
    }

    // Update status based on analysis
    console.log('🎨 Updating UI with site data:', this.siteData);
    if (this.siteData.isUnsafe) {
      if (this.siteData.classification === 'government') {
        statusTextEl.textContent = 'Government Website - PII Protection Active';
        statusIndicatorEl.className = 'status-indicator government';
      } else {
        statusTextEl.textContent = 'Unsafe Website - PII Protection Active';
        statusIndicatorEl.className = 'status-indicator unsafe';
      }
    } else {
      statusTextEl.textContent = 'Safe Website';
      statusIndicatorEl.className = 'status-indicator safe';
    }

    // Show confidence score
    if (this.siteData.confidence !== undefined) {
      const confidence = Math.round(this.siteData.confidence * 100);
      confidenceScoreEl.textContent = `Confidence: ${confidence}%`;
    }

    // Update details
    this.updateDetails();
  }

  updateDetails() {
    if (!this.currentTab || !this.siteData) return;

    const domain = this.extractDomain(this.currentTab.url);
    
    document.getElementById('detailDomain').textContent = domain;
    document.getElementById('detailSSL').textContent = this.currentTab.url.startsWith('https://') ? 'Yes' : 'No';
    document.getElementById('detailKeywords').textContent = this.hasGovernmentKeywords(domain) ? 'Yes' : 'No';
    
    if (this.siteData.timestamp) {
      const date = new Date(this.siteData.timestamp);
      document.getElementById('detailTimestamp').textContent = date.toLocaleString();
    }
  }

  async recheckSite() {
    if (!this.currentTab) return;

    const recheckBtn = document.getElementById('recheck');
    const originalText = recheckBtn.textContent;
    
    recheckBtn.textContent = 'Checking...';
    recheckBtn.disabled = true;

    try {
      console.log('Sending recheck request for:', this.currentTab.url);
      // Send message to background script to recheck
      const response = await chrome.runtime.sendMessage({
        action: 'checkWebsite',
        url: this.currentTab.url,
        tabId: this.currentTab.id
      });
      
      console.log('Recheck response:', response);

      // Wait a moment for the check to complete
      setTimeout(async () => {
        console.log('⏱️ Waiting period complete, reloading site data...');
        await this.loadSiteData();
        console.log('🔄 Site data reloaded, updating UI...');
        this.updateUI();
        recheckBtn.textContent = originalText;
        recheckBtn.disabled = false;
      }, 3000); // Increased wait time

    } catch (error) {
      console.error('Error rechecking site:', error);
      recheckBtn.textContent = originalText;
      recheckBtn.disabled = false;
    }
  }

  toggleDetails() {
    const detailsEl = document.getElementById('details');
    const toggleBtn = document.getElementById('toggleDetails');
    
    if (detailsEl.style.display === 'none') {
      detailsEl.style.display = 'block';
      toggleBtn.textContent = 'Hide Details';
    } else {
      detailsEl.style.display = 'none';
      toggleBtn.textContent = 'Show Details';
    }
  }

  async loadStats() {
    try {
      const result = await chrome.storage.local.get(['dailyStats']);
      const stats = result.dailyStats || { sitesChecked: 0, date: new Date().toDateString() };
      
      // Reset stats if it's a new day
      const today = new Date().toDateString();
      if (stats.date !== today) {
        stats.sitesChecked = 0;
        stats.date = today;
        await chrome.storage.local.set({ dailyStats: stats });
      }
      
      document.getElementById('sitesChecked').textContent = stats.sitesChecked;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  openSettings() {
    // Open extension options page
    chrome.runtime.openOptionsPage();
  }

  openHelp() {
    // Open help documentation
    chrome.tabs.create({
      url: 'https://github.com/your-repo/government-website-detector#help'
    });
  }

  openDocumentMasking() {
    // Hide main interface and show masking interface
    this.showMaskingInterface();
  }

  showMainInterface() {
    document.getElementById('maskingInterface').style.display = 'none';
    document.getElementById('panMaskingInterface').style.display = 'none';
    
    // Show all main interface elements
    const mainElements = document.querySelectorAll('.popup-container > *:not(#maskingInterface):not(#panMaskingInterface)');
    mainElements.forEach(element => {
      element.style.display = 'block';
    });
    
    // Reset any file selection
    if (typeof clearFile === 'function') {
      clearFile();
    }
    if (typeof clearPanFile === 'function') {
      clearPanFile();
    }
  }

  showMaskingInterface() {
    console.log('Showing masking interface...');
    
    // Hide all main interface elements except maskingInterface
    const mainElements = document.querySelectorAll('.popup-container > *:not(#maskingInterface):not(#panMaskingInterface)');
    console.log('Found main elements to hide:', mainElements.length);
    
    mainElements.forEach(element => {
      element.style.display = 'none';
    });
    
    document.getElementById('panMaskingInterface').style.display = 'none';
    
    const maskingInterface = document.getElementById('maskingInterface');
    console.log('Masking interface element found:', !!maskingInterface);
    
    if (maskingInterface) {
      maskingInterface.style.display = 'block';
      console.log('Masking interface displayed');
    }
    
    // Initialize document masking after interface is visible
    setTimeout(() => {
      console.log('Initializing document masking...');
      if (!this.documentMasking) {
        this.documentMasking = new DocumentMaskingInline();
      }
    }, 100);
  }

  showPanMaskingInterface() {
    console.log('Showing PAN masking interface...');
    
    // Hide all main interface elements except panMaskingInterface
    const mainElements = document.querySelectorAll('.popup-container > *:not(#maskingInterface):not(#panMaskingInterface)');
    console.log('Found main elements to hide:', mainElements.length);
    
    mainElements.forEach(element => {
      element.style.display = 'none';
    });
    
    document.getElementById('maskingInterface').style.display = 'none';
    
    const panMaskingInterface = document.getElementById('panMaskingInterface');
    console.log('PAN masking interface element found:', !!panMaskingInterface);
    
    if (panMaskingInterface) {
      panMaskingInterface.style.display = 'block';
      console.log('PAN masking interface displayed');
    }
    
    // Initialize PAN masking after interface is visible
    setTimeout(() => {
      console.log('Initializing PAN masking...');
      if (!this.panMasking) {
        this.panMasking = new PanMaskingInline();
      }
    }, 100);
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }

  hasGovernmentKeywords(domain) {
    const govKeywords = [
      'gov', 'government', 'ministry', 'department', 'bureau',
      'agency', 'administration', 'commission', 'authority'
    ];
    
    return govKeywords.some(keyword => 
      domain.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

// Inline Document Masking Class
class DocumentMaskingInline {
  constructor() {
    this.selectedFile = null;
    this.apiEndpoint = 'http://127.0.0.1:5000';  // Unified server
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkServerStatus();
  }

  setupEventListeners() {
    console.log('Setting up document masking event listeners...');
    
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const processBtn = document.getElementById('processBtn');
    const downloadBtn = document.getElementById('downloadBtn');

    console.log('Elements found:', {
      uploadArea: !!uploadArea,
      fileInput: !!fileInput, 
      processBtn: !!processBtn,
      downloadBtn: !!downloadBtn
    });

    if (!uploadArea || !fileInput || !processBtn) {
      console.error('Required elements not found for document masking');
      return;
    }

    // File upload events
    uploadArea.addEventListener('click', () => {
      console.log('Upload area clicked');
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      console.log('File selected:', e.target.files[0]);
      this.handleFileSelect(e.target.files[0]);
    });

    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.8)';
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.5)';
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.5)';
      this.handleFileSelect(e.dataTransfer.files[0]);
    });

    // Process button
    processBtn.addEventListener('click', () => this.processDocument());

    // Download button
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadMaskedDocument());
    }
  }

  async checkServerStatus() {
    console.log('Checking document masking server status...');
    try {
      const response = await fetch(`${this.apiEndpoint}/health`, { 
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Server responded with status: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Document masking server health:', result);
      
    } catch (error) {
      console.error('Document masking server error:', error);
      this.showError('Cannot connect to unified server at localhost:5000. Please ensure the server is running.');
    }
  }

  handleFileSelect(file) {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      this.showError('Invalid file type. Please select JPG, PNG, or PDF files only.');
      return;
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showError('File too large. Please select a file smaller than 10MB.');
      return;
    }

    this.selectedFile = file;
    this.displaySelectedFile(file);
    document.getElementById('processBtn').disabled = false;
  }

  displaySelectedFile(file) {
    const selectedFileDiv = document.getElementById('selectedFile');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');

    fileName.textContent = file.name;
    fileSize.textContent = this.formatFileSize(file.size);
    selectedFileDiv.style.display = 'block';
    document.getElementById('uploadArea').style.display = 'none';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async processDocument() {
    if (!this.selectedFile) {
      console.error('No file selected for processing');
      return;
    }

    console.log('Processing document:', this.selectedFile.name);

    const processBtn = document.getElementById('processBtn');
    const progress = document.getElementById('progress');
    const progressBar = document.getElementById('progressBar');

    processBtn.disabled = true;
    processBtn.textContent = '🔄 Processing...';
    progress.style.display = 'block';

    // Animate progress
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      progressValue += 5;
      progressBar.style.width = progressValue + '%';
      if (progressValue >= 90) clearInterval(progressInterval);
    }, 100);

    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      console.log('Sending request to:', `${this.apiEndpoint}/mask-document`);

      const response = await fetch(`${this.apiEndpoint}/mask-document`, {
        method: 'POST',
        body: formData
      });

      console.log('Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Processing result:', result);

      clearInterval(progressInterval);
      progressBar.style.width = '100%';
      
      setTimeout(() => {
        progress.style.display = 'none';
        progressBar.style.width = '0%';
        
        if (result.success) {
          this.showSuccess(result);
        } else {
          this.showError(result.error || 'Processing failed');
        }
        
        processBtn.disabled = false;
        processBtn.textContent = '🛡️ Mask PII Data';
      }, 500);

    } catch (error) {
      console.error('Document processing error:', error);
      clearInterval(progressInterval);
      progress.style.display = 'none';
      this.showError('Network error: ' + error.message);
      processBtn.disabled = false;
      processBtn.textContent = '🛡️ Mask PII Data';
    }
  }

  showSuccess(result) {
    const resultDiv = document.getElementById('result');
    const resultMessage = document.getElementById('resultMessage');
    const downloadBtn = document.getElementById('downloadBtn');

    resultMessage.innerHTML = `
      <div style="font-weight: bold; color: #4CAF50; margin-bottom: 8px;">
        ✅ ${result.message}
      </div>
      <div style="font-size: 11px; opacity: 0.9;">
        📊 PII Regions: ${result.detections} | 📄 File: ${result.output_file}
      </div>
    `;

    resultDiv.style.display = 'block';
    resultDiv.style.borderLeft = '3px solid #4CAF50';
    downloadBtn.style.display = 'block';
    downloadBtn.setAttribute('data-filename', result.output_file);
  }

  showError(message) {
    const resultDiv = document.getElementById('result');
    const resultMessage = document.getElementById('resultMessage');
    const downloadBtn = document.getElementById('downloadBtn');

    resultMessage.innerHTML = `
      <div style="font-weight: bold; color: #f44336; margin-bottom: 5px;">❌ Error</div>
      <div style="font-size: 11px;">${message}</div>
    `;

    resultDiv.style.display = 'block';
    resultDiv.style.borderLeft = '3px solid #f44336';
    downloadBtn.style.display = 'none';
  }

  async downloadMaskedDocument() {
    const downloadBtn = document.getElementById('downloadBtn');
    const filename = downloadBtn.getAttribute('data-filename');

    if (!filename) {
      this.showError('No file available for download');
      return;
    }

    try {
      downloadBtn.textContent = '⏳ Downloading...';
      downloadBtn.disabled = true;

      const response = await fetch(`${this.apiEndpoint}/download/${filename}`);
      
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      downloadBtn.textContent = '✅ Downloaded';
      setTimeout(() => {
        downloadBtn.textContent = '📥 Download Masked Document';
        downloadBtn.disabled = false;
      }, 2000);

    } catch (error) {
      this.showError('Download failed: ' + error.message);
      downloadBtn.textContent = '📥 Download Masked Document';
      downloadBtn.disabled = false;
    }
  }
}

// Inline PAN Card Masking Class
class PanMaskingInline {
  constructor() {
    this.selectedFile = null;
    this.apiEndpoint = 'http://127.0.0.1:5000';  // Unified server
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.checkServerStatus();
  }

  setupEventListeners() {
    console.log('Setting up PAN masking event listeners...');
    
    const uploadArea = document.getElementById('panUploadArea');
    const fileInput = document.getElementById('panFileInput');
    const processBtn = document.getElementById('panProcessBtn');
    const downloadBtn = document.getElementById('panDownloadBtn');

    console.log('PAN Elements found:', {
      uploadArea: !!uploadArea,
      fileInput: !!fileInput, 
      processBtn: !!processBtn,
      downloadBtn: !!downloadBtn
    });

    if (!uploadArea || !fileInput || !processBtn) {
      console.error('Required elements not found for PAN masking');
      return;
    }

    // File upload events
    uploadArea.addEventListener('click', () => {
      console.log('PAN Upload area clicked');
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      this.handleFileSelect(e.target.files[0]);
    });

    // Drag and drop events
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.style.backgroundColor = 'rgba(231, 76, 60, 0.1)';
    });

    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      uploadArea.style.backgroundColor = 'transparent';
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.style.backgroundColor = 'transparent';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.handleFileSelect(files[0]);
      }
    });

    // Process button
    processBtn.addEventListener('click', () => this.processDocument());

    // Download button
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => this.downloadResult());
    }
  }

  async checkServerStatus() {
    try {
      const response = await fetch(`${this.apiEndpoint}/health`);
      const result = await response.json();
      console.log('PAN Masking Server status:', result);
    } catch (error) {
      console.warn('Unified Server not available:', error);
      this.showError('Unified Server not available. Please start the server first.');
    }
  }

  handleFileSelect(file) {
    if (!file) return;

    console.log('PAN File selected:', file);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      this.showError('Invalid file type. Please upload JPG, PNG, or PDF files only.');
      return;
    }

    // Validate file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showError('File too large. Maximum size is 10MB.');
      return;
    }

    this.selectedFile = file;

    // Update UI
    document.getElementById('panUploadArea').style.display = 'none';
    document.getElementById('panSelectedFile').style.display = 'block';
    document.getElementById('panFileName').textContent = file.name;
    document.getElementById('panFileSize').textContent = this.formatFileSize(file.size);
    document.getElementById('panProcessBtn').disabled = false;
    document.getElementById('panResult').style.display = 'none';
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async processDocument() {
    if (!this.selectedFile) {
      console.error('No file selected for PAN processing');
      return;
    }

    console.log('Processing PAN document:', this.selectedFile.name);

    const processBtn = document.getElementById('panProcessBtn');
    const progress = document.getElementById('panProgress');
    const progressBar = document.getElementById('panProgressBar');

    processBtn.disabled = true;
    processBtn.textContent = '🔄 Processing PAN Card...';
    progress.style.display = 'block';

    // Animate progress
    let progressValue = 0;
    const progressInterval = setInterval(() => {
      progressValue += 5;
      progressBar.style.width = progressValue + '%';
      if (progressValue >= 90) clearInterval(progressInterval);
    }, 100);

    try {
      const formData = new FormData();
      formData.append('file', this.selectedFile);

      console.log('Sending PAN request to:', `${this.apiEndpoint}/mask-pan`);

      const response = await fetch(`${this.apiEndpoint}/mask-pan`, {
        method: 'POST',
        body: formData
      });

      console.log('PAN Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('PAN Processing result:', result);

      clearInterval(progressInterval);
      progressBar.style.width = '100%';
      
      setTimeout(() => {
        progress.style.display = 'none';
        progressBar.style.width = '0%';
        
        if (result.success) {
          this.showResult(result);
        } else {
          this.showError(result.message || 'Processing failed');
        }
        
        processBtn.disabled = false;
        processBtn.textContent = '💳 Mask PAN Card Data';
      }, 500);

    } catch (error) {
      clearInterval(progressInterval);
      console.error('PAN Processing error:', error);
      
      progress.style.display = 'none';
      progressBar.style.width = '0%';
      processBtn.disabled = false;
      processBtn.textContent = '💳 Mask PAN Card Data';
      
      this.showError('Processing failed: ' + error.message);
    }
  }

  showResult(result) {
    const resultDiv = document.getElementById('panResult');
    const resultMessage = document.getElementById('panResultMessage');
    const downloadBtn = document.getElementById('panDownloadBtn');

    resultMessage.innerHTML = `
      <div style="color: #4CAF50; font-weight: bold; margin-bottom: 8px;">✅ PAN Card Processing Complete!</div>
      <div style="margin-bottom: 5px;"><strong>Detections:</strong> ${result.detections} PII regions found and masked</div>
      <div style="margin-bottom: 5px;"><strong>Output:</strong> ${result.output_file}</div>
      <div style="font-size: 10px; opacity: 0.8;">${result.message}</div>
    `;

    if (result.download_url) {
      downloadBtn.style.display = 'block';
      downloadBtn.dataset.downloadUrl = result.download_url;
      downloadBtn.dataset.filename = result.output_file;
    }

    resultDiv.style.display = 'block';
  }

  showError(message) {
    const resultDiv = document.getElementById('panResult');
    const resultMessage = document.getElementById('panResultMessage');
    const downloadBtn = document.getElementById('panDownloadBtn');

    resultMessage.innerHTML = `
      <div style="color: #f44336; font-weight: bold; margin-bottom: 8px;">❌ Error</div>
      <div style="font-size: 11px;">${message}</div>
    `;

    downloadBtn.style.display = 'none';
    resultDiv.style.display = 'block';
  }

  async downloadResult() {
    const downloadBtn = document.getElementById('panDownloadBtn');
    const downloadUrl = downloadBtn.dataset.downloadUrl;
    const filename = downloadBtn.dataset.filename;

    if (!downloadUrl) {
      this.showError('No file available for download');
      return;
    }

    try {
      downloadBtn.disabled = true;
      downloadBtn.textContent = '📥 Downloading...';

      const response = await fetch(`${this.apiEndpoint}${downloadUrl}`);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      downloadBtn.textContent = '✅ Downloaded';
      setTimeout(() => {
        downloadBtn.textContent = '📥 Download Masked PAN Document';
        downloadBtn.disabled = false;
      }, 2000);

    } catch (error) {
      this.showError('Download failed: ' + error.message);
      downloadBtn.textContent = '📥 Download Masked PAN Document';
      downloadBtn.disabled = false;
    }
  }
}

// Clear PAN file function
function clearPanFile() {
  document.getElementById('panSelectedFile').style.display = 'none';
  document.getElementById('panUploadArea').style.display = 'block';
  document.getElementById('panProcessBtn').disabled = true;
  document.getElementById('panResult').style.display = 'none';
  document.getElementById('panFileInput').value = '';
}

// Clear file function
function clearFile() {
  document.getElementById('selectedFile').style.display = 'none';
  document.getElementById('uploadArea').style.display = 'block';
  document.getElementById('processBtn').disabled = true;
  document.getElementById('result').style.display = 'none';
  document.getElementById('fileInput').value = '';
}
