// TODO: improve debuggability by by creating path-scoped (bucket/key) eventIds.
// TODO: make client isomorphic
// TODO: during server syncing, we should also grab all change events from the oplog
// TODO: add support for bucket mutation events for granular bucket observing. #mvp #performance
// TODO: add support for listener removal for subscribers and offline listeners #mvp

const createEventId = require('../public/client/event-id');
const noop = require('./noop');

const isServer = typeof window === 'undefined';

// set database key context
function keyFromBucket(key) {
  const copy = this.clone();
  copy._key = key;
  return copy;
}

const socketsByUrl = new Map();

class Socket {
  constructor(config) {
    const {
      dev = false
    } = config;
    this.config = config;
    this.config.dev = dev;
    this.connect();
  }
}

function connect() {
  const {
    token,
    transports = ['websocket'],
    uri,
    storeName,
  } = this.config;

  if ('undefined' === typeof uri) {
    throw `[SocketException] missing 'uri' parameter`;
  }

  // share the same connection if it already exists
  let socket = socketsByUrl.get(uri);
  if (!socket) {
    const io = require('socket.io-client');
    socket = io(uri, {
      query: { token, storeName },
      secure: true,
      // force websocket as default
      transports
    });

    const removeFromCache = () => socketsByUrl.delete(uri);
    const cleanup = () => {
      removeFromCache();
    };
    socket.once('disconnect', cleanup);
    socketsByUrl.set(uri, socket);

    if (!isServer) {
      window.addEventListener('focus', function connectIfNeeded() {
        // try to immediately reconnect
        if (!socket.connected) {
          socket.connect();
        }
      });
    }
  }

  this.socket = socket;
}

Object.assign(Socket.prototype, {
  connect,
  isConnected() {
    return this.socket.connected;
  },

  // set database bucket context
  bucket(bucketName) {
    const copy = this.clone();
    copy._bucket = bucketName;
    return copy;
  },

  clone(root) {
    // prevent nested prototype
    const { __root } = this;
    if (!root && __root) {
      const copy = this.clone(__root);
      copy._bucket = this._bucket;
      return copy;
    }
    const inst = root || this;
    // don't expose the `key` method if it already has a key context
    const proto = root ? {} : {
      __root: {
        value: inst
      },
      key: {
        value: keyFromBucket
      }
    };
    return Object.create(inst, proto);
  },

  _subscribeBucket(params, cb, onComplete, onAcknowledge) {
    const args = arguments;
    const { socket } = this;
    const {
      bucket,
      once
    } = params;
    const eventId =
      params.eventId =
        createEventId(`subscribeBucket/${bucket}`, this.config.dev);
    const onSubscribeBucket = (data) => {
      // ignore action frames
      if (data.action) {
        return;
      }
      if (data.done) {
        if (onComplete) {
          if (once) {
            socket.off(eventId, onSubscribeBucket);
          }
          onComplete();
        }
        return;
      }

      cb(data);
    };

    params.eventId = eventId;
    socket.on(eventId, onSubscribeBucket);
    socket.emit(
      'subscribeBucket',
      params,
      onAcknowledge
    );
    socket.once('disconnect', () => {
      socket.once('reconnect', () => {
        this._subscribeBucket(...args);
      });
    });
  },

  _subscribeKey(params, subscriber, onAcknowledge) {
    const args = arguments;
    const { socket } = this;
    const { once } = params;
    const eventId =
      params.eventId =
        createEventId();
    socket[once ? 'once' : 'on'](eventId, subscriber);
    socket.emit(
      'subscribe',
      params,
      onAcknowledge
    );
    socket.once('disconnect', () => {
      socket.once('reconnect', () => {
        this._subscribeKey(...args);
      });
    });
  },

  subscribe(params, subscriber, onComplete = noop, onAcknowledge = noop) {
    const _params = this.setupParams(params);
    // if first argument is a function, then that means params is not being passed in
    if (typeof params === 'function') {
      return this.subscribe(_params, params, subscriber, onComplete);
    }
    if (typeof _params.key === 'undefined') {
      return this._subscribeBucket(_params, subscriber, onComplete, onAcknowledge);
    }
    this._subscribeKey(_params, subscriber, onAcknowledge);
  },

  put(params, cb) {
    const { bucket, key, value } = this.setupParams(params);
    const { socket } = this;

    const callback = this.promisifySocket('put', params, cb);
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  },

  patch(params, cb) {
    // accepts either `value` or `ops` property as the patch
    const { bucket, key, value, ops } = this.setupParams(params);
    const { socket } = this;
    const patch = value || ops;

    const callback = this.promisifySocket(cb);
    socket.emit('patch', { bucket, key, ops: patch }, callback);
    return callback.promise;
  },

  // gets the value once
  get(params, cb) {
    const { socket } = this;
    const _params = this.setupParams(params);
    const callback = this.promisifySocket(cb);
    socket.emit('get', _params, callback);
    return callback.promise;
  },

  del(params, cb) {
    const { socket } = this;
    const _params = this.setupParams(params);

    const callback = this.promisifySocket(cb);
    socket.emit('delete', _params, callback);
    return callback.promise;
  },

  close() {
    this.socket.close();
  },

  // sets parameters that have set by chained methods
  setupParams(params) {
    params = (!params || ('object' !== typeof params))
      ? {}
      : params;
    params.bucket = params.bucket || this._bucket;
    params.key = params.key || this._key;
    return params;
  },

  inspect: require('../public/client/inspect-db')
});

Socket.prototype.promisifySocket = function(
  // TODO: add support for callbackFn to invoke instead of promise
  // cb
) {
  let promisifiedCallback;
  let fulfilled = false;
  const promise = new Promise((resolve, reject) => {
    // default timeout handler to prevent callback from hanging indefinitely
    const timeout = !this.isConnected()
      ? setTimeout(reject, 5000)
      : 0;
    promisifiedCallback = ({ error, value }) => {
      if (fulfilled) {
        return;
      }
      fulfilled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve(value);
    };
  });
  promisifiedCallback.promise = promise;
  return promisifiedCallback;
};

module.exports = Socket;
