# DBSentry - Database Monitoring Dashboard

DBSentry is a lightweight web application for monitoring SQLite and MongoDB databases in a Kubernetes environment. It provides a clean, modern interface to track database metrics including storage usage and entry counts.

## Features

- **Real-time Status Monitoring**: View the online/offline status of your database services
- **Storage Metrics**: Track total storage used, available space, and memory usage
- **Table/Collection Details**: View record counts and storage metrics for individual tables/collections
- **Caching Mechanism**: Reduces database load by caching metrics with configurable refresh intervals
- **Responsive Design**: Works on desktop and mobile devices

## Prerequisites

- Python 3.6+
- Docker (for containerization)
- Kubernetes cluster with:
  - SQLite service accessible at `http://sqlite:8080`
  - MongoDB service accessible at `mongodb://mongodb:27017/`

## Environment Variables

The application can be configured with the following environment variables:

- `SQLITE_SERVICE`: URL of the SQLite service (default: `http://sqlite:8080`)
- `MONGODB_URI`: MongoDB connection string (default: `mongodb://mongodb:27017/`)
- `MONGODB_DB`: MongoDB database name to use (default: `admin`)

## Development Setup

1. Clone the repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Run the application:
   ```
   python app.py
   ```
4. Open http://localhost:8080 in your browser

## Docker Build & Run

Build the Docker image:
```
docker build -t dbsentry:latest .
```

Run the container:
```
docker run -p 8080:8080 -e SQLITE_SERVICE=http://your-sqlite:8080 -e MONGODB_URI=mongodb://your-mongodb:27017/ dbsentry:latest
```

## Kubernetes Deployment

The application includes a Kubernetes deployment configuration in `deployment.yaml`. Deploy with:
```
kubectl apply -f deployment.yaml
```

Access the application via the service created in the deployment (default port is 8080).

## API Endpoints

- `GET /api/stats` - Get the current database statistics (from cache or fresh)
- `POST /api/refresh` - Force a refresh of the cached database statistics

## License

[MIT License](LICENSE)