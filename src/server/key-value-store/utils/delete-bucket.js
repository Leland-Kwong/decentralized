const Stream = require('./stream');
const { batchWithLog } = require('../');

/* Returns the number of items deleted */
const deleteBucket = async function(
  db,
  bucket,
  // used to limit memory pressure from large buckets
  batchSize = 5000,
  totalDeleteCount = 0
) {
  const keys = [];
  const onData = key => keys.push({ key, type: 'del' });
  try {
    const streamOptions = {
      bucket,
      values: false,
      limit: batchSize
    };
    await Stream(db, streamOptions, onData);
  } catch(err) {
    console.error(err);
  }
  try {
    await batchWithLog(db, keys);
    const newTotal = totalDeleteCount + keys.length;
    const mightHaveMoreToDelete = keys.length === batchSize;
    if (mightHaveMoreToDelete) {
      return deleteBucket(db, bucket, batchSize, newTotal);
    }
    return newTotal;
  } catch(err) {
    console.error(err);
  }
};

module.exports = deleteBucket;
