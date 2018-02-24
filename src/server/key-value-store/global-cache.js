const delimCharCodeNum = 215;
const delimChar = String.fromCharCode(215);
const delim = ''.padStart(2, delimChar);
const dbGlobalCacheKeyMap = {
  map: new Map(),
  encode(rootDir, key) {
    const charCodeFromCache = this.map.get(rootDir);
    const { size } = this.map;
    const charCodeNumToUse = size + delimCharCodeNum + 1;
    const charCode = charCodeFromCache
      || String.fromCharCode(charCodeNumToUse); // code should be no less that the delimiter code number
    const shouldAddToCache = !charCodeFromCache;
    if (shouldAddToCache) {
      this.map.set(charCode, rootDir);
      // also add rootDir so we can find by either value
      this.map.set(rootDir, charCode);
    }
    return charCode + delim + key;
  },
  decode(cacheKey) {
    const [charCode, key] = cacheKey.split(delim);
    const rootDirFromCharCode = this.map.get(charCode);
    return {
      rootDir: rootDirFromCharCode,
      key
    };
  },
  deleteKey(rootDir) {
    const { map } = this;
    map.delete(
      map.get(rootDir)
    );
    map.delete(rootDir);
  }
};

const dbGlobalCache = require('lru-cache')({
  max: require('bytes')('600MB'),
  length(v) {
    return v.size;
  }
});

module.exports = {
  dbGlobalCache,
  dbGlobalCacheKeyMap
};
