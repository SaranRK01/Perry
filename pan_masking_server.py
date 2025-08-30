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

app = Flask(__name__)
CORS(app)

# Initialize YOLO model for PAN card detection
model = None
# Update this path to your PAN card YOLO model
MODEL_PATH = r"D:\Ideathon\pan\runs\detect\train2\weights\best.pt"

UPLOAD_FOLDER = 'temp_uploads'
RESULTS_FOLDER = 'masked_results'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'pdf'}

def load_model():
    """Load YOLO model when needed"""
    global model
    if model is None:
        try:
            from ultralytics import YOLO
            model = YOLO(MODEL_PATH)
            print(f"✅ PAN Card YOLO model loaded successfully from {MODEL_PATH}")
        except Exception as e:
            print(f"❌ Error loading PAN Card YOLO model: {e}")
            raise e
    return model

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

def mask_pan_in_image(img):
    """Detect and mask PAN card data in image"""
    try:
        model = load_model()
        
        # Run YOLO prediction
        results = model(img, save=False, conf=0.5)
        
        # Process detections with masking
        masked_img = img.copy()
        detection_count = 0
        
        for r in results:
            if r.boxes is not None and len(r.boxes) > 0:
                boxes = r.boxes.xyxy.cpu().numpy()  # bounding boxes (x1, y1, x2, y2)
                confs = r.boxes.conf.cpu().numpy()  # confidence scores
                clss = r.boxes.cls.cpu().numpy()    # class IDs
                
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
                            
                            # Alternative: Black box masking (uncomment if preferred)
                            # masked_roi = np.zeros_like(roi)
                            
                            # Replace ROI with masked version
                            masked_img[y1:y2, x1:x2] = masked_roi
                            detection_count += 1
                            
                            print(f"🔒 PAN data masked at coordinates: ({x1}, {y1}) to ({x2}, {y2})")
        
        print(f"✅ PAN masking complete! {detection_count} regions masked")
        return masked_img, detection_count
        
    except Exception as e:
        print(f"❌ Error in PAN masking: {e}")
        return img, 0

@app.route('/health', methods=['GET'])
def health_check():
    try:
        # Test model loading
        load_model()
        return jsonify({
            'status': 'healthy',
            'service': 'PAN Card Masking Server',
            'model_loaded': model is not None,
            'model_path': MODEL_PATH
        })
    except Exception as e:
        return jsonify({
            'status': 'unhealthy',
            'service': 'PAN Card Masking Server',
            'error': str(e)
        }), 500

@app.route('/mask-pan', methods=['POST'])
def mask_pan_document():
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
                masked_img, detections = mask_pan_in_image(img)
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
            
            masked_img, total_detections = mask_pan_in_image(img)
            
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

@app.route('/download/<filename>', methods=['GET'])
def download_file(filename):
    try:
        file_path = os.path.join(RESULTS_FOLDER, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'File not found'}), 404
        
        return send_file(file_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'Download failed: {str(e)}'}), 500

if __name__ == '__main__':
    print("🚀 Starting PAN Card Masking Server...")
    print(f"📁 Upload folder: {UPLOAD_FOLDER}")
    print(f"📁 Results folder: {RESULTS_FOLDER}")
    print(f"🤖 Model path: {MODEL_PATH}")
    
    try:
        # Test model loading at startup
        load_model()
        print("✅ PAN Card YOLO model loaded successfully!")
    except Exception as e:
        print(f"⚠️ Warning: Could not load model at startup: {e}")
        print("Model will be loaded when first request is made.")
    
    app.run(debug=True, host='0.0.0.0', port=5001)
