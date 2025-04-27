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

# Service configurations - These will only be used server-side
SQLITE_SERVICE = os.getenv('SQLITE_SERVICE', 'http://sqlite-service:8080')
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://mongodb-service:27017/')
MONGODB_DB = os.getenv('MONGODB_DB', 'admin')

# Function to safely handle MongoDB connections
def get_mongodb_stats():
    try:
        logger.info(f"Attempting to connect to MongoDB at {MONGODB_URI}")
        
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
        
        # Verify connection
        client.admin.command('ping')
        
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
                    try:
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
                    except Exception as e:
                        logger.warning(f"Couldn't get stats for {collection_name}: {e}")
                        collection_stats[collection_name.replace('_', ' ')] = {
                            'record_count': count,
                            'total_size': 0,
                            'storage_size': 0,
                            'avg_object_size': 0
                        }
                
                # Get server stats if possible
                try:
                    server_stats = db.command('serverStatus')
                    used_space = server_stats.get('mem', {}).get('resident', 0) * 1024 * 1024  # Convert from MB to bytes
                    free_space = server_stats.get('mem', {}).get('available', 0) * 1024 * 1024  # Convert from MB to bytes
                except Exception as e:
                    logger.warning(f"Couldn't get server stats: {e}")
                    used_space = 0
                    free_space = 0
                
                storage_info = {
                    'total_size': db_size,
                    'used_space': used_space,
                    'free_space': free_space,
                    'collections': collection_stats
                }
                db_stats[db_name] = storage_info
                
        client.close()
        logger.info("MongoDB stats retrieved successfully")
        return {'status': 'ok', 'databases': db_stats}
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"MongoDB Error: {error_msg}")
        return {'status': 'error', 'error': f"MongoDB connection error: {error_msg}"}

# Function to safely handle SQLite service
def get_sqlite_stats():
    try:
        logger.info(f"Attempting to connect to SQLite service at {SQLITE_SERVICE}")
        
        response = requests.get(f"{SQLITE_SERVICE}/status", timeout=3)
        if response.status_code == 200:
            logger.info("SQLite stats retrieved successfully")
            return response.json()
        else:
            error_msg = f"SQLite service returned status code {response.status_code}"
            logger.error(error_msg)
            return {'status': 'error', 'error': error_msg}
    except requests.RequestException as e:
        error_msg = str(e)
        logger.error(f"SQLite Service Error: {error_msg}")
        return {'status': 'error', 'error': f"Failed to connect to SQLite service: {error_msg}"}

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

@app.route('/health')
def health_check():
    """Simple health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Service is running'})

if __name__ == '__main__':
    # Print startup information
    print(f"Starting DBSentry...")
    print(f"SQLite Service URL: {SQLITE_SERVICE}")
    print(f"MongoDB URI: {MONGODB_URI}")
    app.run(host='0.0.0.0', port=8080, debug=False)