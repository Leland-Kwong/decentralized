// TODO: if we're not mapping the value, then we can pipe the result directly instead of parsing it first #db.get #db.createReadStream

const delDir = require('del');
const LevelUp = require('levelup');
const leveldown = require('leveldown');
const encode = require('encoding-down');
const fs = require('fs-extra');
const dbsCache = require('lru-cache')({
  max: 100,
  dispose: (key, val) => {
    val.close();
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

  async update(key, updates) {
    try {
      const currentValue = await this.get(key);
      const newValue = Object.assign(
        currentValue,
        updates
      );
      return this.put(key, newValue);
    } catch(err) {
      console.log(err);
      throw new kvError({ msg: `error updating key: \`${key}\`` });
    }
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

const init = async (rootDir, options = {}) => {
  const fromCache = dbsCache.get(rootDir);
  if (fromCache && !fromCache.isClosed()) {
    return fromCache;
  }
  try {
    await fs.ensureDir(rootDir);
  } catch(err) {
    console.log(err);
  }
  const dataDb = encode(
    leveldown(rootDir),
    options.encoding || {}
  );
  const dataLevel = new KV(dataDb, rootDir);
  await new Promise(resolve => {
    dataLevel.on('open', resolve);
  });

  dbsCache.set(rootDir, dataLevel);
  return dataLevel;
};

module.exports = init;
