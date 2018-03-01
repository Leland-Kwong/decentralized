const Stream = require('./stream');

const deleteBucket = async function(db, bucket) {
  const keys = [];
  const onData = key => keys.push({ key, type: 'del' });
  await Stream(db, { bucket, values: false }, onData);
  return db.batchWithLog(keys);
};

module.exports = deleteBucket;
