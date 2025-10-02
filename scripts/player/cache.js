// Utility function to open a database
function openDatabase() {
    if (!('indexedDB' in window)) {
        console.warn('IndexedDB not supported');
        return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open('cacheDB', 1);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        // Create the object store if needed
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            db.createObjectStore('player-cache', { keyPath: 'url' });
        };
    });
}

// Function to get data from cache
function getFromCache(db, url) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('player-cache', 'readonly');
        const store = transaction.objectStore('player-cache');
        const request = store.get(url);

        request.onsuccess = () => resolve(request.result ? request.result.data : null);
        request.onerror = () => reject(request.error);
    });
}

// Function to add data to cache
function addToCache(db, url, data) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('player-cache', 'readwrite');
        const store = transaction.objectStore('player-cache');
        const request = store.put({ url, data });

        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}

// Main function to fetch data with cache
export async function fetchURL(url) {
    try {
        const db = await openDatabase();
        if (db) {
            const cachedData = await getFromCache(db, url);
            if (cachedData) {
                console.log('from cache', url);
                return cachedData;
            }
        }

        console.log('fetching', url);
        const response = await fetch(url);
        const data = await response.arrayBuffer();

        if (db) {
            await addToCache(db, url, data);
        }

        return data;
    } catch (error) {
        console.error('Fetch failed', error);
        throw error;
    }
}
