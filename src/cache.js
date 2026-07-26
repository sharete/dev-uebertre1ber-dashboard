const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../data/match_cache.json');
// Match statistics are immutable. Keeping them for two years avoids re-fetching
// the same 100-match analysis window on every scheduled dashboard update.
const MAX_AGE_DAYS = 730;

class Cache {
  constructor() {
    this.data = {};
    this.loaded = false;
  }

  load() {
    if (this.loaded) return;
    if (fs.existsSync(CACHE_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      } catch (e) {
        console.error('Failed to load cache:', e);
        this.data = {};
      }
    }
    this.loaded = true;
  }

  get(key) {
    this.load();
    return this.data[key];
  }

  set(key, value) {
    this.load();
    // Attach a timestamp for eviction
    value.__cachedAt = Date.now();
    this.data[key] = value;
  }

  evict() {
    const cutoff = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const key of Object.keys(this.data)) {
      const entry = this.data[key];
      if (entry && entry.__cachedAt && entry.__cachedAt < cutoff) {
        delete this.data[key];
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`🧹 Cache: evicted ${removed} entries older than ${MAX_AGE_DAYS} days`);
    }
  }

  save() {
    if (!this.loaded) return;
    this.evict();
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(this.data));
      const sizeKB = Math.round(fs.statSync(CACHE_FILE).size / 1024);
      console.log(`✅ Cache saved (${sizeKB} KB, ${Object.keys(this.data).length} entries)`);
    } catch (e) {
      console.error('Failed to save cache:', e);
    }
  }
}

module.exports = new Cache();
