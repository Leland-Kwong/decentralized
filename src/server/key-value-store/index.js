const path = require('path');
const delDir = require('del');
const LevelUp = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const getMetadata = require('./metadata');
const { validateBucket } = require('../modules/validate-db-paths');
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

// (https://github.com/Level/leveldown#leveldownopenoptions-callback)
const dbBaseConfig = {
  // disable cache since we're using a single
  // globally shared cache. (file: global-cache.js)
  cacheSize: 0,
  maxOpenFiles: 10000
};

// NOTE: Base class for all databases. Has some built in defaults to make it a bit easier to use.
class KV extends LevelUp {
  constructor(db, rootDir, options, metadata) {
    super(db, dbBaseConfig);
    const {
      bucket = '',
      onOpened,
      cache = true
    } = options;
    this.cache = cache;
    this.bucket = bucket;
    this.rootDir = rootDir;
    this.metadata = metadata;

    onOpened &&
      this.on('open', () => onOpened(this));

    // invalidate cache when value is updated
    if (cache) {
      const invalidateCache = (key) => {
        const path = this.cacheKey(key);
        dbGlobalCache.del(path);
      };
      this.on('put', invalidateCache);
      this.on('batch', (ops) => {
        for (let i = 0; i < ops.length; i++) {
          const { key } = ops[i];
          invalidateCache(key);
        }
      });
    }
  }

  async drop() {
    try {
      await new Promise((resolve, reject) => {
        this.on('closed', (err) => {
          if (err) reject(err);
          else {
            this.reset()
              .catch(reject)
              .then(resolve);
          }
        });
        dbsOpened.del(this.rootDir);
      });
      return { ok: 1 };
    } catch(err) {
      throw new kvError({ msg: 'error dropping database' });
    }
  }

  reset() {
    return delDir([this.rootDir], { force: true });
  }
}

const KVProto = KV.prototype;

KVProto.cacheKey = function(valueKey) {
  const { id: dbId } = this.metadata;
  return dbId + '/' + valueKey;
};

const getProto = LevelUp.prototype.get;
const getOptions = { fillCache: false };
const handleGetError = error => {
  // we can ignore not found errors
  if (error.type === 'NotFoundError') {
    return null;
  }
  console.error('[GET ERROR]', error);
};
KVProto.get = function getWithGlobalCache(key) {
  const path = this.cacheKey(key);
  if (this.cache) {
    const fromCache = dbGlobalCache.get(path);
    if (fromCache) {
      return fromCache.value;
    }
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
    .then(handleGetResult)
    .catch(handleGetError);
};

/*
  NOTE: the initialization is done asynchronously, but in order to do proper
  caching of opened dbs, we must do all the async work inside a promise and
  return the promise immediately. This way, if another request for db
  initialization happens before ther previous request has finished, we can
  return the in-flight request.
 */
const createFactory = (rootDir) => {
  return function factory(options) {
    const { bucket } = options || {};
    const dbPath = path.join(rootDir, bucket);
    const fromCache = dbsOpened.get(dbPath);
    if (fromCache) {
      return fromCache;
    }
    try {
      validateBucket(bucket);
    } catch(err) {
      console.error(err);
      return;
    }
    const dbPromise = new Promise(async (resolve, reject) => {
      // recursively setup directory
      try {
        await fs.ensureDir(dbPath);
      } catch(err) {
        return reject(err);
      }
      const { encoding = {} } = options;
      const dataDb = encode(
        leveldown(dbPath),
        encoding
      );
      const metadata = await getMetadata(dbPath);
      const db = new KV(dataDb, dbPath, options, metadata);
      db.on('open', () => resolve(db));
    });
    dbsOpened.set(dbPath, dbPromise);
    return dbPromise;
  };
};

module.exports = createFactory;
module.exports.dbsOpened = dbsOpened;
