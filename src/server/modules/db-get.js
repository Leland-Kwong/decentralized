const { isDb } = require('../key-value-store');
const queryData = require('../../isomorphic/query-data');

module.exports = (db) => {
  if (!isDb(db)) {
    throw '[DB DELETE]: invalid db provided';
  }
  return async function dbGet ({
    bucket,
    key,
    query,
  }, fn) {
    try {
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
};
