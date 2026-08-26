// db.js — thin promise wrapper around IndexedDB.
// One "cards" store holds both collection and wishlist items (status: 'collection' | 'wishlist')
// so Players/Sets views can aggregate across both without a join.
// One "settings" store holds simple key/value config (e.g. the API key).

const DB_NAME = "palace-cards-db";
const DB_VERSION = 2;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("cards")) {
        const store = db.createObjectStore("cards", { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("player", "player", { unique: false });
        store.createIndex("season", "season", { unique: false });
        store.createIndex("manufacturer", "manufacturer", { unique: false });
        store.createIndex("product", "product", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("searches")) {
        db.createObjectStore("searches", { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = openDB();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const DB = {
  async allCards() {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cards", "readonly");
      const req = tx.objectStore("cards").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async getCard(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("cards", "readonly").objectStore("cards").get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async saveCard(card) {
    const db = await dbPromise;
    if (!card.id) card.id = uid();
    if (!card.dateAdded) card.dateAdded = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cards", "readwrite");
      tx.objectStore("cards").put(card);
      tx.oncomplete = () => resolve(card);
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteCard(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("cards", "readwrite");
      tx.objectStore("cards").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async byStatus(status) {
    const all = await this.allCards();
    return all.filter((c) => c.status === status);
  },

  async getSetting(key) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("settings", "readonly").objectStore("settings").get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },

  async setSetting(key, value) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async allSearches() {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const req = db.transaction("searches", "readonly").objectStore("searches").getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async saveSearch(search) {
    const db = await dbPromise;
    if (!search.id) search.id = uid();
    if (!search.createdAt) search.createdAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("searches", "readwrite");
      tx.objectStore("searches").put(search);
      tx.oncomplete = () => resolve(search);
      tx.onerror = () => reject(tx.error);
    });
  },

  async deleteSearch(id) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("searches", "readwrite");
      tx.objectStore("searches").delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async exportAll() {
    return {
      cards: await this.allCards(),
      searches: await this.allSearches(),
      exportedAt: new Date().toISOString()
    };
  },

  async importAll(data) {
    const db = await dbPromise;
    const tx = db.transaction(["cards", "searches"], "readwrite");
    const cardStore = tx.objectStore("cards");
    const searchStore = tx.objectStore("searches");
    (data.cards || []).forEach((c) => cardStore.put(c));
    (data.searches || []).forEach((s) => searchStore.put(s));
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};
