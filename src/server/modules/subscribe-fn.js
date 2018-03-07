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
    once = false,
    // set a base limit to prevent large lists from accidentally overloading the client
    limit = 1000,
    query,
    initialValue = true
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
    const bucketStream = (key, value, actionType) => {
      if (actionType) {
        const response = {
          event: actionType,
          value,
          key
        };
        client.emit(eventId, response);
        // if it was an action, we won't restream all the results
        return;
      }
      const stream = Stream(db, params, onData);
      if (once) {
        stream.then(onStreamEnd);
      }
      stream.catch(onStreamError);
    };

    if (initialValue) {
      bucketStream();
    }

    if (once) {
      return;
    }

    const changeEvent = dbNsEvent('change', bucket);
    db.on(changeEvent, bucketStream);
    function cleanup() {
      db.removeListener(changeEvent, bucketStream);
    }
    subscriptions.set(eventId, cleanup);
    client.on(`off.${eventId}`, cleanup);
  }
  // watch bucket/key
  else {
    try {
      if (initialValue) {
        try {
          const nsKey = { bucket, key };
          // emit initial value
          const currentValue = await db.get(nsKey);
          const response = { value: queryData(query, currentValue) };
          if (once) {
            response.done = 1;
          }
          client.emit(
            eventId,
            response
          );
        } catch(err) {
          debug.streamError(err);
          client.emit(eventId, { error: err.message });
        }
      }

      if (once) {
        return;
      }

      // setup subscription
      const onChange = (key, value, actionType) => {
        client.emit(
          eventId,
          { event: actionType, value: queryData(query, value) }
        );
      };
      const changeEvent = dbNsEvent('change', bucket, key);
      subscriptions.set(eventId, function cleanup() {
        db.removeListener(changeEvent, onChange);
      });
      db.on(changeEvent, onChange);
    } catch(err) {
      if (err.type === 'NotFoundError') {
        return;
      }
      debug.subscribeError(err);
      client.emit(eventId, { error: err.message });
    }
  }
};
