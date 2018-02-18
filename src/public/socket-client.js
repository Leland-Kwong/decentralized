function promisifySocket() {
  let callback;
  const promise = new Promise(function (resolve, reject) {
    callback = function callback({ error, value }) {
      if (error) reject(error);
      else resolve(value);
    };
  });
  callback.promise = promise;
  return callback;
}

export default class Socket {
  constructor(socket) {
    this.socket = socket;
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
      onComplete
      // TODO: add support for `range` option to limit response to range of keys
    } = params;
    socket.emit(
      'subBucket',
      { bucket, limit, gte, gt, lte, lt, reverse, keys, values, once: !!onComplete },
      (eventId) => {
        // stream foreach style.
        // streams results until completed, then removes listener
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
    const { bucket, key } = params;
    if (typeof key === 'undefined') {
      return this.subscribeBucket(params, subscriber);
    }
    socket.emit('sub', {
      bucket,
      key
    }, (eventId) => {
      socket.on(eventId, subscriber);
      // user eventId to remove listener later
      onSubscribeReady
        && onSubscribeReady(eventId, subscriber);
    });
  }

  put({ bucket, key, value }, cb) {
    const { socket } = this;
    const callback = cb || promisifySocket();
    socket.emit('put', { bucket, key, value }, callback);
    return callback.promise;
  }

  patch({ bucket, key, ops }, cb) {
    const { socket } = this;
    const callback = cb || promisifySocket();
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
    const callback = cb || promisifySocket();
    socket.emit('get', params, callback);
    return callback.promise;
  }

  forEach(params, cb, onComplete) {
    const options = Object.assign({}, params, { onComplete });
    this.subscribeBucket(options, cb);
  }

  del(params, cb) {
    const { socket } = this;
    const { bucket, key } = params;
    const callback = cb || promisifySocket();
    socket.emit('delete', { bucket, key }, callback);
    return callback.promise;
  }

  close() {
    this.socket.close();
  }
}
