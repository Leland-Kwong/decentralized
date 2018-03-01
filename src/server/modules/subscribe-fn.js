const queryData = require('../../isomorphic/query-data');
const Stream = require('../key-value-store/utils/stream');
const getDbClient = require('./get-db');
const Debug = require('debug');
const dbNsEvent = require('./db-ns-event');

const debug = {
  streamError: Debug('evds.streamError'),
  subscribeError: Debug('evds.subscribeError')
};

const handleDbResponse = (query, value) => {
  return queryData(query, value);
};

const dbStreamHandler = (keys, values, query, cb) => {
  if (keys && values) {
    return (data) => {
      const value = handleDbResponse(query, data.value.parsed);
      cb({ key: data.key.key, value });
    };
  }
  if (!values) {
    return (key) => cb({ key: key.key });
  }
  if (!keys) {
    return (data) => {
      cb({ value: handleDbResponse(query, data.parsed) });
    };
  }
};

const doneFrame = { done: 1 };
module.exports = function createSubscribeFn(client, subscriptions) {
  return async function dbSubscribe(params, onAcknowledge) {
    const {
      eventId,
      bucket,
      key = '',
      gt,
      lt,
      gte,
      lte,
      keys = true,
      values = true,
      initialValue = true,
      once = false,
      query,
      storeName = 'client'
    } = params;
    const watchEntireBucket = key === '';
    let db;

    try {
      db = await getDbClient(storeName);
    } catch(err) {
      return onAcknowledge({ error: err.message });
    }

    const checkRange = require('./../../isomorphic/is-value-in-range');
    const isInRange = checkRange(gt, gte, lt, lte);
    // watch entire bucket
    if (watchEntireBucket) {
      const onStreamError = (error) => {
        client.emit(eventId, { error: error.message });
      };
      const onStreamEnd = () => client.emit(eventId, doneFrame);
      const onDataCallback = (data) => {
        client.emit(eventId, data);
      };

      const onData = dbStreamHandler(keys, values, query, onDataCallback);
      const bucketStream = (actionType) => (changeKey, newValue) => {
        if (
          'undefined' !== typeof changeKey
          && isInRange(changeKey)
        ) {
          const frame = { key: changeKey, action: actionType };
          if (actionType !== 'del') {
            frame.value = handleDbResponse(query, newValue);
          }
          client.emit(eventId, frame);
        }

        Stream(db, params, onData)
          .then(onStreamEnd)
          .catch(onStreamError);
      };

      if (initialValue) {
        bucketStream()();
      }

      if (once) {
        return;
      }

      const onPut = bucketStream('put');
      const onDelete = bucketStream('del');
      // listen to all opLog changes
      if (bucket === '_opLog') {
        const putEvent = dbNsEvent('put', bucket);
        db.on(putEvent, onPut);
        subscriptions.set(eventId, function cleanup() {
          db.removeListener(putEvent, onPut);
        });
      } else {
        const putEvent = dbNsEvent('put', bucket);
        db.on(putEvent, onPut);
        const delEvent = dbNsEvent('del', bucket);
        db.on(delEvent, onDelete);
        subscriptions.set(eventId, function cleanup() {
          db.removeListener(putEvent, onPut);
          db.removeListener(delEvent, onDelete);
        });
      }
    }
    // watch bucket/key
    else {
      try {
        if (initialValue) {
          try {
            const nsKey = { bucket, key };
            // emit initial value
            const currentValue = await db.get(nsKey);
            client.emit(
              eventId,
              { value: handleDbResponse(query, currentValue) }
            );
          } catch(err) {
            debug.streamError(err);
          }
        }

        // setup subscription
        const onPut = async (key, { value }) => {
          client.emit(
            eventId,
            { action: 'put', value: queryData(query, value) }
          );
        };
        const onDel = async () => {
          client.emit(eventId, { action: 'del' });
        };
        const putEvent = dbNsEvent('put', bucket, key);
        const delEvent = dbNsEvent('del', bucket, key);
        subscriptions.set(eventId, function cleanup() {
          db.removeListener(putEvent, onPut);
          db.removeListener(delEvent, onPut);
        });
        db.on(putEvent, onPut);
        db.on(delEvent, onDel);
      } catch(err) {
        if (err.type === 'NotFoundError') {
          return;
        }
        debug.subscribeError(err);
        client.emit(eventId, { error: err.message });
      }
    }
  };
};
