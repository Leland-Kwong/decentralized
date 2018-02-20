import localForage from 'localforage';
import Emitter from 'tiny-emitter';
import queryData from '../isomorphic/query-data';
import { applyReducer } from 'fast-json-patch';
const { serverApiBaseRoute } = require('./client/config');

const bucketsToIgnore = {
  // _oplog: true,
  _sessions: true
};

const noop = () => {};
let debug = () => noop;
if (process.env.NODE_ENV === 'dev') {
  debug = require('debug');
}

const localDbError = debug('lucidbyte.localDbError');
const getInstance = (bucket) => {
  const config = { name: 'lucidbyte', storeName: bucket };
  return localForage.createInstance(config);
};
function persistToLocalDb(bucket, key, value, action) {
  const instance = getInstance(bucket);
  // db only allows strings as keys
  const keyAsString = key + '';

  debug('lucidbyte.cacheData')({ bucket, key, value, action });
  debug('lucidbyte.cacheData.key')(keyAsString);

  if (action === 'del') {
    return instance.removeItem(keyAsString);
  }
  return instance.setItem(keyAsString, value)
    .catch(localDbError);
}

function getFromLocalDb(bucket, key) {
  const instance = getInstance(bucket);
  // NOTE: returns `null` if no value exists
  return instance.getItem(key).then(v => {
    if (null === v) {
      return Promise.reject(null);
    }
    return v;
  });
}

function getBucketFromLocalDb(bucket, cb) {
  const instance = getInstance(bucket);
  return instance.iterate(cb);
}

// local operations to cache during network outage
const localOpLog = localForage.createInstance({
  name: 'lucidbyte',
  storeName: '_opLog'
});

/*
  Log all writes to client-side storage when offline.

  data = {
    action = String!,
    bucket = String!,
    key = String!,
    value = Any?
  }
 */
function logAction(data, socket) {
  if (socket.connected) {
    return Promise.resolve({});
  }
  const highRestTimestamp = (Date.now() + performance.now()) * 1000 + '';
  const entryId = highRestTimestamp;
  return localOpLog.setItem(entryId, data);
}

class OfflineEmitter {
  constructor() {
    this.emitter = new Emitter();
  }

  eventName(bucket, key) {
    return `${bucket}/${key}`;
  }

  on(bucket, key, cb) {
    const eventName = this.eventName(bucket, key);
    this.emitter.on(eventName, cb);
    // returns a cleanup function
    return () => this.emitter.off(eventName, cb);
  }

  emit(bucket, key, data = {}) {
    this.emitter.emit(this.eventName(bucket, key), data);
  }
}

const iterateListFromServer = (list, options, cb) => {
  // TODO: add support for all iteration options for offline iteration
  let _list = list;
  if (options.reverse) {
    _list = list.reverse();
  }
  _list.forEach(cb);
};

export default class Socket {
  constructor(config) {
    const {
      token,
      transports = ['websocket'],
      enableOffline = false
    } = config;
    const socketClientBasePath = serverApiBaseRoute;
    const io = require('socket.io-client');
    const socket = io(socketClientBasePath, {
      query: { token },
      secure: true,
      // force websocket as default
      transports
    });

    socket
      .on('connect', this.flushAndSyncLog);

    this.socket = socket;
    this.offlineEmitter = new OfflineEmitter();
    this.enableOffline = enableOffline;
  }

  isConnected() {
    return this.socket.connected;
  }

  subscribeBucket(params, cb) {
    const { socket } = this;
    const {
      bucket,
      limit,
      reverse,
      gt,
      lt,
      gte,
      lte,
      keys = true,
      values = true,
      onComplete,
      initialValue,
      query
    } = params;
    socket.emit(
      'subscribeBucket',
      { query, bucket, limit, gte, gt, lte, lt, reverse, keys, values,
        enableOffline: this.enableOffline, initialValue, once: !!onComplete
      },
      (eventId) => {
        let items = null;
        const fn = (data) => {
          if (data.done) {
            if (this.enableOffline) {
              iterateListFromServer(items, params, cb);
            }
            items = null;
            if (onComplete) {
              // stream foreach style.
              // streams results until completed, then removes listener on server
              socket.off(eventId, fn);
              onComplete();
            }
            return;
          }
          // we'll do local iteration for offline mode since offline mode
          // returns the entire dataset and ignores all options
          if (this.enableOffline) {
            items = items || [];
            items.push(data);
            return;
          }
          cb(data);
        };
        socket.on(eventId, fn);

        const shouldCache = this.enableOffline && !bucketsToIgnore[bucket];
        if (shouldCache) {
          socket.on(eventId, (data) => {
            if (data.done) return;
            debug('lucidbyte.subscribeBucket.offline')(data);
            persistToLocalDb(bucket, data.key, data.value, data.action);
          });
        }
      }
    );
    this.triggerCallbackIfOffline(cb, params);
  }

  subscribeKey(params, subscriber, onSubscribeReady) {
    const { socket } = this;
    const { bucket, key } = params;
    socket.emit(
      'subscribe',
      params,
      (eventId) => {
        socket.on(eventId, subscriber);
        if (this.enableOffline) {
          const offlineCb = (data) => {
            debug('lucidbyte.offline.subscribeKey')(data);
            persistToLocalDb(bucket, key, data.value, data.action);
          };
          socket.on(eventId, offlineCb);
        }
        // user eventId to remove listener later
        onSubscribeReady
          && onSubscribeReady(eventId, subscriber);
      }
    );
    this.triggerCallbackIfOffline(subscriber, params);
  }

  subscribe(params, subscriber, onSubscribeReady) {
    const { bucket, key } = params;
    this.offlineEmitter.on(bucket, key, (data) => {
      console.log('offline', data);
      persistToLocalDb(bucket, key, data.value);
      subscriber(data);
    });
    if (typeof params.key === 'undefined') {
      return this.subscribeBucket(params, subscriber);
    }
    this.subscribeKey(params, subscriber, onSubscribeReady);
  }

  put(params, cb) {
    const { bucket, key, value, _syncing } = params;
    const { socket } = this;

    if (!_syncing) {
      const logPromise = logAction({ action: 'put', bucket, key, value }, socket);
      if (!this.isConnected()) {
        this.offlineEmitter.emit(bucket, key, { value });
        return logPromise;
      }
    }

    const callback = cb || this.promisifySocket('put', params);
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  }

  patch(params, cb) {
    // accepts either `value` or `ops` property as the patch
    const { bucket, key, value, ops, _syncing } = params;
    const { socket } = this;
    const data = value || ops;

    if (!_syncing) {
      const entry = { action: 'patch', bucket, key, value: data };
      const logPromise = logAction(entry, socket);
      if (!this.isConnected()) {
        this.offlineEmitter.emit(bucket, key, { value: data });
        return logPromise;
      }
    }

    const callback = cb || this.promisifySocket('patch', params);
    /*
      NOTE: send data pre-stringified so we don't have to stringify it again for
      the oplog.
     */
    const opsAsString = JSON.stringify(data);
    socket.emit('patch', { bucket, key, ops: opsAsString }, callback);
    return callback.promise;
  }

  // gets the value once
  get(params, cb) {
    const { socket } = this;
    const callback = cb || this.promisifySocket('get', params);
    if (this.enableOffline) {
      params._ol = 1;
    }
    socket.emit('get', params, callback);
    return callback.promise;
  }

  // gets a stream then closes the observer on completion
  forEach(params, cb, onComplete) {
    const options = Object.assign({}, params, { onComplete });
    this.subscribeBucket(options, cb);
  }

  del(params, cb) {
    const { socket } = this;
    const { bucket, key } = params;

    if (!params._syncing) {
      const logPromise = logAction({ action: 'del', bucket, key }, socket);
      if (!this.isConnected()) {
        this.offlineEmitter.emit(bucket, key);
        return logPromise;
      }
    }

    const callback = cb || this.promisifySocket('del', params);
    socket.emit('delete', { bucket, key }, callback);
    return callback.promise;
  }

  close() {
    this.socket.close();
  }

  triggerCallbackIfOffline(cb, { bucket, key, query }) {
    if (!this.isConnected()) {
      const getBucket = typeof key === 'undefined';
      if (getBucket) {
        // TODO: add support for iteration options for offline iteration
        // return getBucketFromLocalDb(bucket, (value, key) => {
        //   cb({ value: queryData(query, value), key });
        // });
        return;
      }
      getFromLocalDb(bucket, key)
        .then(value => cb({ value: queryData(query, value), key }));
    }
    return cb;
  }

  promisifySocket(actionType, params = {}) {
    let promisifiedCallback;
    let fulfilled = false;
    const { bucket, key, query } = params;
    const promise = new Promise((resolve, reject) => {
      // default timeout handler to prevent callback from hanging indefinitely
      const timeout = (!this.offlineEnabled && !this.isConnected())
        ? setTimeout(reject, 5000)
        : 0;
      promisifiedCallback = ({ error, value }) => {
        if (fulfilled) {
          return;
        }
        fulfilled = true;
        if (error) reject(error);
        else {
          clearTimeout(timeout);
          /*
            NOTE: when offline is enabled, the backend will return the full
            pre-queried value so the client-side can cache it. All querying is
            then done on the client-side instead.
           */
          const valueToSend = this.enableOffline
            ? queryData(query, value)
            : value;
          if (this.enableOffline) {
            let valueToPersist;
            if (actionType === 'put') {
              valueToPersist = Promise.resolve(params.value);
            } else if (actionType === 'patch') {
              const fromLocalDb = getFromLocalDb(bucket, key);
              valueToPersist = fromLocalDb.then(value => {
                const ops = params.value || params.ops;
                return ops.reduce(applyReducer, value);
              });
            } else {
              valueToPersist = Promise.resolve(value);
            }
            valueToPersist.then(v => {
              debug('lucidbyte.promisify')(actionType, bucket, key, v);
              persistToLocalDb(bucket, key, v, actionType);
            });
          }
          resolve(valueToSend);
        }
      };
    });
    promisifiedCallback.promise = promise;
    if (this.enableOffline && !this.isConnected()) {
      if (actionType === 'get') {
        getFromLocalDb(bucket, key)
          .then(value => promisifiedCallback({ value, key }));
      }
    }
    return promisifiedCallback;
  }

  flushAndSyncLog = () => {
    console.log('sync');
    localOpLog.iterate((entry, key) => {
      const { action, ...params } = entry;
      params._syncing = true;
      this[action](params)
        .catch(console.error)
        .then(() => {
          localOpLog.removeItem(key);
        });
    });
  }
}
