// Direct content script popup test - bypasses background script
console.log('🧪 Direct Content Script Test Loaded');

// Function to create test popup directly
function createDirectTestPopup() {
  console.log('🚨 Creating direct test popup...');
  
  // Remove any existing popup
  const existing = document.getElementById('direct-test-popup');
  if (existing) {
    existing.remove();
  }
  
  // Create popup element
  const popup = document.createElement('div');
  popup.id = 'direct-test-popup';
  popup.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      left: 20px;
      right: 20px;
      background: linear-gradient(135deg, #ff4444, #cc0000);
      color: white;
      padding: 20px;
      border-radius: 10px;
      z-index: 2147483647;
      font-family: Arial, sans-serif;
      font-size: 16px;
      font-weight: bold;
      text-align: center;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      border: 3px solid #990000;
    ">
      <div style="font-size: 24px; margin-bottom: 15px;">
        🧪 DIRECT CONTENT SCRIPT TEST 🧪
      </div>
      <div style="font-size: 18px; margin-bottom: 10px;">
        This popup is injected directly by content script
      </div>
      <div style="font-size: 14px; margin-bottom: 15px;">
        Website: ${window.location.hostname}<br>
        URL: ${window.location.href}<br>
        Time: ${new Date().toLocaleTimeString()}
      </div>
      <button onclick="document.getElementById('direct-test-popup').remove()" style="
        padding: 10px 20px;
        background: white;
        color: #cc0000;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      ">Close Test Popup</button>
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
  
  // Auto-remove after 15 seconds
  setTimeout(() => {
    const testPopup = document.getElementById('direct-test-popup');
    if (testPopup) {
      testPopup.remove();
      console.log('🔄 Direct test popup auto-removed');
    }
  }, 15000);
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
      
      if (result.isUnsafe) {
        console.log('⚠️ Site is unsafe - would show popup');
        createDirectTestPopup();
      } else {
        console.log('✅ Site is safe - no popup needed');
      }
    } else {
      console.error('❌ ML API Error:', response.status);
    }
  } catch (error) {
    console.error('❌ ML API Fetch Error:', error);
    // Show popup anyway for testing
    createDirectTestPopup();
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
