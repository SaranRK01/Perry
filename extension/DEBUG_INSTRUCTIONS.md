# Extension Debug Instructions

## 1. Reload Extension
1. Go to `chrome://extensions`
2. Find "Government Website Detector (Direct Test)"
3. Click the reload button (🔄)

## 2. Test the Extension

### Automatic Test:
1. Visit any website like `https://example.com`
2. Open Developer Tools (F12)
3. Go to Console tab
4. Look for these messages:
   - `🚀 Direct content script test initialized`
   - `🔗 Testing ML API from content script...`
   - `🧪 Showing popup for testing purposes...`
   - `✅ Direct test popup created successfully`

### Manual Test:
If automatic test doesn't work, try manual test:
1. Visit any website
2. Open Developer Tools (F12) → Console
3. Type: `window.testPopup()` and press Enter
4. You should see the popup appear on the right side

### Test Popup Dismissal:
1. When popup appears, click "Got it, I'll be careful" button
2. Check console for: `🗂️ Dismiss button clicked`
3. Popup should disappear immediately

## 3. Check ML API Connection

In browser console, type:
```javascript
window.testMLAPI()
```

Look for:
- `📊 ML API Response:` followed by the result
- `📊 Is Unsafe:` true/false
- `📊 Classification:` government/commercial/other
- `📊 Confidence:` percentage

## 4. Common Issues

### Extension Not Loading:
- Check if extension shows "Errors" in chrome://extensions
- Make sure all files are in the correct folder
- Try removing and re-adding the extension

### Popup Not Showing:
- Check browser console for error messages
- Try manual test: `window.testPopup()`
- Check if content script is loading: look for initialization message

### Button Not Working:
- Check console for "🗂️ Dismiss button clicked" when clicking
- Try clicking different parts of the button
- Check if there are any JavaScript errors

### ML API Not Working:
- Verify server is running: open http://localhost:5000/health in browser
- Check console for CORS errors
- Try manual API test: `window.testMLAPI()`

## 5. Force Show Popup (For Testing)

The current version automatically shows the popup on every page for testing purposes. This helps isolate whether the issue is:
1. Content script not loading
2. ML API not responding  
3. Popup display issues
4. Button functionality issues

Once basic popup works, we can fix the ML API integration.
