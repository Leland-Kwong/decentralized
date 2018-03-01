const getDbClient = require('./get-db');
const deleteBucket = require('../utils/delete-bucket');

const dbDelete = async ({ bucket, key, storeName = 'client' }, fn) => {
  const db = await getDbClient(storeName);
  const deleteEntireBucket = typeof key === 'undefined';
  try {
    // TODO: 'delete range of keys' #mvp
    if (deleteEntireBucket) {
      await deleteBucket(db, bucket);
    } else {
      await db.delWithLog({ bucket, key });
    }
    fn({});
  } catch(err) {
    require('debug')('db.delete')(err);
    fn({ error: err });
  }
};

module.exports = dbDelete;
