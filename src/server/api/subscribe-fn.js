const queryData = require('../../isomorphic/query-data');
const shortid = require('shortid');
const getDbClient = require('./get-db');
const Debug = require('debug');

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
      data.value = handleDbResponse(query, data.value);
      cb(data);
    };
  }
  if (!values) {
    return (key) => cb({ key });
  }
  if (!keys) {
    return (value) => cb({ value: handleDbResponse(query, value) });
  }
};

const doneFrame = { done: 1 };
module.exports = function createSubscribeFn(client, subscriptions) {
  return async function dbSubscribe({
    bucket,
    key = '',
    limit = -1,
    gt,
    lt,
    gte,
    lte,
    reverse = false,
    keys = true,
    values = true,
    initialValue = true,
    // If true, we will not subscribe to db changes, but instead stream out
    // the results and then emit a { done: 1 } frame. This allows the client to
    // do things like `forEach` once.
    once = false,
    query
  }, ack) {
    const keyToSubscribe = key;
    const watchEntireBucket = key === '';
    // a unique eventId for each subscription
    const eventId = shortid.generate();
    let db;

    try {
      db = await getDbClient(bucket);
      ack(eventId);
    } catch(err) {
      return ack({ error: err.message });
    }

    const checkRange = require('./../../isomorphic/check-key-range');
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
      const bucketStream = (actionType) => (changeKey, newValue) => {
        if (isInRange(changeKey)) {
          const frame = { key: changeKey, action: actionType };
          if (actionType !== 'del') {
            frame.value = handleDbResponse(query, newValue);
          }
          client.emit(eventId, frame);
        }

        const options = { limit, reverse, keys, values, gt, lt, gte, lte };
        const stream = db.createReadStream(options);
        stream.on(
          'data',
          dbStreamHandler(options.keys, options.values, query, onDataCallback)
        );
        stream.on('error', onStreamError);
        stream.on('end', onStreamEnd);
      };

      if (initialValue) {
        bucketStream()();
      }

      if (once) {
        return;
      }

      const onPutDecode = bucketStream('put');
      db.on('putDecode', onPutDecode);
      const onDelete = bucketStream('del');
      db.on('del', onDelete);
      subscriptions.set(eventId, function cleanup() {
        db.removeListener('putDecode', onPutDecode);
        db.removeListener('del', onDelete);
      });
    } else {
      try {
        if (initialValue) {
          try {
            // emit initial value
            const currentValue = await db.get(key);
            client.emit(
              eventId,
              { value: handleDbResponse(query, currentValue) }
            );
          } catch(err) {
            debug.streamError(err.message);
          }
        }

        // setup subscription
        const putCb = async (key, value) => {
          const ignore = !watchEntireBucket && key !== keyToSubscribe;
          if (ignore) return;
          client.emit(
            eventId,
            { action: 'put', key, value: queryData(query, value) }
          );
        };
        const delCb = async (key) => {
          const ignore = !watchEntireBucket && key !== keyToSubscribe;
          if (ignore) return;
          client.emit(eventId, { action: 'del', key });
        };
        subscriptions.set(eventId, function cleanup() {
          db.removeListener('putDecode', putCb);
          db.removeListener('del', delCb);
        });
        db.on('putDecode', putCb);
        db.on('del', delCb);
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
