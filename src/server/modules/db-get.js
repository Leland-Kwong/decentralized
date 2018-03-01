const queryData = require('../../isomorphic/query-data');
const getDbClient = require('./get-db');

module.exports = async function dbGet ({
  bucket,
  key,
  query,
  storeName = 'client'
}, fn) {
  try {
    const db = await getDbClient(storeName);
    const value = await db.get({ bucket, key });
    const response = queryData(query, value);
    fn({ value: response });
  } catch(err) {
    if (err.type === 'NotFoundError') {
      fn({ value: null });
      return;
    }
    require('debug')('evds.db.get')(err);
    fn({ error: err.message });
  }
};
