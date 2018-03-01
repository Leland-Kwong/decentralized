import checkRange from '../../isomorphic/is-value-in-range';
import queryData from '../../isomorphic/query-data';
import Emitter from 'tiny-emitter';
import { applyReducer } from 'fast-json-patch';

import {
  persistToLocalDb,
  getBucketFromLocalDb,
  getFromLocalDb,
  flushAndSyncLog,
  logAction
} from './localdb';

const bucketsToIgnoreLocalPersistence = {
  _oplog: true,
  _sessions: true
};

const offlineMethods = {};

function defineFunc(root, name, func) {
  root[name] = { value: func };
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

defineFunc(offlineMethods, 'subscribe', function(
  params, onData, onComplete, onAcknowledge
) {
  const _params = this.setupParams(params);
  const {
    bucket, query, gt, gte, lt, lte, limit,
    reverse, keys, values, initialValue, once
  } = _params;
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
  const isInRange = checkRange(gt, gte, lt, lte);
  let count = 0;
  const onDataProxy = (data) => {

    if (data.done) {
      count = 0;
      return onComplete();
    }

    if (!this.parent.isConnected()) {
      // TODO: only do this when we're offline
      // we'll do option filtering locally for offline mode since
      // offline mode returns the entire dataset
      if (limit && count++ >= limit) return;
      if (!isInRange(data.key)) return;
      onData(data);
    }
    // NOTE: we're online
    else {
      onData(data);
    }
  };

  // if (this.enableOffline) {
  //   const offlineCb = (data) => {
  //     debug('lucidbyte.offline.subscribeKey')(data);
  //     persistToLocalDb(bucket, key, data.value, data.action);
  //   };
  //   socket.on(eventId, offlineCb);
  // }

  const onOfflineBucketChange = () => {
    const iterateFn = ({ key, value }) => {
      onDataProxy({ value: queryData(query, value), key });
    };
    getBucketFromLocalDb(bucket, params, iterateFn, onComplete);
  };
  this.offlineEmitter.on(bucket, '*', onOfflineBucketChange);
  this.parent.subscribe(params, onDataProxy, onComplete, onAcknowledge);
  return this;
});

defineFunc(offlineMethods, 'put', function(params, cb) {
  const { _syncing, bucket, key, value } = this.setupParams(params);
  const { socket } = this.parent;
  if (!_syncing) {
    const logPromise = logAction({ action: 'put', bucket, key, value }, socket);
    if (!this.isConnected()) {
      this.offlineEmitter.emit(bucket, key, { value, action: 'put' });
      return logPromise;
    }
  }
  return this.parent.put(params, cb);
});

defineFunc(offlineMethods, 'patch', function(params) {
  const { _syncing, bucket, key, patch } = params;
  const { socket } = this;
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
});

defineFunc(offlineMethods, 'get', function(params) {
  let _params = this.setupParams(params);
  if (this.enableOffline) {
    _params = { ..._params };
    delete _params.query;
  }
});

defineFunc(offlineMethods, 'del', function(params) {
  const { socket } = this;
  const _params = this.setupParams(params);
  const { _syncing, bucket, key } = _params;
  if (!_syncing) {
    const logPromise = logAction({ action: 'del', bucket, key }, socket);
    if (!this.isConnected()) {
      this.offlineEmitter.emit(bucket, key, { action: 'del' });
      return logPromise;
    }
  }
});

/*
  TODO: modify promisifiedCallback with this code:

  if (this.enableOffline) {
    let valueToPersist;
    if (actionType === 'put') {
      valueToPersist = Promise.resolve(params.value);
    } else if (actionType === 'patch') {
      const fromLocalDb = getFromLocalDb(bucket, key);
      valueToPersist = fromLocalDb.then(value => {
        const ops = params.value || params.ops;
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

  if (this.enableOffline && !this.isConnected()) {
    if (actionType === 'get') {
      getFromLocalDb(bucket, key)
        .catch(console.warn)
        .then(value => promisifiedCallback({ value }));
    }
  }

  // NOTE: when offline is enabled, the backend will return the full
  // pre-queried value so the client-side can cache it. All querying is
  // then done on the client-side instead.
 */

export default function OfflineWrap(Socket) {
  const wrapped = Object.create(Socket, offlineMethods);
  Object.defineProperty(wrapped, 'parent', { value: Socket });
  wrapped.offlineEmitter = new OfflineEmitter();
  return wrapped;
}
