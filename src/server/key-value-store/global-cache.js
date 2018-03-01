const LRU = require('lru-cache');
const { dbCacheSize } = require('../config');

const dbGlobalCache = LRU({
  max: dbCacheSize,
  length(v) {
    return v.size;
  }
});

module.exports = {
  dbGlobalCache
};
