// TODO: use custom encoding for client db and default to vanilla for all others.

const path = require('path');
const delDir = require('del');
const LevelUp = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const createDbId = require('../../isomorphic/lexicographic-id');
const fs = require('fs-extra');
const {
  dbGlobalCache,
} = require('./global-cache');

const handleDbCacheDispose = db => db.close();
const dbsOpened = require('lru-cache')({
  max: 100,
  dispose: (key, val) => {
    val().then(handleDbCacheDispose)
      .catch(console.error);
  }
});

function kvError({ msg, type }) {
  this.ok = 0;
  this.message = msg;
  if (type) {
    this.type = type;
  }
}

const DB_ID = Symbol('alias');

// NOTE: Base class for all databases. Has some built in defaults to make it a bit easier to use.
class KV extends LevelUp {
  constructor(db, rootDir, options) {
    super(db);
    const {
      bucket = '',
      onOpened
    } = options;
    this.bucket = bucket;
    this[DB_ID] = createDbId();
    this.rootDir = rootDir;

    onOpened &&
      this.on('open', () => onOpened(this));
  }

  async drop() {
    try {
      await new Promise((resolve) => {
        this.close(resolve);
      });
      await this.reset();
      return { ok: 1 };
    } catch(err) {
      console.log(err);
      throw new kvError({ msg: 'error dropping database' });
    }
  }

  async reset() {
    return await delDir([this.rootDir], { force: true });
  }
}

const KVProto = KV.prototype;

KVProto.cacheKey = function(valueKey) {
  return this[DB_ID] + '/' + valueKey;
};

const putProto = LevelUp.prototype.put;
KVProto.put = function invalidateCacheOnPut(key, value, options, callback) {
  const path = this.cacheKey(key);
  const hasCache = dbGlobalCache.get(path);
  if (hasCache) {
    // invalidate cache
    dbGlobalCache.del(path);
  }
  return putProto.call(this, key, value, options, callback);
};

const hasKeyThenHandler = res => !!res;
KVProto.hasKey = function(key) {
  return new Promise((resolve, reject) => {
    this.iterator({ gte: key, lte: key }, {
      onNext: resolve,
      onError: reject,
      onComplete: resolve
    });
  }).then(hasKeyThenHandler);
};

KVProto.iterator = require('./iterator');

const getProto = LevelUp.prototype.get;
const getOptions = { fillCache: false };
KVProto.get = function getWithGlobalCache(key) {
  const path = this.cacheKey(key);
  const fromCache = dbGlobalCache.get(path);
  if (fromCache) {
    return fromCache.value;
  }
  const handleGetResult = data => {
    const { parsed, raw } = data;
    dbGlobalCache.set(path, {
      value: parsed,
      size: Buffer.byteLength(raw + path)
    });
    return parsed;
  };
  return getProto.call(this, key, getOptions)
    .then(handleGetResult);
};

/*
  NOTE: the initialization is done asynchronously, but in order to do proper
  caching of opened dbs, we must do all the async work inside a promise and
  return the promise immediately. This way, if another request for db
  initialization happens before ther previous request has finished, we can
  return the in-flight request.
 */
const createInstance = (rootDir, options = {}) => {
  let dbPath = path.join(rootDir, options.bucket);
  if (process.env.NODE_ENV === 'test') {
    dbPath = '/tmp/test' + dbPath;
  }
  const fromCache = dbsOpened.get(dbPath);
  if (fromCache) {
    return fromCache();
  }
  const dbPromise = new Promise(async (resolve, reject) => {
    // recursively setup directory
    try {
      await fs.ensureDir(dbPath);
    } catch(err) {
      return reject(err);
    }
    const dbConfig = {
      // disable cache since we're using a single
      // globally shared cache. (file: global-cache.js)
      cacheSize: require('bytes')(0)
    };
    const dataDb = encode(
      leveldown(dbPath, dbConfig),
      options.encoding || {}
    );
    const db = new KV(dataDb, dbPath, options);
    db.on('open', () => resolve(db));
  });
  const cacheHandler = db => {
    if (db.isClosed()) {
      return createInstance(dbPath, options);
    }
    return db;
  };
  dbsOpened.set(dbPath, () => {
    return dbPromise.then(cacheHandler);
  });
  return dbPromise;
};

module.exports = createInstance;
module.exports.dbsOpened = dbsOpened;
