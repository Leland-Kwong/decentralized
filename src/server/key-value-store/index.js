// TODO: mutations do immediate writes to the oplog, and then we queue up actual data changes in memory until a minimum size threshold (4MB) at which point we'll flush the queue. This allows us to quickly do writes without having to immediately commit the data changes. #performance

const path = require('path');
const LogEntry = require('./log-entry');
const delDir = require('del');
const LevelUp = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const dbNsEvent = require('../modules/db-ns-event');
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

function setupLogging(db) {
  function emitChange(key, value, action) {
    const keyChangeEvent = dbNsEvent(action, key.bucket, key.key);
    db.emit(keyChangeEvent, key.key, value);

    const bucketChangeEvent = dbNsEvent(action, key.bucket);
    db.emit(bucketChangeEvent, key.key, value);
  }

  db.on('batch', (ops) => {
    const len = ops.length;
    for (let i = 0; i < len; i++) {
      const op = ops[i];
      emitChange(op.key, op.value, op.type);
    }
  });
}

// (https://github.com/Level/leveldown#leveldownopenoptions-callback)
const dbBaseConfig = {
  // disable cache since we're using a single
  // globally shared cache. (file: global-cache.js)
  cacheSize: require('bytes')('200MB'),
};

// NOTE: Base class for all databases. Has some built in defaults to make it a bit easier to use.
class KV extends LevelUp {
  constructor(db, rootDir, options) {
    super(db, dbBaseConfig);
    const {
      onOpened,
      cache = true
    } = options;
    this.cache = cache;
    this.rootDir = rootDir;

    onOpened &&
      this.on('open', () => onOpened(this));

    setupLogging(this);

    // invalidate cache when value is updated
    if (cache) {
      const invalidateCache = (key) => {
        const path = this.cacheKey(key);
        dbGlobalCache.del(path);
      };
      this.on('put', invalidateCache);
      this.on('batch', (items) => {
        for (let i = 0; i < items.length; i++) {
          const { key } = items[i];
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

KVProto.cacheKey = function(key) {
  return key.bucket + '/' + key.key;
};

const getProto = LevelUp.prototype.get;
const handleGetError = error => {
  // we can ignore not found errors
  if (error.type === 'NotFoundError') {
    return null;
  }
  console.error('[GET ERROR]', error);
};

const getOptions = { fillCache: false };
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

const putWithLog = function(db, putKey, value, callback) {
  const entry = LogEntry(putKey, value);
  return db.batch()
    .put(putKey, value)
    .put(entry.key, entry.value)
    .write(callback);
};

const delWithLog = function(db, putKey, callback) {
  const entry = LogEntry(putKey, { actionType: 'del' });
  return db.batch()
    .del(putKey)
    .put(entry.key, entry.value)
    .write(callback);
};

const batchWithLog = function(db, items, callback) {
  const batch = db.batch();
  for (let i = 0; i < items.length; i++) {
    const { type, key, value } = items[i];
    const method = type === 'patch' ? 'put' : type;
    batch[method](key, value);
    const logValue = value || { actionType: 'del' };
    const entry = LogEntry(key, logValue);
    batch[method](entry.key, entry.value);
  }
  return batch.write(callback);
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
    const { storeName } = options;
    const dbPath = path.join(rootDir, storeName);
    const fromCache = dbsOpened.get(dbPath);
    if (fromCache) {
      return fromCache;
    }
    const dbPromise = new Promise(async (resolve, reject) => {
      // recursively setup directory
      try {
        await fs.ensureDir(rootDir);
      } catch(err) {
        return reject(err);
      }
      const { encoding = {} } = options;
      const dataDb = encode(
        leveldown(dbPath),
        encoding
      );
      const db = new KV(dataDb, dbPath, options);
      db.on('open', () => resolve(db));
    });
    dbsOpened.set(dbPath, dbPromise);
    return dbPromise;
  };
};

module.exports = createFactory;
module.exports.isDb = db => db.constructor === KV;
module.exports.dbsOpened = dbsOpened;
module.exports.putWithLog = putWithLog;
module.exports.delWithLog = delWithLog;
module.exports.batchWithLog = batchWithLog;
