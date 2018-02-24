// TODO: batch put data using throttling

import checkRange from '../../isomorphic/is-value-in-range';
import Buffer from 'buffer';
import level from 'level-browserify';
import bytes from 'bytes';
import noop from '../../isomorphic/noop';

const debug = process.env.NODE_ENV === 'dev'
  ? require('debug')
  : () => noop;
const log = (namespace) =>
  debug(`lucidbyte.localdb.${namespace}`);

const localInstanceCache = new Map();
const getInstance = (bucket) => {
  const fromCache = localInstanceCache.get(bucket);
  if (fromCache) {
    return fromCache;
  }
  const db = level(bucket);
  localInstanceCache.set(bucket, db);
  return db;
};

const put = (bucket, key, val) => {
  const db = getInstance(bucket);
  return new Promise((resolve, reject) => {
    db.put(key, val, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const get = (bucket, key) => {
  const db = getInstance(bucket);
  return new Promise((resolve, reject) => {
    db.get(key, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

const del = (bucket, key) => {
  const db = getInstance(bucket);
  return new Promise((resolve, reject) => {
    db.del(key, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// TODO: method: removeLocalDbInstance if bucket is gone #mvp
export function persistToLocalDb(bucket, key, value, action) {
  // db only allows strings as keys
  const keyAsString = key + '';
  //
  // // debug('lucidbyte.cacheData')(bucket, key, value, action);
  //
  if (action === 'del') {
    return del(bucket, keyAsString);
  }
  return put(bucket, keyAsString, value)
    .catch(console.error);
}

export function getFromLocalDb(bucket, key) {
  // NOTE: returns `null` if no value exists
  return get(bucket, key).then(v => {
    if (null === v) {
      const msg = `localDb data at \`${bucket}/${key}\` is undefined`;
      return Promise.reject(msg);
    }
    return v;
  });
}

export function getBucketFromLocalDb(bucket, iterationOptions, cb, onComplete) {
  const { gt, gte, lt, lte, limit, reverse } = iterationOptions;
  const keyRangeFn = checkRange(gt, gte, lt, lte);
  const instance = getInstance(bucket);
  const list = [];
  instance.iterate((value, key) => {
    list.push({ key, value });
  }).then(() => {
    const l = reverse ? list.reverse() : list;
    l.slice(0, limit).forEach(d => {
      if (keyRangeFn(d.key)) {
        cb(d);
      }
    });
    onComplete();
  });
}

const opLog = level('opLog', {
  valueEncoding: {
    type: 'js object',
    buffer: false,
    encode: v => v,
    decode: v => v
  }
});
opLog.on('open', () => {
  opLog.put('logEntry', { ts: Date.now() }, (err) => {
    if (err) console.error(err);
    else log('opLog success')('entry successfully added');
    log('oplog')(opLog.db.idb);
    opLog.db.idb.deleteDatabase(
      () => log('opLog delete')('success'),
      err => console.error(err),
    );
  });
});
console.log(opLog);

/*
  Log all writes to client-side storage when offline.

  data = {
    action = String!,
    bucket = String!,
    key = String!,
    value = Any?
  }
 */
export function logAction(data, socket) {
  if (socket.connected) {
    return Promise.resolve({});
  }
  const highRestTimestamp = (Date.now() + performance.now()) * 1000 + '';
  const entryId = highRestTimestamp;
  return opLog.setItem(entryId, data);
}

let syncing = false;
export function flushAndSyncLog(socketClientInstance) {
  if (syncing) {
    return;
  }
  syncing = true;
  console.log('sync');
  // opLog.iterate((entry, key) => {
  //   const { action, ...params } = entry;
  //   params._syncing = true;
  //   socketClientInstance[action](params)
  //     .catch(console.error)
  //     .then(() => {
  //       opLog.removeItem(key);
  //     });
  // }).then(() => {
  //   syncing = false;
  // }).catch(() => {
  //   syncing = false;
  // });
}

(async () => {
  // NOTE: this is needed since `level` module is built with browserify.
  window.Buffer = Buffer.Buffer;

  const db = level('tmp', {
    valueEncoding: {
      type: 'js object',
      buffer: false,
      encode: v => v,
      decode: v => v
    }
  });

  const genTimestamp = performance.now();
  const chance = require('chance')();
  const count = 5000;
  const paras = new Array(3).fill(0).map(() => chance.paragraph());
  const items = new Array(count).fill(0).map((_, i) => {
    return {
      index: i,
      key: `${i}`.padStart(10, '0'),
      value: Math.random(),
      paras
    };
  });
  log('dataSize')(
    bytes(
      JSON.stringify(items).length
    )
  );
  log('items generated')(count, performance.now() - genTimestamp);

  const now = performance.now();
  await new Promise((resolve, reject) => {
    const batch = db.batch();
    items.forEach((v) => {
      batch.put(v.key, v);
    });
    batch.write((err) => {
      if (err) reject(err);
      else resolve();
    });
  }).catch(err => console.error(err))
    .then(() => {
      console.log(`${count} items inserted -`, performance.now() - now + '(ms)');
      db.get(items.slice(-1)[0].key, (err, value) => {
        console.log(value);
      });
    });

  /**
   * idbStore: IDBDatabase
   * keyRange: [upperBound: String, lowerBound: String]
  */
  function iterate(idbStore, keyRange, onData, onError, onComplete) {
    const { storeName } = idbStore;
    const keyRangeValue = keyRange.length
      ? IDBKeyRange.bound(...keyRange)
      : null;

    const transaction = idbStore.db.transaction([storeName], 'readonly');
    const objectStore = transaction.objectStore(storeName);

    objectStore.openCursor(keyRangeValue).onsuccess = function(event) {
      const cursor = event.target.result;
      if(cursor) {
        onData(cursor.primaryKey, cursor.value);
        cursor.continue();
      } else {
        onComplete && onComplete();
      }
    };
    objectStore.openCursor(keyRangeValue).onerror = onError;
  }

  const onReady = () => {
    const now = performance.now();
    let count = 0;
    const results = [];
    const onData = (k, v) => {
      count++;
      results.push({ k, v });
    };
    const onError = () => {};
    const onComplete = () => {
      console.log('done', performance.now() - now + '(ms)');
      console.log('count', count);
      console.log('results', results);
    };
    const idb = db.db.idb;
    iterate(
      idb,
      [],
      onData,
      onError,
      onComplete
    );
  };
  onReady();
})();
