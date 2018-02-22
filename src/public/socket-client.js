// TODO: add support for bucket mutation events for granular bucket observing. #mvp #performance
// TODO: add support for listener removal for subscribers and offline listeners #mvp
// TODO: generate eventid from client-side since events are scoped to each socket client. This also means we don't need to wait for acknowledgement of subscription, which may be a race condition due to incorrect ordering. #reliability

import createEventId from './client/event-id';
import localForage from 'localforage';
import Emitter from 'tiny-emitter';
import queryData from '../isomorphic/query-data';
import { applyReducer } from 'fast-json-patch';
import checkRange from '../isomorphic/check-key-range';
import {
  persistToLocalDb,
  getBucketFromLocalDb,
  getFromLocalDb
} from './client/localdb';
const { serverApiBaseRoute } = require('./client/config');

const bucketsToIgnore = {
  _oplog: true,
  _sessions: true
};

const noop = () => {};
let debug = () => noop;
if (process.env.NODE_ENV === 'dev') {
  debug = require('debug');
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
    const isRoot = key === '*';
    if (isRoot) {
      return;
    }
    const triggerBucketChange = () => this.emit(bucket, '*', data);
    persistToLocalDb(bucket, key, data.value, data.action)
      // if an error happens, we should rerender
      .catch(triggerBucketChange)
      .then(triggerBucketChange);
  }
}

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

  subscribeBucket(params, cb, onAcknowledge, onComplete) {
    const { socket, enableOffline } = this;
    const {
      bucket,
      limit,
      reverse,
      gt,
      lt,
      gte,
      lte,
      keys,
      values,
      initialValue,
      query,
      once
    } = params;
    const eventId =
      params.eventId =
        createEventId();
    const isInRange = checkRange(gt, gte, lt, lte);
    let count = 0;
    const onSubscribeBucket = (data) => {
      // ignore action frames
      if (data.action) {
        return;
      }
      if (data.done) {
        count = 0;
        if (onComplete) {
          if (once) {
            socket.off(eventId, onSubscribeBucket);
          }
          onComplete();
        }
        return;
      }
      // we'll do option filtering locally for offline mode since
      // offline mode returns the entire dataset
      if (this.enableOffline) {
        if (limit && count++ >= limit) return;
        if (!isInRange(data.key)) return;
      }
      cb(data);
    };

    const shouldCache = this.enableOffline && !bucketsToIgnore[bucket];
    if (shouldCache) {
      socket.on(eventId, (data) => {
        if (data.done) return;
        debug('lucidbyte.subscribeBucket.offline')(data);
        persistToLocalDb(bucket, data.key, data.value, data.action);
      });
    }
    const subscribeOptions = enableOffline
      /*
        NOTE
        For offline mode, only allow options that don't mutate the
        result set. This is important because offline mode needs the
        entire bucket for local database storage.
       */
      ? { bucket, reverse, keys: true, values: true }
      : { query, bucket, limit, gte, gt, lte, lt, reverse, keys, values,
        initialValue, once
      };
    subscribeOptions.eventId = eventId;
    socket.on(eventId, onSubscribeBucket);
    socket.emit(
      'subscribeBucket',
      subscribeOptions,
      onAcknowledge
    );
    socket.on('reconnect', () => {
      socket.emit('subscribe', subscribeOptions, onSubscribeBucket);
    });
    this.offlineEmitter.on(bucket, '*', (data) => {
      console.log('lucidbyte.offline.subscribeBucket', data);
      const iterateFn = ({ key, value }) => {
        cb({ value: queryData(query, value), key });
      };
      getBucketFromLocalDb(bucket, params, iterateFn, onComplete);
    });
    this.triggerCallbackIfOffline(cb, params, onComplete);
  }

  subscribeKey(params, onAcknowledge, subscriber) {
    const { socket } = this;
    const { bucket, key, once } = params;
    const eventId =
      params.eventId =
        createEventId();
    if (this.enableOffline) {
      const offlineCb = (data) => {
        debug('lucidbyte.offline.subscribeKey')(data);
        persistToLocalDb(bucket, key, data.value, data.action);
      };
      socket.on(eventId, offlineCb);
    }
    socket[once ? 'once' : 'on'](eventId, subscriber);
    socket.emit(
      'subscribe',
      params,
      onAcknowledge
    );
    socket.on('reconnect', () => {
      socket.emit('subscribe', params, subscriber);
    });
    this.offlineEmitter.on(bucket, key, (data) => {
      console.log('lucidbyte.offline.subscribe', data);
      subscriber(data);
    });
    this.triggerCallbackIfOffline(subscriber, params);
  }

  subscribe(params, subscriber, onComplete = noop, onAcknowledge = noop) {
    const { bucket, key } = params;
    require('debug')('lucidbyte.subscribe')(bucket, key);
    if (typeof params.key === 'undefined') {
      return this.subscribeBucket(params, subscriber, onAcknowledge, onComplete);
    }
    this.subscribeKey(params, subscriber, onAcknowledge);
  }

  put(params, cb) {
    const { bucket, key, value, _syncing } = params;
    const { socket } = this;

    if (!_syncing) {
      const logPromise = logAction({ action: 'put', bucket, key, value }, socket);
      if (!this.isConnected()) {
        this.offlineEmitter.emit(bucket, key, { value, action: 'put' });
        return logPromise;
      }
    }

    const callback = this.promisifySocket('put', params, cb);
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  }

  patch(params, cb) {
    // accepts either `value` or `ops` property as the patch
    const { bucket, key, value, ops, _syncing } = params;
    const { socket } = this;
    const patch = value || ops;

    if (!_syncing) {
      const entry = { action: 'patch', bucket, key, value: patch };
      logAction(entry, socket);
      if (!this.isConnected()) {
        const curValue = getFromLocalDb(bucket, key);
        return curValue.then(val => {
          const newValue = patch.reduce(applyReducer, val);
          this.offlineEmitter.emit(bucket, key, { value: newValue, action: 'patch' });
        });
      }
    }

    const callback = this.promisifySocket('patch', params, cb);
    /*
      NOTE: send data pre-stringified so we don't have to stringify it again for
      the oplog.
     */
    const opsAsString = JSON.stringify(patch);
    socket.emit('patch', { bucket, key, ops: opsAsString }, callback);
    return callback.promise;
  }

  // gets the value once
  get(params, cb) {
    const { socket } = this;
    const callback = this.promisifySocket('get', params, cb);
    let serverOptions = params;
    if (this.enableOffline) {
      serverOptions = { ...params };
      delete serverOptions.query;
    }
    socket.emit('get', serverOptions, callback);
    return callback.promise;
  }

  del(params, cb) {
    const { socket } = this;
    const { bucket, key } = params;

    if (!params._syncing) {
      const logPromise = logAction({ action: 'del', bucket, key }, socket);
      if (!this.isConnected()) {
        this.offlineEmitter.emit(bucket, key, { action: 'del' });
        return logPromise;
      }
    }

    const callback = this.promisifySocket('del', params, cb);
    socket.emit('delete', { bucket, key }, callback);
    return callback.promise;
  }

  close() {
    this.socket.close();
  }

  triggerCallbackIfOffline(cb, params, onComplete) {
    if (!this.enableOffline) {
      return;
    }
    const { bucket, key, query } = params;
    if (!this.isConnected()) {
      const getBucket = typeof key === 'undefined';
      if (getBucket) {
        return getBucketFromLocalDb(bucket, params, ({ key, value }) => {
          cb({ value: queryData(query, value), key });
        }, onComplete);
      }
      return getFromLocalDb(bucket, key)
        .then(value => cb({ value: queryData(query, value), key }));
    }
    return cb;
  }

  promisifySocket(
    actionType,
    params = {},
    // TODO: add support for callbackFn to invoke instead of promise
    // cb
  ) {
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
        clearTimeout(timeout);
        if (error) reject(error);
        else {
          if (this.enableOffline) {
            let valueToPersist;
            if (actionType === 'put') {
              valueToPersist = Promise.resolve(params.value);
            } else if (actionType === 'patch') {
              const fromLocalDb = getFromLocalDb(bucket, key);
              valueToPersist = fromLocalDb.then(value => {
                const ops = params.value || params.ops;
                console.log(value);
                return ops.reduce(applyReducer, value);
              }).catch((err) => {
                console.error('error', err, params);
              });
            } else {
              valueToPersist = Promise.resolve(value);
            }
            valueToPersist.then(v => {
              return persistToLocalDb(bucket, key, v, actionType);
            });
          }
          /*
            NOTE: when offline is enabled, the backend will return the full
            pre-queried value so the client-side can cache it. All querying is
            then done on the client-side instead.
           */
          const valueToSend = this.enableOffline
            ? queryData(query, value)
            : value;
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
