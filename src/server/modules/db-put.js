const getDbClient = require('./get-db');
const dbNsEvent = require('./db-ns-event');
const { validateKey, validateBucket } = require('./validate-db-paths.js');

module.exports = async function dbPut(data, fn) {
  const {
    bucket,
    key,
    value,
  } = data;
  // validate input
  if (process.env.NODE_ENV === 'development') {
    try {
      validateBucket(bucket);
      validateKey(bucket);
    } catch(err) {
      return fn({ error: err.message, type: 'inputValidation' });
    }
  }
  const db = await getDbClient(bucket);
  const type = (value && (typeof value === 'object'))
    ? 'json'
    : 'string';
  // pre-encode the value so we can log it
  const putValue = { type, value, actionType: 'put', bucket };
  try {
    await db.put(key, putValue);
    const event = dbNsEvent('put', bucket, key);
    db.emit(event, key, putValue);
    fn && fn({});
  } catch(err) {
    require('debug')('db.put')(err);
    fn({ error: err.message });
  }
};
