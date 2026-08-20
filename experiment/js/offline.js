// experiment/js/offline.js
const DB_NAME = 'MousetrackingOfflineDB';
const DB_VERSION = 1;

// Inicjalizacja lokalnej bazy w przeglądarce
function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            // Magazyn na konfigurację badania i obrazki
            if (!db.objectStoreNames.contains('cache')) {
                db.createObjectStore('cache');
            }
            // Magazyn na wyniki czekające na wysłanie do Supabase
            if (!db.objectStoreNames.contains('sync_queue')) {
                db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Zapis i odczyt aktualnego eksperymentu
export async function saveToCache(key, data) {
    const db = await getDB();
    return new Promise(resolve => {
        const tx = db.transaction('cache', 'readwrite');
        tx.objectStore('cache').put(data, key);
        tx.oncomplete = () => resolve();
    });
}

export async function getFromCache(key) {
    const db = await getDB();
    return new Promise(resolve => {
        const tx = db.transaction('cache', 'readonly');
        const req = tx.objectStore('cache').get(key);
        req.onsuccess = () => resolve(req.result);
    });
}

// Obsługa kolejki wyników
export async function addToQueue(tableName, data) {
    const db = await getDB();
    return new Promise(resolve => {
        const tx = db.transaction('sync_queue', 'readwrite');
        tx.objectStore('sync_queue').add({ table: tableName, data: data, timestamp: Date.now() });
        tx.oncomplete = () => resolve();
    });
}

export async function getQueue() {
    const db = await getDB();
    return new Promise(resolve => {
        const tx = db.transaction('sync_queue', 'readonly');
        const req = tx.objectStore('sync_queue').getAll();
        req.onsuccess = () => resolve(req.result);
    });
}

export async function removeFromQueue(id) {
    const db = await getDB();
    return new Promise(resolve => {
        const tx = db.transaction('sync_queue', 'readwrite');
        tx.objectStore('sync_queue').delete(id);
        tx.oncomplete = () => resolve();
    });
}