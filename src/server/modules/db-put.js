const getDbClient = require('./get-db');

module.exports = async function dbPut(data, fn) {
  const {
    bucket,
    key,
    value,
    storeName = 'client'
  } = data;
  const db = await getDbClient(storeName);
  const type = (value && (typeof value === 'object'))
    ? 'json'
    : 'string';
  // pre-encode the value so we can log it
  const putValue = { type, value, actionType: 'put' };
  const putKey = { bucket, key };
  try {
    await db.putWithLog(putKey, putValue);
    fn && fn({});
  } catch(err) {
    require('debug')('db.put')(err);
    fn({ error: err.message });
  }
};
