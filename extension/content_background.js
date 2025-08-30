// Content script that runs on all web pages
class ContentScript {
  constructor() {
    this.init();
  }

  init() {
    // Wait for page to load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.onPageLoad());
    } else {
      this.onPageLoad();
    }
  }

  onPageLoad() {
    // Get current URL
    const currentUrl = window.location.href;
    
    // Send message to background script to check the website
    chrome.runtime.sendMessage({
      action: 'checkWebsite',
      url: currentUrl
    }, (response) => {
      if (response && response.error) {
        console.error('Error checking website:', response.error);
      }
    });

    // Listen for URL changes (for SPAs)
    this.observeUrlChanges();
  }

  observeUrlChanges() {
    let lastUrl = location.href;
    
    // Override pushState and replaceState to detect navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          contentScript.onUrlChange();
        }
      }, 100);
    };

    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          contentScript.onUrlChange();
        }
      }, 100);
    };

    // Listen for popstate (back/forward buttons)
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          contentScript.onUrlChange();
        }
      }, 100);
    });
  }

  onUrlChange() {
    // Re-check the website when URL changes
    chrome.runtime.sendMessage({
      action: 'checkWebsite',
      url: window.location.href
    });
  }

  // Helper method to extract domain features for the ML model
  extractDomainFeatures() {
    const url = window.location.href;
    const domain = window.location.hostname;
    
    return {
      domain: domain,
      url: url,
      hasSSL: url.startsWith('https://'),
      domainLength: domain.length,
      subdomainCount: domain.split('.').length - 2,
      hasCommonGovKeywords: this.hasGovernmentKeywords(domain),
      pageTitle: document.title,
      metaDescription: this.getMetaDescription(),
      hasContactInfo: this.hasContactInformation(),
      hasPrivacyPolicy: this.hasPrivacyPolicy(),
      timestamp: Date.now()
    };
  }

  hasGovernmentKeywords(domain) {
    const govKeywords = [
      'gov', 'government', 'ministry', 'department', 'bureau',
      'agency', 'administration', 'commission', 'authority',
      'parliament', 'senate', 'congress', 'municipal', 'city',
      'county', 'state', 'federal', 'national', 'public'
    ];
    
    return govKeywords.some(keyword => 
      domain.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  getMetaDescription() {
    const metaDesc = document.querySelector('meta[name="description"]');
    return metaDesc ? metaDesc.getAttribute('content') : '';
  }

  hasContactInformation() {
    const contactKeywords = ['contact', 'phone', 'email', 'address'];
    const bodyText = document.body.textContent.toLowerCase();
    
    return contactKeywords.some(keyword => bodyText.includes(keyword));
  }

  hasPrivacyPolicy() {
    const privacyLinks = document.querySelectorAll('a[href*="privacy"], a[href*="policy"]');
    return privacyLinks.length > 0;
  }
}

// Initialize content script
const contentScript = new ContentScript();
