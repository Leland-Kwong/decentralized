import localForage from 'localforage';
const { serverApiBaseRoute } = require('./client/config');

const localOpLog = localForage.createInstance({
  name: '_opLog',
  dataStore: 'evds'
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

export default class Socket {
  constructor(config) {
    const {
      token,
      transports = ['websocket']
    } = config;
    const socketClientBasePath = serverApiBaseRoute;
    const io = require('socket.io-client');
    const socket = this.socket = io(socketClientBasePath, {
      query: { token },
      secure: true,
      // force websocket as default
      transports
    });

    socket
      .on('connect', this.flushAndSyncLog)
      .on('reconnect', this.flushAndSyncLog);
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
      initialValue
      // TODO: add support for `range` option to limit response to range of keys
    } = params;
    socket.emit(
      'subscribeBucket',
      { bucket, limit, gte, gt, lte, lt, reverse, keys, values,
        initialValue, once: !!onComplete
      },
      (eventId) => {
        // stream foreach style.
        // streams results until completed, then removes listener on server
        if (onComplete) {
          let i = 0;
          const fn = (data) => {
            if (data.done) {
              socket.off(eventId, fn);
              return onComplete();
            }
            cb(data, i);
            i++;
          };
          socket.on(eventId, fn);
        } else {
          socket.on(eventId, cb);
        }
      }
    );
  }

  subscribe(params, subscriber, onSubscribeReady) {
    const { socket } = this;
    if (typeof params.key === 'undefined') {
      return this.subscribeBucket(params, subscriber);
    }
    socket.emit('subscribe', params, (eventId) => {
      socket.on(eventId, subscriber);
      // user eventId to remove listener later
      onSubscribeReady
        && onSubscribeReady(eventId, subscriber);
    });
  }

  put(params, cb) {
    const { bucket, key, value, __noLog } = params;
    const { socket } = this;

    if (!__noLog) {
      const logPromise = logAction({ action: 'put', bucket, key, value }, socket);
      if (!this.isConnected()) {
        return logPromise;
      }
    }

    const callback = cb || this.promisifySocket();
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  }

  patch(params, cb) {
    // accepts either `value` or `ops` property as the patch
    const { bucket, key, value, ops, __noLog } = params;
    const { socket } = this;

    if (!__noLog) {
      const entry = { action: 'patch', bucket, key, value: value || ops };
      const logPromise = logAction(entry, socket);
      if (!this.isConnected()) {
        return logPromise;
      }
    }

    const callback = cb || this.promisifySocket();
    /*
      NOTE: send data pre-stringified so we don't have to stringify it again for
      the oplog.
     */
    const opsAsString = JSON.stringify(ops);
    socket.emit('patch', { bucket, key, ops: opsAsString }, callback);
    return callback.promise;
  }

  // gets the value once
  get(params, cb) {
    const { socket } = this;
    const callback = cb || this.promisifySocket();
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

    if (!params.__noLog) {
      const logPromise = logAction({ action: 'del', bucket, key }, socket);
      if (!this.isConnected()) {
        return logPromise;
      }
    }

    const callback = cb || this.promisifySocket();
    socket.emit('delete', { bucket, key }, callback);
    return callback.promise;
  }

  close() {
    this.socket.close();
  }

  promisifySocket() {
    let callback;
    const promise = new Promise((resolve, reject) => {
      const timeout = !this.isConnected() ? setTimeout(reject, 5000) : 0;
      callback = function promisified({ error, value }) {
        if (error) reject(error);
        else {
          clearTimeout(timeout);
          resolve(value);
        }
      };
    });
    callback.promise = promise;
    return callback;
  }

  flushAndSyncLog = () => {
    localOpLog.iterate((entry, key) => {
      const { action, ...params } = entry;
      this[action](params)
        .catch(console.error)
        .then(() => {
          localOpLog.removeItem(key);
        });
    });
  }
}
