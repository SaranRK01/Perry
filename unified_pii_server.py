#!/usr/bin/env python3
"""
Unified PII Protection Server

This combines three servers into one:
1. ML API Server (Government Website Detection) - Port 5000
2. Aadhar Masking Server - Port 8080  
3. PAN Masking Server - Port 5001

All running on different endpoints of the same server (Port 5000)
"""

import subprocess
import sys
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import cv2
import fitz  # PyMuPDF
from PIL import Image
import numpy as np
import io
import base64
from werkzeug.utils import secure_filename
import tempfile
import joblib
import logging

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
    packages = [
        'flask', 'flask-cors', 'joblib', 'scikit-learn', 'numpy', 
        'opencv-python', 'ultralytics', 'pymupdf', 'pillow'
    ]
    
    print("🔧 Checking dependencies...")
    failed = []
    
    for package in packages:
        if not install_if_missing(package):
            failed.append(package)
    
    if failed:
        print(f"❌ Failed to install: {', '.join(failed)}")
        print("💡 Please run manually: pip install " + " ".join(failed))
        return False
    
    print("✅ All dependencies ready!")
    return True

# Setup dependencies
if not setup_dependencies():
    input("Press Enter to exit...")
    sys.exit(1)

# Flask app setup
app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# =================================
# GLOBAL CONFIGURATION
# =================================

# ML Model variables
vectorizer = None
ml_model = None

# YOLO Model variables
aadhar_model = None
pan_model = None

# Model paths
AADHAR_MODEL_PATH = r"D:\Ideathon\perry 3\runs\detect\train25\weights\best.pt"
PAN_MODEL_PATH = r"D:\Ideathon\pan\runs\detect\train2\weights\best.pt"

# File handling
UPLOAD_FOLDER = 'temp_uploads'
RESULTS_FOLDER = 'masked_results'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

# =================================
# ML MODEL FUNCTIONS (Government Detection)
# =================================

def load_ml_models():
    """Load the ML model and vectorizer for government website detection"""
    global vectorizer, ml_model
    
    models_dir = Path(__file__).resolve().parents[1] / "models"
    vectorizer_path = models_dir / "vectorizer.joblib"
    model_path = models_dir / "model.joblib"
    
    try:
        vectorizer = joblib.load(vectorizer_path)
        ml_model = joblib.load(model_path)
        print("✅ ML Government detection models loaded successfully!")
        return True
    except Exception as e:
        print(f"⚠️ Warning: Could not load ML models: {e}")
        return False

def classify_url(url: str) -> dict:
    """Classify URL using trained model"""
    try:
        if not ml_model or not vectorizer:
            return {
                "isGovernment": False,
                "confidence": 0.0,
                "isUnsafe": True,
                "reason": "ML model not loaded"
            }
        
        # Transform and predict
        X_new = vectorizer.transform([url])
        prediction = ml_model.predict(X_new)[0]
        
        # Get confidence score
        confidence = 0.8  # Default
        try:
            if hasattr(ml_model, 'predict_proba'):
                proba = ml_model.predict_proba(X_new)[0]
                confidence = max(proba)
        except:
            pass
        
        # Interpret prediction
        pred_str = str(prediction).lower()
        
        is_government = (
            'government' in pred_str or 
            'authorized' in pred_str or
            'gov' in pred_str or 
            'legitimate' in pred_str
        )
        
        is_unsafe = not is_government
        
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

# =================================
# YOLO MODEL FUNCTIONS (Document Masking)
# =================================

def load_aadhar_model():
    """Load YOLO model for Aadhar detection"""
    global aadhar_model
    if aadhar_model is None:
        try:
            from ultralytics import YOLO
            aadhar_model = YOLO(AADHAR_MODEL_PATH)
            print(f"✅ Aadhar YOLO model loaded successfully from {AADHAR_MODEL_PATH}")
        except Exception as e:
            print(f"⚠️ Warning: Could not load Aadhar YOLO model: {e}")
            raise e
    return aadhar_model

def load_pan_model():
    """Load YOLO model for PAN detection"""
    global pan_model
    if pan_model is None:
        try:
            from ultralytics import YOLO
            pan_model = YOLO(PAN_MODEL_PATH)
            print(f"✅ PAN YOLO model loaded successfully from {PAN_MODEL_PATH}")
        except Exception as e:
            print(f"⚠️ Warning: Could not load PAN YOLO model: {e}")
            raise e
    return pan_model

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def process_pdf_to_images(pdf_path):
    """Convert PDF pages to images"""
    doc = fitz.open(pdf_path)
    images = []
    
    for page_num in range(len(doc)):
        page = doc.load_page(page_num)
        mat = fitz.Matrix(2.0, 2.0)
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("ppm")
        img = Image.open(io.BytesIO(img_data))
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        images.append(img_cv)
    
    doc.close()
    return images

def images_to_pdf(images, output_path):
    """Convert images to PDF"""
    pdf_images = []
    for img in images:
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)
        pdf_images.append(pil_img)
    
    if pdf_images:
        pdf_images[0].save(output_path, save_all=True, append_images=pdf_images[1:])

def mask_pii_in_image(img, model_type='aadhar'):
    """Detect and mask PII data in image"""
    try:
        if model_type == 'aadhar':
            model = load_aadhar_model()
            doc_type = "Aadhar"
        else:
            model = load_pan_model()
            doc_type = "PAN"
        
        # Run YOLO prediction
        results = model(img, save=False, conf=0.5)
        
        # Process detections with masking
        masked_img = img.copy()
        detection_count = 0
        
        for r in results:
            if r.boxes is not None and len(r.boxes) > 0:
                boxes = r.boxes.xyxy.cpu().numpy()
                confs = r.boxes.conf.cpu().numpy()
                clss = r.boxes.cls.cpu().numpy()
                
                for box, conf, cls in zip(boxes, confs, clss):
                    x1, y1, x2, y2 = map(int, box)
                    
                    # Ensure coordinates are within image bounds
                    x1 = max(0, x1)
                    y1 = max(0, y1)
                    x2 = min(img.shape[1], x2)
                    y2 = min(img.shape[0], y2)
                    
                    if x2 > x1 and y2 > y1:
                        # Extract ROI
                        roi = masked_img[y1:y2, x1:x2]
                        
                        if roi.size > 0:
                            # Apply Gaussian blur masking
                            masked_roi = cv2.GaussianBlur(roi, (51, 51), 30)
                            
                            # Replace ROI with masked version
                            masked_img[y1:y2, x1:x2] = masked_roi
                            detection_count += 1
                            
                            print(f"🔒 {doc_type} PII masked at coordinates: ({x1}, {y1}) to ({x2}, {y2})")
        
        print(f"✅ {doc_type} masking complete! {detection_count} regions masked")
        return masked_img, detection_count
        
    except Exception as e:
        print(f"❌ Error in {model_type} masking: {e}")
        return img, 0

# =================================
# API ENDPOINTS
# =================================

# Health check endpoint
@app.route('/health')
def health():
    """Universal health check endpoint"""
    return jsonify({
        "status": "running",
        "services": {
            "ml_model_loaded": bool(ml_model and vectorizer),
            "aadhar_model_available": os.path.exists(AADHAR_MODEL_PATH),
            "pan_model_available": os.path.exists(PAN_MODEL_PATH)
        },
        "endpoints": {
            "government_detection": "/analyze",
            "aadhar_masking": "/mask-document", 
            "pan_masking": "/mask-pan",
            "download": "/download/<filename>"
        }
    })

# ========== ML API ENDPOINTS ==========

@app.route('/analyze', methods=['POST'])
def analyze():
    """Government website detection endpoint"""
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

@app.route('/test')
def test():
    """Test endpoint for government detection"""
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
        print(f"🧪 TEST: {url} -> {result['classification']}")
    return jsonify(results)

# ========== AADHAR MASKING ENDPOINTS ==========

@app.route('/mask-document', methods=['POST'])
def mask_aadhar_document():
    """Aadhar card masking endpoint"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Only PNG, JPG, JPEG, PDF allowed'}), 400
        
        # Save uploaded file
        filename = secure_filename(file.filename)
        input_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(input_path)
        
        # Determine file type
        is_pdf = filename.lower().endswith('.pdf')
        base_name = os.path.splitext(filename)[0]
        
        total_detections = 0
        
        if is_pdf:
            # Process PDF
            images = process_pdf_to_images(input_path)
            masked_images = []
            
            for i, img in enumerate(images):
                masked_img, detections = mask_pii_in_image(img, 'aadhar')
                masked_images.append(masked_img)
                total_detections += detections
            
            # Save as PDF
            output_path = os.path.join(RESULTS_FOLDER, f"{base_name}_aadhar_masked.pdf")
            images_to_pdf(masked_images, output_path)
            
        else:
            # Process image
            img = cv2.imread(input_path)
            if img is None:
                return jsonify({'error': 'Could not read image file'}), 400
            
            masked_img, total_detections = mask_pii_in_image(img, 'aadhar')
            
            # Save as image
            output_path = os.path.join(RESULTS_FOLDER, f"{base_name}_aadhar_masked.jpg")
            cv2.imwrite(output_path, masked_img)
        
        # Clean up input file
        os.remove(input_path)
        
        return jsonify({
            'success': True,
            'message': f'Aadhar card masked successfully! {total_detections} PII regions detected and masked.',
            'detections': total_detections,
            'output_file': os.path.basename(output_path),
            'download_url': f'/download/{os.path.basename(output_path)}'
        })
        
    except Exception as e:
        print(f"❌ Error processing Aadhar document: {e}")
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

# ========== PAN MASKING ENDPOINTS ==========

@app.route('/mask-pan', methods=['POST'])
def mask_pan_document():
    """PAN card masking endpoint"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file uploaded'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Only PNG, JPG, JPEG, PDF allowed'}), 400
        
        # Save uploaded file
        filename = secure_filename(file.filename)
        input_path = os.path.join(UPLOAD_FOLDER, filename)
        file.save(input_path)
        
        # Determine file type
        is_pdf = filename.lower().endswith('.pdf')
        base_name = os.path.splitext(filename)[0]
        
        total_detections = 0
        
        if is_pdf:
            # Process PDF
            images = process_pdf_to_images(input_path)
            masked_images = []
            
            for i, img in enumerate(images):
                masked_img, detections = mask_pii_in_image(img, 'pan')
                masked_images.append(masked_img)
                total_detections += detections
            
            # Save as PDF
            output_path = os.path.join(RESULTS_FOLDER, f"{base_name}_pan_masked.pdf")
            images_to_pdf(masked_images, output_path)
            
        else:
            # Process image
            img = cv2.imread(input_path)
            if img is None:
                return jsonify({'error': 'Could not read image file'}), 400
            
            masked_img, total_detections = mask_pii_in_image(img, 'pan')
            
            # Save as image
            output_path = os.path.join(RESULTS_FOLDER, f"{base_name}_pan_masked.jpg")
            cv2.imwrite(output_path, masked_img)
        
        # Clean up input file
        os.remove(input_path)
        
        return jsonify({
            'success': True,
            'message': f'PAN card masked successfully! {total_detections} PII regions detected and masked.',
            'detections': total_detections,
            'output_file': os.path.basename(output_path),
            'download_url': f'/download/{os.path.basename(output_path)}'
        })
        
    except Exception as e:
        print(f"❌ Error processing PAN document: {e}")
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

# ========== DOWNLOAD ENDPOINT ==========

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    """Universal download endpoint for masked files"""
    try:
        file_path = os.path.join(RESULTS_FOLDER, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'Download failed: {str(e)}'}), 500

# =================================
# MAIN FUNCTION
# =================================

def main():
    """Start the unified server"""
    print("🚀 UNIFIED PII PROTECTION SERVER")
    print("=" * 50)
    print("📊 Government Website Detection")
    print("🆔 Aadhar Card PII Masking") 
    print("💳 PAN Card PII Masking")
    print("=" * 50)
    
    # Load ML models for government detection
    print("📊 Loading ML models for government detection...")
    load_ml_models()
    
    # Check YOLO model files
    print("🤖 Checking YOLO model files...")
    if os.path.exists(AADHAR_MODEL_PATH):
        print(f"✅ Aadhar model found: {AADHAR_MODEL_PATH}")
    else:
        print(f"⚠️ Aadhar model not found: {AADHAR_MODEL_PATH}")
        
    if os.path.exists(PAN_MODEL_PATH):
        print(f"✅ PAN model found: {PAN_MODEL_PATH}")
    else:
        print(f"⚠️ PAN model not found: {PAN_MODEL_PATH}")
    
    print("📁 Upload folder:", UPLOAD_FOLDER)
    print("📁 Results folder:", RESULTS_FOLDER)
    print()
    print("🌐 Server will run on: http://localhost:5000")
    print("📍 Available endpoints:")
    print("   • Government Detection: /analyze")
    print("   • Aadhar Masking: /mask-document")
    print("   • PAN Masking: /mask-pan")
    print("   • Download Files: /download/<filename>")
    print("   • Health Check: /health")
    print("   • Test: /test")
    print()
    print("🔧 Update extension endpoints to:")
    print("   • ML API: http://localhost:5000")
    print("   • Aadhar API: http://localhost:5000")
    print("   • PAN API: http://localhost:5000")
    print()
    print("🛑 Press Ctrl+C to stop")
    print("=" * 50)
    
    try:
        app.run(host='0.0.0.0', port=5000, debug=False)
    except KeyboardInterrupt:
        print("\n🛑 Server stopped")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == '__main__':
    main()
