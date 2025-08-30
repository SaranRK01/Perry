#!/usr/bin/env python3
"""
Government Website Detector ML API Server

A simple Flask server that serves your trained ML model for the browser extension.
Just run: python ml_api_server.py

This will automatically install dependencies and start the server.
"""

import subprocess
import sys
from pathlib import Path

def install_if_missing(package):
    """Install package if not already installed"""
    try:
        __import__(package.replace('-', '_'))
        return True
    except ImportError:
        try:
            print(f"📦 Installing {package}...")
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', package, '--quiet'])
            return True
        except subprocess.CalledProcessError:
            return False

def setup_dependencies():
    """Ensure all required packages are installed"""
    packages = ['flask', 'flask-cors', 'joblib', 'scikit-learn', 'numpy']
    
    print("🔧 Checking dependencies...")
    failed = []
    
    for package in packages:
        if not install_if_missing(package):
            failed.append(package)
    
    if failed:
        print(f"❌ Failed to install: {', '.join(failed)}")
        print("💡 Please run manually: pip install flask flask-cors joblib scikit-learn numpy")
        return False
    
    print("✅ All dependencies ready!")
    return True

# Setup dependencies
if not setup_dependencies():
    input("Press Enter to exit...")
    sys.exit(1)

# Import after ensuring packages are installed
from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import logging

# Setup
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model variables
vectorizer = None
model = None

def load_models():
    """Load the ML model and vectorizer"""
    global vectorizer, model
    
    models_dir = Path(__file__).resolve().parents[1] / "models"
    vectorizer_path = models_dir / "vectorizer.joblib"
    model_path = models_dir / "model.joblib"
    
    try:
        vectorizer = joblib.load(vectorizer_path)
        model = joblib.load(model_path)
        return True
    except Exception as e:
        logger.error(f"Error loading models: {e}")
        return False

def classify_url(url: str) -> dict:
    """Classify URL using your trained model"""
    try:
        if not model or not vectorizer:
            return {
                "isGovernment": False,
                "confidence": 0.0,
                "isUnsafe": True,
                "reason": "Model not loaded"
            }
        
        # Transform and predict
        X_new = vectorizer.transform([url])
        prediction = model.predict(X_new)[0]
        
        # Get confidence score
        confidence = 0.8  # Default
        try:
            if hasattr(model, 'predict_proba'):
                proba = model.predict_proba(X_new)[0]
                confidence = max(proba)
        except:
            pass
        
        # Interpret prediction (adjust based on your model's actual labels)
        pred_str = str(prediction).lower()
        
        # Check if it's a government website - updated to match your model's output
        is_government = (
            'government' in pred_str or 
            'authorized' in pred_str or
            'gov' in pred_str or 
            'legitimate' in pred_str
        )
        
        # IMPORTANT: Mark ALL non-government sites as unsafe
        # This means only government sites are considered safe
        is_unsafe = not is_government  # If not government, then unsafe
        
        # Create appropriate reason message
        if is_government:
            reason = f"✅ SAFE - Legitimate government website: {prediction}"
        else:
            reason = f"⚠️ UNSAFE - Non-government website: {prediction}"
        
        return {
            "isGovernment": is_government,
            "confidence": float(confidence),
            "isUnsafe": is_unsafe,
            "reason": reason,
            "classification": str(prediction)
        }
        
    except Exception as e:
        return {
            "isGovernment": False,
            "confidence": 0.0,
            "isUnsafe": True,
            "reason": f"Error: {str(e)}"
        }

@app.route('/analyze', methods=['POST'])
def analyze():
    """Main API endpoint for browser extension"""
    try:
        data = request.json
        url = data.get('url') or data.get('domain', '')
        
        if not url:
            return jsonify({"error": "URL required"}), 400
        
        # Ensure proper URL format
        if not url.startswith(('http://', 'https://')):
            url = f"https://{url}"
        
        logger.info(f"Analyzing: {url}")
        result = classify_url(url)
        logger.info(f"Result: {result['classification']}")
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Analysis error: {e}")
        return jsonify({
            "isGovernment": False,
            "confidence": 0.0,
            "isUnsafe": True,
            "reason": f"Server error: {str(e)}"
        }), 500

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({
        "status": "running",
        "model_loaded": bool(model and vectorizer)
    })

@app.route('/test')
def test():
    """Test endpoint with sample URLs"""
    test_urls = [
        "https://pmindia.gov.in",
        "https://google.com", 
        "https://facebook.com",
        "https://amazon.com",
        "https://github.com"
    ]
    results = {}
    for url in test_urls:
        result = classify_url(url)
        results[url] = result
        print(f"🧪 TEST: {url} -> {result['classification']} (Gov: {result['isGovernment']}, Unsafe: {result['isUnsafe']})")
    return jsonify(results)

def main():
    """Start the server"""
    print("🚀 Government Website Detector ML API")
    print("=" * 40)
    
    # Check model files
    models_dir = Path(__file__).resolve().parents[1] / "models"
    if not models_dir.exists():
        print(f"❌ Models directory not found: {models_dir}")
        print("💡 Please create the models directory and add your .joblib files")
        input("Press Enter to exit...")
        return
    
    print(f"📁 Models directory: {models_dir}")
    
    # Load models
    print("📊 Loading ML models...")
    if not load_models():
        print("❌ Failed to load models!")
        print("💡 Ensure vectorizer.joblib and model.joblib exist in the models directory")
        input("Press Enter to exit...")
        return
    
    print("✅ Models loaded successfully!")
    print("🌐 Starting server on http://localhost:5000")
    print("📝 Extension should use: http://localhost:5000/analyze")
    print("🛑 Press Ctrl+C to stop")
    print("=" * 40)
    
    try:
        app.run(host='localhost', port=5000, debug=False)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == '__main__':
    main()
