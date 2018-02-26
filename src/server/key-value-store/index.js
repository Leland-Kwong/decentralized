// TODO: use custom encoding for client db and default to vanilla for all others.

const path = require('path');
const delDir = require('del');
const LevelUp = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const getMetadata = require('./metadata');
const fs = require('fs-extra');
const {
  dbGlobalCache,
} = require('./global-cache');

const handleDbCacheDispose = db => db.close();
const dbsOpened = require('lru-cache')({
  max: 5000,
  dispose: (key, val) => {
    val.catch(console.error)
      .then(handleDbCacheDispose);
  }
});

function kvError({ msg, type }) {
  this.ok = 0;
  this.message = msg;
  if (type) {
    this.type = type;
  }
}

// NOTE: Base class for all databases. Has some built in defaults to make it a bit easier to use.
class KV extends LevelUp {
  constructor(db, rootDir, options, metadata) {
    super(db);
    const {
      bucket = '',
      onOpened,
      cache = true
    } = options;
    this.options = options;
    this.bucket = bucket;
    this.rootDir = rootDir;
    this.metadata = metadata;

    onOpened &&
      this.on('open', () => onOpened(this));

    if (cache) {
      const invalidateCache = (key) => {
        const path = this.cacheKey(key);
        dbGlobalCache.del(path);
      };
      this.on('put', invalidateCache);
    }
  }

  async drop() {
    try {
      dbsOpened.del(this.rootDir);
      await this.reset();
      return { ok: 1 };
    } catch(err) {
      throw new kvError({ msg: 'error dropping database' });
    }
  }

  async reset() {
    return await delDir([this.rootDir], { force: true });
  }
}

const KVProto = KV.prototype;

KVProto.cacheKey = function(valueKey) {
  const { id: dbId } = this.metadata;
  return dbId + '/' + valueKey;
};

const getProto = LevelUp.prototype.get;
const getOptions = { fillCache: false };
const handleGetResult = data => {
  const { parsed, raw } = data;
  dbGlobalCache.set(path, {
    value: parsed,
    size: Buffer.byteLength(raw + path)
  });
  return parsed;
};
KVProto.get = function getWithGlobalCache(key) {
  if (this.options.cache) {
    const path = this.cacheKey(key);
    const fromCache = dbGlobalCache.get(path);
    if (fromCache) {
      return fromCache.value;
    }
  }
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
const createInstance = (rootDir) => (options = {}) => {
  const { encoding = {}, bucket } = options;
  let _rootDir = rootDir;
  if (process.env.NODE_ENV === 'test') {
    _rootDir = '/tmp/test' + rootDir;
  }
  const dbPath = path.join(_rootDir, bucket);
  const fromCache = dbsOpened.get(dbPath);
  if (fromCache) {
    return fromCache;
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
      encoding
    );
    const metadata = await getMetadata(dbPath);
    const db = new KV(dataDb, dbPath, options, metadata);
    db.on('open', () => resolve(db));
  });
  const cacheHandler = db => {
    if (db.isClosed()) {
      return createInstance(_rootDir)(options);
    }
    return db;
  };
  dbsOpened.set(dbPath, dbPromise.then(cacheHandler));
  return dbPromise;
};

module.exports = createInstance;
module.exports.dbsOpened = dbsOpened;
