const { isDb, putWithLog } = require('../key-value-store');

module.exports = (db) => {
  if (!isDb(db)) {
    throw '[DB PUT]: invalid db provided';
  }
  return async function dbPut(data, fn) {
    const {
      bucket,
      key,
      value,
    } = data;
    const valueType = typeof value;
    const isPlainObject = (value && (valueType === 'object'));
    const type = isPlainObject
      ? 'json'
      : valueType;
    // pre-encode the value so we can log it
    const putValue = { type, value, actionType: 'put' };
    const putKey = { bucket, key };
    try {
      await putWithLog(db, putKey, putValue);
      fn && fn({});
    } catch(err) {
      require('debug')('evds.db.put')(err);
      fn({ error: err.message });
    }
  };
};
