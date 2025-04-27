from flask import Flask, jsonify, render_template, request
import requests
import json
import time
from pymongo import MongoClient
import logging
import os

app = Flask(__name__)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache settings
CACHE_TIMEOUT = 300  # 5 minutes
last_update_time = 0
cached_data = None

# Service configurations
SQLITE_SERVICE = os.getenv('SQLITE_SERVICE', 'http://sqlite-service:8080')
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://mongodb-service:27017/')
MONGODB_DB = os.getenv('MONGODB_DB', 'admin')

def get_mongodb_stats():
    try:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        db_list = client.list_database_names()
        db_stats = {}
        
        for db_name in db_list:
            if db_name not in ['admin', 'local', 'config']:
                db = client[db_name]
                collection_stats = {}
                db_size = 0
                
                for collection_name in db.list_collection_names():
                    collection = db[collection_name]
                    count = collection.count_documents({})
                    stats = db.command('collStats', collection_name)
                    size = stats.get('size', 0)
                    db_size += size
                    
                    output_collection_name = collection_name.replace('_', ' ')
                    collection_stats[output_collection_name] = {
                        'record_count': count,
                        'total_size': size,
                        'storage_size': stats.get('storageSize', 0),
                        'avg_object_size': stats.get('avgObjSize', 0) if count > 0 else 0
                    }
                
                server_stats = db.command('serverStatus')
                storage_info = {
                    'total_size': db_size,
                    'used_space': server_stats.get('mem', {}).get('resident', 0) * 1024 * 1024,  # Convert from MB to bytes
                    'free_space': server_stats.get('mem', {}).get('available', 0) * 1024 * 1024,  # Convert from MB to bytes
                    'collections': collection_stats
                }
                db_stats[db_name] = storage_info
                
        client.close()
        return {'status': 'ok', 'databases': db_stats}
    except Exception as e:
        logger.error(f"MongoDB Error: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def get_sqlite_stats():
    try:
        response = requests.get(f"{SQLITE_SERVICE}/status", timeout=5)
        if response.status_code == 200:
            return response.json()
        else:
            return {'status': 'error', 'error': f"SQLite service returned status code {response.status_code}"}
    except requests.RequestException as e:
        logger.error(f"SQLite Service Error: {str(e)}")
        return {'status': 'error', 'error': str(e)}

def fetch_all_data():
    sqlite_data = get_sqlite_stats()
    mongo_data = get_mongodb_stats()
    
    return {
        'sqlite': sqlite_data,
        'mongodb': mongo_data,
        'timestamp': time.time()
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats')
def get_stats():
    global cached_data, last_update_time
    
    force_refresh = request.args.get('refresh', '').lower() == 'true'
    current_time = time.time()
    
    # If cache expired or force refresh requested, update data
    if force_refresh or not cached_data or (current_time - last_update_time) > CACHE_TIMEOUT:
        cached_data = fetch_all_data()
        last_update_time = current_time
        logger.info("Refreshed database stats")
    
    return jsonify(cached_data)

@app.route('/api/refresh', methods=['POST'])
def refresh_stats():
    global cached_data, last_update_time
    
    cached_data = fetch_all_data()
    last_update_time = time.time()
    logger.info("Manually refreshed database stats")
    
    return jsonify({'status': 'ok', 'message': 'Cache refreshed'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8080, debug=False)