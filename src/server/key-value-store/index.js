// TODO: if we're not mapping the value, then we can pipe the result directly instead of parsing it first #db.get #db.createReadStream

const delDir = require('del');
const LevelUp = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const fs = require('fs-extra');

const dbsCache = require('lru-cache')({
  max: 100,
  dispose: (key, val) => {
    val.then(db => db.close())
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

class KV extends LevelUp {
  constructor(db, rootDir) {
    super(db);
    this.rootDir = rootDir;

    this.codecs = this._db.codec.opts;
    const { decode } = this.codecs.valueEncoding;
    let decodeListenersCount = 0;
    this.on('newListener', (event) => {
      if (event === 'putDecode') {
        decodeListenersCount++;
      }
    });
    this.on('removeListener', (event) => {
      if (event === 'putDecode') {
        decodeListenersCount--;
      }
    });
    this.on('put', (k, v) => {
      if (decodeListenersCount) {
        const value = decode(v);
        this.emit('putDecode', k, value);
      }
    });
  }

  async drop() {
    try {
      await new Promise((resolve) => {
        this.db.close(resolve);
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

const hasKeyThenHandler = res => !!res;
KV.prototype.hasKey = function(key) {
  return new Promise((resolve, reject) => {
    this.iterator({ gte: key, lte: key }, {
      onNext: resolve,
      onError: reject,
      onComplete: resolve
    });
  }).then(hasKeyThenHandler);
};

KV.prototype.iterator = require('./iterator');

/*
  NOTE: the initialization is done asynchronously, but in order to do proper
  caching of opened dbs, we must do all the async work inside a promise and
  return the promise immediately. This way, if another request for db
  initialization happens before ther previous request has finished, we can
  return the in-flight request.
 */
const init = (rootDir, options = {}) => {
  const fromCache = dbsCache.get(rootDir);
  if (fromCache) {
    return fromCache();
  }
  const dbPromise = new Promise(async (resolve, reject) => {
    // recursively setup directory
    try {
      await fs.ensureDir(rootDir);
    } catch(err) {
      return reject(err);
    }
    const dataDb = encode(
      leveldown(rootDir),
      options.encoding || {}
    );
    const dataLevel = new KV(dataDb, rootDir);
    resolve(dataLevel);
  });
  const cacheHandler = db => {
    if (db.isClosed()) {
      return init(rootDir, options);
    }
    return db;
  };
  dbsCache.set(rootDir, () => {
    return dbPromise.then(cacheHandler);
  });
  return dbPromise;
};

module.exports = init;
