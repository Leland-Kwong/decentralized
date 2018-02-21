import debug from 'debug';
import localForage from 'localforage';
import checkRange from '../../isomorphic/check-key-range';

const localDbError = debug('lucidbyte.localDbError');
const localInstanceCache = new Map();
const getInstance = (bucket) => {
  const fromCache = localInstanceCache.get(bucket);
  if (fromCache) {
    return fromCache;
  }
  const config = { name: 'lucidbyte', storeName: bucket };
  const inst = localForage.createInstance(config);
  localInstanceCache.set(bucket, inst);
  return inst;
};
// TODO: method: removeLocalDbInstance if bucket is gone #mvp
export function persistToLocalDb(bucket, key, value, action) {
  const instance = getInstance(bucket);
  // db only allows strings as keys
  const keyAsString = key + '';

  // debug('lucidbyte.cacheData')(bucket, key, value, action);

  if (action === 'del') {
    return instance.removeItem(keyAsString);
  }
  return instance.setItem(keyAsString, value)
    .catch(localDbError);
}

export function getFromLocalDb(bucket, key) {
  const instance = getInstance(bucket);
  // NOTE: returns `null` if no value exists
  return instance.getItem(key).then(v => {
    if (null === v) {
      const msg = `getFromLocalDb: ${bucket}/${key}`;
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
