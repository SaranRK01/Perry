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

# Initialize YOLO model later to avoid startup issues
model = None
MODEL_PATH = r"D:\Ideathon\perry 3\runs\detect\train25\weights\best.pt"

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
            print(f"✅ YOLO model loaded successfully from {MODEL_PATH}")
        except Exception as e:
            print(f"❌ Error loading YOLO model: {e}")
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
        img = cv2.imdecode(np.frombuffer(img_data, np.uint8), cv2.IMREAD_COLOR)
        images.append(img)
    
    doc.close()
    return images

def images_to_pdf(images, output_path):
    """Convert list of images to PDF"""
    pil_images = []
    
    for img in images:
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(img_rgb)
        pil_images.append(pil_img)
    
    if pil_images:
        pil_images[0].save(output_path, save_all=True, append_images=pil_images[1:])

def mask_pii_in_image(img):
    """Apply YOLO detection and masking to a single image"""
    try:
        model = load_model()
        results = model(img, save=False, conf=0.5)
        
        for r in results:
            processed_img = r.orig_img.copy()
            boxes = r.boxes.xyxy.cpu().numpy() if r.boxes is not None else []
            
            detection_count = len(boxes)
            
            for box in boxes:
                x1, y1, x2, y2 = map(int, box)
                roi = processed_img[y1:y2, x1:x2]
                masked_roi = cv2.GaussianBlur(roi, (51, 51), 30)
                processed_img[y1:y2, x1:x2] = masked_roi
            
            return processed_img, detection_count
        
        return img, 0
    except Exception as e:
        print(f"❌ Error in mask_pii_in_image: {e}")
        # Return original image with no detections if model fails
        return img, 0

@app.route('/health', methods=['GET'])
def health_check():
    try:
        model_status = False
        if os.path.exists(MODEL_PATH):
            model_status = True
        
        return jsonify({
            'status': 'running',
            'model_path_exists': model_status,
            'model_path': MODEL_PATH,
            'server': 'document_masking_server'
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/mask-document', methods=['POST'])
def mask_document():
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
                masked_img, detections = mask_pii_in_image(img)
                masked_images.append(masked_img)
                total_detections += detections
            
            # Save as PDF
            output_path = os.path.join(RESULTS_FOLDER, f"{base_name}_masked.pdf")
            images_to_pdf(masked_images, output_path)
            
        else:
            # Process image
            img = cv2.imread(input_path)
            if img is None:
                return jsonify({'error': 'Could not read image file'}), 400
            
            masked_img, total_detections = mask_pii_in_image(img)
            
            # Save as image
            output_path = os.path.join(RESULTS_FOLDER, f"{base_name}_masked.jpg")
            cv2.imwrite(output_path, masked_img)
        
        # Clean up input file
        os.remove(input_path)
        
        return jsonify({
            'success': True,
            'message': f'Document processed successfully! {total_detections} PII regions masked.',
            'output_file': f"{base_name}_masked.{'pdf' if is_pdf else 'jpg'}",
            'detections': total_detections,
            'download_url': f'/download/{os.path.basename(output_path)}'
        })
        
    except Exception as e:
        return jsonify({'error': f'Processing failed: {str(e)}'}), 500

@app.route('/download/<filename>')
def download_file(filename):
    try:
        return send_file(
            os.path.join(RESULTS_FOLDER, filename),
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
        return jsonify({'error': f'Download failed: {str(e)}'}), 404

if __name__ == '__main__':
    print("🚀 Starting PII Document Masking Server...")
    print(f"📁 Upload folder: {UPLOAD_FOLDER}")
    print(f"📁 Results folder: {RESULTS_FOLDER}")
    print(f"🤖 YOLO model path: {MODEL_PATH}")
    print(f"🤖 Model file exists: {os.path.exists(MODEL_PATH)}")
    
    # Test model loading
    try:
        load_model()
        print("✅ YOLO model loaded successfully")
    except Exception as e:
        print(f"⚠️  Warning: YOLO model failed to load: {e}")
        print("🔄 Server will start anyway - model will be loaded on first request")
    
    app.run(debug=False, port=5001, host='127.0.0.1')
