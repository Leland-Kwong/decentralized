const queryData = require('../../isomorphic/query-data');
const Stream = require('../key-value-store/utils/stream');
const Debug = require('debug');
const dbNsEvent = require('./db-ns-event');

const debug = {
  streamError: Debug('evds.streamError'),
  subscribeError: Debug('evds.subscribeError')
};

const doneFrame = { done: 1 };
module.exports = async function dbSubscribe(
  params,
  onAcknowledge,
  client,
  db,
  subscriptions
) {
  const {
    eventId,
    bucket,
    key = '',
    initialValue = true,
    once = false,
    limit,
    query,
  } = params;
  const watchEntireBucket = key === '';
  /*
    Watch entire bucket. Naively triggers a new stream request whenever a change happens
    in order to make sure we grab the latest results represented by a query or filter.
   */
  if (watchEntireBucket) {
    const onStreamError = (error) => {
      client.emit(eventId, { error: error.message });
    };
    const onStreamEnd = () => client.emit(eventId, doneFrame);
    let streamedCount = 0;
    // leveldb treats {limit: -1} as no limit
    const normalizedLimit = limit === -1 ? Infinity : limit;
    const onData = (data, stream) => {
      streamedCount++;
      if (streamedCount >= normalizedLimit) {
        stream.destroy();
        streamedCount = 0;
      }
      const response = {};
      if (data.key) {
        response.key = data.key.key;
      }
      if (data.value) {
        response.value = queryData(query, data.value.parsed);
      }
      client.emit(eventId, response);
    };
    const bucketStream = () => () => {
      const stream = Stream(db, params, onData);
      if (once) {
        stream.then(onStreamEnd);
      }
      stream.catch(onStreamError);
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
            { value: queryData(query, currentValue) }
          );
        } catch(err) {
          debug.streamError(err);
        }
      }

      // setup subscription
      const onPut = (key, { value }) => {
        client.emit(
          eventId,
          { action: 'put', value: queryData(query, value) }
        );
      };
      const onDel = () => {
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
