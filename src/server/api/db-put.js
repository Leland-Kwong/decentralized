const getDbClient = require('./get-db');
const dbLog = require('./op-log');
const { encodeData } = require('../key-value-store/codecs');

module.exports = async function dbPut(data, fn) {
  const {
    bucket,
    key,
    value,
  } = data;
  const db = await getDbClient(bucket);
  const type = (value && (typeof value === 'object'))
    ? 'json'
    : 'string';
  // pre-encode the value so we can log it
  const putValue = encodeData({ type, value });
  dbLog.addEntry({ bucket, key, actionType: 'put', value: putValue });
  try {
    await db.put(key, putValue);
    fn && fn({});
  } catch(err) {
    require('debug')('db.put')(err);
    fn({ error: err.message });
  }
};
