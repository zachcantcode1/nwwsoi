from flask import Flask, request, jsonify
import logging
import os
from map_service import MapService

app = Flask(__name__)
logging.basicConfig(
    filename='flask_server.log',
    level=logging.INFO,
    format='%(asctime)s - api_server - %(levelname)s - %(message)s'
)

# Ensure output directory exists
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
os.makedirs(OUTPUT_DIR, exist_ok=True)

map_service = MapService(output_dir=OUTPUT_DIR)

@app.route('/generate_map', methods=['POST'])
def generate_map():
    try:
        warning = request.get_json()
        if not warning:
            logging.error('No JSON payload received')
            return jsonify({'error': 'No JSON payload received'}), 400
        logging.info(f'Received warning: {warning.get("id", "no-id")}')
        html_path = map_service.create_warning_map(warning)
        image_path = map_service.html_to_image(html_path)
        logging.info(f'Generated image at: {image_path}')
        return jsonify({'status': 'success', 'image_path': image_path}), 200
    except Exception as e:
        logging.exception('Error generating map')
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logging.info('Starting Flask server...')
    app.run(host='0.0.0.0', port=5005, debug=False)
