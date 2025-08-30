# Chrome Extension - Government Website Detector

## 🚀 How to Load This Extension

1. Open Chrome browser
2. Go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. **SELECT THIS FOLDER**: `d:\Ideathon\perry exe\extension`
6. Click "Select Folder"

## ⚠️ Important Notes

- **DO NOT** load from the parent directory (`d:\Ideathon\perry exe`) 
- **REASON**: Chrome refuses folders containing `__pycache__` or other non-extension files
- **USE ONLY**: This clean `extension` subfolder

## 🔧 Prerequisites

1. **ML API Server Must Be Running**:
   ```
   cd "d:\Ideathon\perry exe"
   python ml_api_server.py
   ```
   
2. **Verify API Connection**:
   - Open `http://localhost:5000/health` in browser
   - Should show: `{"status": "running", "model_loaded": true}`

## 🧪 Testing

After loading the extension:

1. **Visit a Government Site**: 
   - Go to `https://pmindia.gov.in`
   - Should show blue "GOV" badge, no warning popup
   
2. **Visit a Non-Government Site**:
   - Go to `https://google.com`
   - Should show red warning popup with "SECURITY WARNING"
   - Badge shows "⚠" symbol

## 🛠️ Troubleshooting

1. **Check Extension Console**:
   - Go to `chrome://extensions/`
   - Click "service worker" under the extension
   - Look for API connection logs

2. **Verify Settings**:
   - Click extension icon → popup should open
   - Go to options/settings
   - Ensure API endpoint is `http://localhost:5000/analyze`

## 📁 Extension Files

- `manifest.json` - Extension configuration  
- `background.js` - Service worker (main logic)
- `content.js` - Injected into web pages
- `popup.html/js/css` - Extension popup UI
- `options.html/js` - Settings page
