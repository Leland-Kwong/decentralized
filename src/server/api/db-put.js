const KV = require('../key-value-store');
const { dbBasePath } = require('../config');
const delim = require('./delim');

const normalizePut = (value) => {
  if (value && typeof value === 'object') {
    return ['json', JSON.stringify(value)];
  }
  return ['string', value];
};

module.exports = dbLog => async function dbPut(data, fn) {
  const {
    bucket,
    key,
    value,
    patch
  } = data;
  const db = await KV(dbBasePath({ bucket }));
  const [type, normalizedValue] = normalizePut(value);

  const putValue = `${type}${delim.v}${normalizedValue}`;
  const logValue = patch ? `${type}${delim.v}${patch}` : putValue;
  const actionType = patch ? 'patch' : 'put';
  dbLog.addEntry({ bucket, key, actionType, value: logValue });
  try {
    await db.put(key, putValue);
    fn && fn({});
  } catch(err) {
    require('debug')('db.put')(err);
    fn({ error: err.message });
  }
};
