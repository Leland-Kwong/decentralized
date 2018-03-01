const getDbClient = require('./get-db');
const { delWithLog } = require('../key-value-store');
const deleteBucket = require('../key-value-store/utils/delete-bucket');

const dbDelete = async ({ bucket, key, storeName = 'client' }, fn) => {
  const db = await getDbClient(storeName);
  const deleteEntireBucket = typeof key === 'undefined';
  try {
    // TODO: 'delete range of keys' #mvp
    if (deleteEntireBucket) {
      await deleteBucket(db, bucket);
    } else {
      await delWithLog(db, { bucket, key });
    }
    fn({});
  } catch(err) {
    require('debug')('db.delete')(err);
    fn({ error: err });
  }
};

module.exports = dbDelete;
