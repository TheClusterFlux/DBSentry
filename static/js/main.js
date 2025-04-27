document.addEventListener('DOMContentLoaded', function() {
    // Initialize
    updateCurrentTime();
    fetchDatabaseStats();
    
    // Setup automatic current time updates
    setInterval(updateCurrentTime, 1000);
    
    // Setup refresh button
    document.getElementById('refreshBtn').addEventListener('click', function() {
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> Refreshing...';
        
        // Call API to refresh data
        fetch('/api/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            fetchDatabaseStats();
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
            showError('Failed to refresh data. Please try again.');
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh Data';
        });
    });
    
    // Auto-refresh every 5 minutes
    setInterval(fetchDatabaseStats, 300000);
});

// Format bytes to a human-readable string
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Format a timestamp to a readable date/time
function formatTimestamp(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
}

// Update the current time in the footer
function updateCurrentTime() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleString();
}

// Show an error message
function showError(message, duration = 5000) {
    // Remove existing error messages
    const existingErrors = document.querySelectorAll('.error-message');
    existingErrors.forEach(el => el.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    
    // Find where to insert the error
    const controls = document.querySelector('.controls');
    controls.insertAdjacentElement('afterend', errorDiv);
    
    // Auto-remove after specified duration
    if (duration > 0) {
        setTimeout(() => {
            errorDiv.remove();
        }, duration);
    }
}

// Fetch all database statistics from our backend API
function fetchDatabaseStats() {
    fetch('/api/stats')
        .then(response => response.json())
        .then(data => {
            renderDashboard(data);
            document.getElementById('lastUpdated').textContent = 'Last updated: ' + formatTimestamp(data.timestamp);
        })
        .catch(error => {
            console.error('Error fetching stats:', error);
            showError('Failed to fetch database statistics. Please try again.');
            document.getElementById('sqliteStatus').textContent = 'Error';
            document.getElementById('sqliteStatus').className = 'status-badge error';
            document.getElementById('mongoStatus').textContent = 'Error';
            document.getElementById('mongoStatus').className = 'status-badge error';
        });
}

// Render the dashboard with data
function renderDashboard(data) {
    // SQLite section
    renderSqliteData(data.sqlite);
    
    // MongoDB section
    renderMongoData(data.mongodb);
}

// Render SQLite data
function renderSqliteData(data) {
    const sqliteStatus = document.getElementById('sqliteStatus');
    const sqliteStorage = document.getElementById('sqliteStorage');
    const sqliteTables = document.getElementById('sqliteTables');
    
    // Clear previous content
    sqliteStorage.innerHTML = '';
    sqliteTables.innerHTML = '';
    
    if (data.status === 'ok') {
        sqliteStatus.textContent = 'Online';
        sqliteStatus.className = 'status-badge success';
        
        // Calculate total storage (this is estimated from SQLite data)
        let totalSize = 0;
        const tables = data.tables || {};
        
        Object.values(tables).forEach(table => {
            totalSize += table.total_size || 0;
        });
        
        // Add storage metrics
        const storageMetric = document.createElement('div');
        storageMetric.className = 'metric-card';
        storageMetric.innerHTML = `
            <div class="label">Total Storage Used</div>
            <div class="value">${formatBytes(totalSize)}</div>
        `;
        sqliteStorage.appendChild(storageMetric);
        
        // Add table information
        if (Object.keys(tables).length === 0) {
            sqliteTables.innerHTML = '<p>No tables found</p>';
        } else {
            Object.entries(tables).forEach(([tableName, tableData]) => {
                const tableCard = document.createElement('div');
                tableCard.className = 'table-card';
                
                tableCard.innerHTML = `
                    <div class="table-name">${tableName}</div>
                    <div class="table-stats">
                        <div class="stat">
                            <i class="fas fa-list"></i>
                            ${tableData.record_count} Records
                        </div>
                        <div class="stat">
                            <i class="fas fa-database"></i>
                            ${formatBytes(tableData.total_size)}
                        </div>
                        <div class="stat">
                            <i class="fas fa-columns"></i>
                            ${tableData.columns ? tableData.columns.length : 0} Columns
                        </div>
                    </div>
                `;
                
                sqliteTables.appendChild(tableCard);
            });
        }
    } else {
        sqliteStatus.textContent = 'Offline';
        sqliteStatus.className = 'status-badge error';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        
        let errorMessage = data.error || 'Unable to connect to SQLite database';
        errorDiv.innerHTML = `<p>${errorMessage}</p>`;
        
        sqliteStorage.appendChild(errorDiv);
    }
}

// Render MongoDB data
function renderMongoData(data) {
    const mongoStatus = document.getElementById('mongoStatus');
    const mongoStorage = document.getElementById('mongoStorage');
    const mongoCollections = document.getElementById('mongoCollections');
    
    // Clear previous content
    mongoStorage.innerHTML = '';
    mongoCollections.innerHTML = '';
    
    if (data.status === 'ok') {
        mongoStatus.textContent = 'Online';
        mongoStatus.className = 'status-badge success';
        
        const databases = data.databases || {};
        
        if (Object.keys(databases).length === 0) {
            mongoStorage.innerHTML = '<p>No databases found</p>';
            mongoCollections.innerHTML = '<p>No collections found</p>';
            return;
        }
        
        // Calculate totals across all databases
        let totalSize = 0;
        let usedSpace = 0;
        let freeSpace = 0;
        let totalCollections = 0;
        
        Object.values(databases).forEach(db => {
            totalSize += db.total_size || 0;
            usedSpace += db.used_space || 0;
            freeSpace += db.free_space || 0;
            
            if (db.collections) {
                totalCollections += Object.keys(db.collections).length;
            }
        });
        
        // Add storage metrics
        const storageMetrics = [
            {
                label: 'Total Storage Used',
                value: formatBytes(totalSize)
            },
            {
                label: 'Memory Usage',
                value: formatBytes(usedSpace)
            },
            {
                label: 'Available Memory',
                value: formatBytes(freeSpace)
            }
        ];
        
        storageMetrics.forEach(metric => {
            const metricCard = document.createElement('div');
            metricCard.className = 'metric-card';
            metricCard.innerHTML = `
                <div class="label">${metric.label}</div>
                <div class="value">${metric.value}</div>
            `;
            mongoStorage.appendChild(metricCard);
        });
        
        // Add collection information
        Object.entries(databases).forEach(([dbName, dbData]) => {
            const collections = dbData.collections || {};
            
            if (Object.keys(collections).length === 0) {
                return;
            }
            
            // Add database header
            const dbHeader = document.createElement('h4');
            dbHeader.style.marginTop = '10px';
            dbHeader.style.marginBottom = '5px';
            dbHeader.textContent = `Database: ${dbName}`;
            mongoCollections.appendChild(dbHeader);
            
            // Add collections
            Object.entries(collections).forEach(([collName, collData]) => {
                const collCard = document.createElement('div');
                collCard.className = 'table-card';
                
                collCard.innerHTML = `
                    <div class="table-name">${collName}</div>
                    <div class="table-stats">
                        <div class="stat">
                            <i class="fas fa-list"></i>
                            ${collData.record_count} Documents
                        </div>
                        <div class="stat">
                            <i class="fas fa-database"></i>
                            ${formatBytes(collData.total_size)}
                        </div>
                        <div class="stat">
                            <i class="fas fa-hdd"></i>
                            ${formatBytes(collData.storage_size)} Storage
                        </div>
                        <div class="stat">
                            <i class="fas fa-file"></i>
                            ${collData.avg_object_size ? formatBytes(collData.avg_object_size) : '0 B'} Avg Size
                        </div>
                    </div>
                `;
                
                mongoCollections.appendChild(collCard);
            });
        });
    } else {
        mongoStatus.textContent = 'Offline';
        mongoStatus.className = 'status-badge error';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        
        let errorMessage = data.error || 'Unable to connect to MongoDB database';
        errorDiv.innerHTML = `<p>${errorMessage}</p>`;
        
        mongoStorage.appendChild(errorDiv);
    }
}