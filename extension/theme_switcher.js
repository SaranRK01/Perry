// Theme Switcher for PII Protection Extension
// Add this to test different themes easily

const themes = {
    'original': 'popup.css',
    'cyberpunk': 'popup_theme_1_cyberpunk.css', 
    'minimal': 'popup_theme_2_minimal.css',
    'neumorphism': 'popup_theme_3_neumorphism.css',
    'material': 'popup_theme_4_material.css'
};

function switchTheme(themeName) {
    const existingLink = document.querySelector('link[rel="stylesheet"]');
    if (existingLink) {
        existingLink.href = themes[themeName] || themes['original'];
    }
}

// Add theme switcher to popup for testing
function addThemeSwitcher() {
    const container = document.querySelector('.popup-container');
    if (!container) return;
    
    const themeSelector = document.createElement('div');
    themeSelector.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        z-index: 9999;
        background: rgba(0,0,0,0.8);
        padding: 10px;
        border-radius: 8px;
        font-size: 12px;
    `;
    
    const select = document.createElement('select');
    select.style.cssText = `
        background: white;
        border: none;
        padding: 5px;
        border-radius: 4px;
        font-size: 11px;
    `;
    
    Object.keys(themes).forEach(theme => {
        const option = document.createElement('option');
        option.value = theme;
        option.textContent = theme.charAt(0).toUpperCase() + theme.slice(1);
        select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
        switchTheme(e.target.value);
    });
    
    themeSelector.appendChild(select);
    document.body.appendChild(themeSelector);
}

// Initialize theme switcher when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', addThemeSwitcher);
} else {
    addThemeSwitcher();
}
