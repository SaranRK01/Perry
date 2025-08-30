// Direct content script popup test - bypasses background script
console.log('🧪 Direct Content Script Test Loaded');

// Function to create test popup directly
function createDirectTestPopup(mlResult = null) {
  console.log('🚨 Creating direct test popup...');
  
  // Remove any existing popup
  const existing = document.getElementById('direct-test-popup');
  if (existing) {
    existing.remove();
  }
  
  // Get ML result details for display
  const confidence = mlResult ? Math.round(mlResult.confidence * 100) : 'Unknown';
  const classification = mlResult ? mlResult.classification : 'Potentially unsafe';
  
  // Create popup element
  const popup = document.createElement('div');
  popup.id = 'direct-test-popup';
  popup.innerHTML = `
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
    ">
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
        Site: ${window.location.hostname} | Classification: ${classification} | Confidence: ${confidence}%
      </div>
      <button id="dismiss-popup-btn" style="
        padding: 6px 12px;
        background: rgba(255,255,255,0.9);
        color: #d63031;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 11px;
        width: 100%;
      ">Got it, I'll be careful</button>
    </div>
  `;
  
  // Insert into document
  if (document.body) {
    document.body.appendChild(popup);
    console.log('✅ Direct test popup created successfully');
  } else if (document.documentElement) {
    document.documentElement.appendChild(popup);
    console.log('✅ Direct test popup created on documentElement');
  } else {
    console.error('❌ No document body or documentElement found');
    return;
  }
  
  // Add click event listener for dismiss button
  const dismissBtn = popup.querySelector('#dismiss-popup-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      console.log('🗂️ Dismiss button clicked');
      popup.remove();
    });
  }
  
  // Auto-remove after 30 seconds (increased for testing)
  setTimeout(() => {
    const testPopup = document.getElementById('direct-test-popup');
    if (testPopup) {
      testPopup.remove();
      console.log('🔄 Direct test popup auto-removed after 30 seconds');
    }
  }, 30000);
}

// Function to test ML API directly from content script
async function testMLApiFromContent() {
  console.log('🔗 Testing ML API from content script...');
  
  try {
    const response = await fetch('http://localhost:5000/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: window.location.href,
        domain: window.location.hostname
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('📊 ML API Response:', result);
      console.log('📊 Is Unsafe:', result.isUnsafe);
      console.log('📊 Classification:', result.classification);
      console.log('📊 Confidence:', result.confidence);
      
      if (result.isUnsafe) {
        console.log('⚠️ Site is unsafe - showing PII protection popup');
        createDirectTestPopup(result);
      } else {
        console.log('✅ Site is safe - no popup needed');
      }
    } else {
      console.error('❌ ML API Error:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('❌ ML API Fetch Error:', error);
    console.log('❌ Could not connect to ML API - no popup shown');
  }
}

// Wait for page to load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('📄 DOM Content Loaded');
    setTimeout(() => {
      // Test on non-chrome pages only
      if (!window.location.href.startsWith('chrome://') && 
          !window.location.href.startsWith('chrome-extension://')) {
        testMLApiFromContent();
      }
    }, 1000);
  });
} else {
  console.log('📄 DOM Already Loaded');
  setTimeout(() => {
    // Test on non-chrome pages only
    if (!window.location.href.startsWith('chrome://') && 
        !window.location.href.startsWith('chrome-extension://')) {
      testMLApiFromContent();
    }
  }, 1000);
}

console.log('🚀 Direct content script test initialized');

// Make functions available globally for manual testing
window.testPopup = () => createDirectTestPopup();
window.testMLAPI = testMLApiFromContent;

console.log('🔧 Manual test functions available:');
console.log('   - window.testPopup() to show popup manually');
console.log('   - window.testMLAPI() to test ML API manually');
