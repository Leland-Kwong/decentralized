// TODO: improve debuggability by by creating path-scoped (bucket/key) eventIds.
// TODO: during server syncing, we should also grab all change events from the oplog
// TODO: add support for bucket mutation events for granular bucket observing. #mvp #performance
// TODO: add support for listener removal for subscribers and offline listeners #mvp

const createEventId = require('../public/client/event-id');
const { freeUpEventId } = createEventId;
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

    this._bucket = '';
    this._key = '';
    this._filters = {};
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

  filter(filters) {
    const copy = this.clone();
    copy._filters = filters;
    return copy;
  },

  clone(root) {
    // prevent nested prototype
    const { __root } = this;
    if (!root && __root) {
      const copy = this.clone(__root);
      const { _bucket, _key, _filters } = this;
      Object.assign(copy, { _bucket, _key, _filters });
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

  _subscribeBucket(params, onData, onError, onComplete, onAcknowledge) {
    const args = arguments;
    const { socket } = this;
    const {
      bucket,
      once
    } = params;
    const eventId =
      params.eventId =
        createEventId(`subscribeBucket/${bucket}`, this.config.dev);
    let onSubscribeBucket = null;
    const cleanup = () => {
      freeUpEventId(eventId);
      socket.off(eventId, onSubscribeBucket);
    };
    onSubscribeBucket = (data) => {
      if (data.error) {
        return onError(data.error);
      }
      if (data.done) {
        if (onComplete) {
          onComplete();
        }
        if (once) {
          cleanup();
        }
        return;
      }
      onData(data);
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
    return cleanup;
  },

  _subscribeKey(params, onData, onComplete, onError, onAcknowledge) {
    const args = arguments;
    const { socket } = this;
    const { once } = params;
    const eventId =
      params.eventId =
        createEventId();
    let handler = null;
    const cleanup = () => {
      freeUpEventId(eventId);
      socket.off(eventId, handler);
    };
    handler = (data) => {
      const { done, error } = data;
      if (done && once) {
        onComplete();
        return cleanup();
      }
      if (error) {
        return onError(error);
      }
      onData(data);
    };
    socket[once ? 'once' : 'on'](eventId, handler);
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
    return cleanup;
  },

  subscribe(onData, onError = noop, onComplete = noop, onAcknowledge = noop) {
    const params = this._filters;
    const _params = this.setupParams(params);
    const isBucketPath = !_params.key.length;
    if (isBucketPath) {
      return this._subscribeBucket(_params, onData, onError, onComplete, onAcknowledge);
    }
    this._subscribeKey(_params, onData, onComplete, onError, onAcknowledge);
    return this;
  },

  put(value, cb) {
    const params = this.setupParams({ value });
    const { bucket, key } = params;
    const { socket } = this;

    const callback = this.promisifySocket('put', params, cb);
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  },

  patch(ops, cb) {
    const params = this.setupParams({ ops });
    const { bucket, key } = params;
    const { socket } = this;

    const callback = this.promisifySocket(cb);
    socket.emit('patch', { bucket, key, ops }, callback);
    return callback.promise;
  },

  // gets the value once
  get(cb) {
    const { socket } = this;
    const _params = this.setupParams();
    const callback = this.promisifySocket(cb);
    socket.emit('get', _params, callback);
    return callback.promise;
  },

  del(cb) {
    const { socket } = this;
    const _params = this.setupParams();

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
